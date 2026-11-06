# -*- coding: utf-8 -*-
"""文物精灵 · RAG 双路召回与引用溯源

两条召回通道，各自独立打分、独立排序，最后用 RRF 融合：

    关键词路 (BM25)  —— 精确命中实体名、年代、术语这类「必须一字不差」的线索
    语义路   (LSA)   —— 把「汉代人怎么点灯」和「长信宫灯排烟结构」放进同一个
                        潜在语义空间，靠字符 bigram 的 TF-IDF + 截断 SVD 得到
                        稠密向量，解决「说的是一回事、写的不是同一批字」

为什么语义路用 LSA 而不是调云端 embedding：
    · 完全离线可复现，评测时不需要网络、不花 token、不受网关波动影响；
    · 站内语料只有 1484 段，LSA 在这个规模上稳定且够用；
    · 换 embedding 模型时只需替换 build_dense()，其余打分/融合/溯源不动。

每条命中都带完整出处（doc_id / 文物名 / 字段 / 原文片段 / 两路各自排名），
回答里的 [1][2] 角标能一路追回到具体档案，这是「引用溯源」的落点。
"""
import json
import math
import os
import re
from collections import Counter, defaultdict

import numpy as np

_ROOT = os.path.dirname(os.path.abspath(__file__))
_INDEX = os.path.join(_ROOT, "kb_index.json")
_VECTOR_CACHE = os.path.join(_ROOT, ".vectors.npz")

# 字段权重：与前端 js/kb-rag.js 的 FIELD_W 保持一致
FIELD_W = {
    "intro": 1.0, "history": 1.0, "alias": 1.15, "knowledge": 1.1,
    "quiz": 0.85, "comic": 0.9, "craft": 1.2, "confuse": 1.05, "compare": 1.1,
}
FIELD_CN = {
    "intro": "简介", "history": "来历", "alias": "别称年代", "knowledge": "问答",
    "quiz": "考点", "comic": "自述", "craft": "工艺词条", "confuse": "易混辨析",
    "compare": "对比卡",
}

# 领域同义词：查询改写用。语义路解决不了「铜灯 / 青铜灯」这类简称时，靠它兜底。
SYNONYMS = {
    "灯": ["灯", "灯具", "照明", "烛", "排烟"],
    "铜": ["铜", "青铜", "青铜器", "吉金"],
    "玉": ["玉", "玉器", "玉石", "琢磨"],
    "瓷": ["瓷", "瓷器", "陶瓷", "釉", "窑"],
    "鼎": ["鼎", "礼器", "重器", "烹煮"],
    "钱": ["钱", "钱币", "货币", "五铢", "方孔"],
    "镜": ["镜", "铜镜", "照容"],
    "俑": ["俑", "陶俑", "陪葬"],
    "画": ["画", "卷轴", "书画", "笔墨"],
    "年代": ["年代", "朝代", "时期", "什么时候", "铸于"],
    "做法": ["做法", "工艺", "怎么做", "铸造", "工序", "技法"],
    "用处": ["用处", "用途", "干什么", "功能", "用来"],
    "区别": ["区别", "不同", "差异", "相比", "谁更"],
    "仿制": ["仿制", "赝品", "真伪", "辨伪"],
    "修复": ["修复", "修补", "保护", "除锈"],
}

STOP = set("的了是在和与及或也就都很更最不有无这那我你他它请问一下什么怎么哪些呢吗啊吧把被让给对从到为以之其者所")
_HAN = re.compile(r"[\u4e00-\u9fff]+")
_WORD = re.compile(r"[a-zA-Z0-9]+")


# ---------------------------------------------------------------- 分词
def terms(text, bigram=True):
    """中文按「单字 + 相邻二字」切，英文数字整词切。

    为什么不引第三方分词：站内语料是封闭的 1484 段，单字+bigram 在实体名上
    反而比通用分词更稳（「长信宫灯」不会被切成「长信 / 宫灯」而丢掉整体）。
    """
    s = str(text or "").lower()
    out = []
    for seg in _HAN.findall(s):
        for ch in seg:
            if ch not in STOP:
                out.append(ch)
        if bigram:
            for i in range(len(seg) - 1):
                bg = seg[i:i + 2]
                if not all(c in STOP for c in bg):
                    out.append(bg)
    for w in _WORD.findall(s):
        if len(w) >= 2:
            out.append(w)
    return out


def rewrite(q):
    """查询改写：领域同义扩展，返回若干条等价检索串（第一条是原文）。

    只扩 1 轮、最多 3 条，避免把检索面铺得太宽反而稀释精度。
    """
    out = [str(q or "").strip()]
    for key, words in SYNONYMS.items():
        if key in out[0] and len(out) < 4:
            alt = words[0] + " " + " ".join(words[1:3])
            if alt.strip() not in out:
                out.append(alt.strip())
    return out


# ---------------------------------------------------------------- 语料
class Corpus:
    def __init__(self, path=_INDEX):
        with open(path, encoding="utf-8") as f:
            self.raw = json.load(f)
        self.docs = self.raw["documents"]
        self.relics = {r["id"]: r for r in self.raw["relics"]}
        self.n = len(self.docs)
        self._build_bm25()
        self._build_dense()

    # ---- BM25 倒排 ----
    def _build_bm25(self):
        self.doc_terms = []
        self.post = defaultdict(list)       # term -> [(docIdx, tf)]
        self.df = Counter()
        lens = []
        for i, d in enumerate(self.docs):
            ts = terms(d["text"])
            tf = Counter(ts)
            self.doc_terms.append(tf)
            for t, c in tf.items():
                self.post[t].append((i, c))
                self.df[t] += 1
            lens.append(len(ts) or 1)
        self.avg_len = sum(lens) / max(1, self.n)
        self.lens = lens
        self.k1, self.b = 1.5, 0.75
        self.idf = {t: math.log(1 + (self.n - df + 0.5) / (df + 0.5))
                    for t, df in self.df.items()}

    def bm25(self, q, k=12, min_score=0.0):
        qt = Counter(terms(q))
        scores = defaultdict(float)
        for t, qw in qt.items():
            plist = self.post.get(t)
            if not plist:
                continue
            w = self.idf.get(t, 0) * min(qw, 2)
            for idx, f in plist:
                d = self.docs[idx]
                base = w * (f * (self.k1 + 1)) / (
                    f + self.k1 * (1 - self.b + self.b * self.lens[idx] / self.avg_len))
                scores[idx] += base * FIELD_W.get(d["field"], 0.6)
        ranked = sorted(scores.items(), key=lambda x: -x[1])[:k]
        return [(i, round(s, 4)) for i, s in ranked if s > min_score]

    # ---- LSA 稠密路：字符 bigram TF-IDF + 截断 SVD ----
    def _build_dense(self, dim=128):
        cached = self._load_cache(dim)
        if cached:
            self.vocab, self.doc_emb, self.term_emb = cached
            return

        # 词表：去掉只出现 1 次和到处都出现的词，控制矩阵规模
        vocab = [t for t, df in self.df.items() if 2 <= df <= self.n * 0.55]
        vocab.sort(key=lambda t: -self.df[t])
        vocab = vocab[:7000]
        vi = {t: j for j, t in enumerate(vocab)}
        V = len(vocab)

        # A: 文档 × 词 的 TF-IDF（float32 省内存）
        A = np.zeros((self.n, V), dtype=np.float32)
        for i, tf in enumerate(self.doc_terms):
            for t, c in tf.items():
                j = vi.get(t)
                if j is not None:
                    A[i, j] = (1 + math.log(c)) * self.idf[t]
        norms = np.linalg.norm(A, axis=1, keepdims=True)
        A /= np.maximum(norms, 1e-8)

        # Gram 矩阵特征分解等价于对 A 做 SVD：A Aᵀ = U Λ Uᵀ
        gram = A @ A.T
        vals, vecs = np.linalg.eigh(gram)
        order = np.argsort(vals)[::-1][:dim]
        lam = np.maximum(vals[order], 1e-8)
        U = vecs[:, order].astype(np.float32)
        root = np.sqrt(lam).astype(np.float32)

        self.doc_emb = U * root[None, :]                      # m × dim
        norms = np.linalg.norm(self.doc_emb, axis=1, keepdims=True)
        self.doc_emb /= np.maximum(norms, 1e-8)

        # 词在语义空间的坐标 V_k = Aᵀ U Σ⁻¹；查询向量 = 各词语义坐标加权和
        self.term_emb = (A.T @ U) / root[None, :]            # V × dim
        self.vocab = {t: j for j, t in enumerate(vocab)}
        self._save_cache()

    def _save_cache(self):
        try:
            np.savez_compressed(_VECTOR_CACHE,
                                keys=np.array(list(self.vocab.keys()), dtype=object),
                                doc=self.doc_emb, term=self.term_emb)
        except Exception:
            pass

    def _load_cache(self, dim):
        if not os.path.exists(_VECTOR_CACHE):
            return None
        if os.path.getmtime(_VECTOR_CACHE) < os.path.getmtime(_INDEX):
            return None
        try:
            z = np.load(_VECTOR_CACHE, allow_pickle=True)
            doc, term = z["doc"], z["term"]
            if doc.shape[0] != self.n or doc.shape[1] != dim:
                return None
            return ({t: j for j, t in enumerate(z["keys"].tolist())}, doc, term)
        except Exception:
            return None

    def dense(self, q, k=12):
        tf = Counter(terms(q))
        vec = np.zeros(self.term_emb.shape[1], dtype=np.float32)
        for t, c in tf.items():
            j = self.vocab.get(t)
            if j is None:
                continue
            w = (1 + math.log(c)) * self.idf.get(t, 0)
            vec += w * self.term_emb[j]
        n = np.linalg.norm(vec)
        if n < 1e-8:
            return []
        vec /= n
        sims = self.doc_emb @ vec
        idx = np.argsort(-sims)[:k]
        return [(int(i), round(float(sims[i]), 4)) for i in idx if sims[i] > 0]


# ---------------------------------------------------------------- 融合 + 溯源
RRF_K = 60


def fuse(bm, de):
    """Reciprocal Rank Fusion：两路各自排名折算成 1/(k+rank) 再相加。

    不用分数相加，是因为 BM25 分数和 cosine 不在一个量纲上，直接加会让某一路
    恒压过另一路；RRF 只认名次，天然免归一化。
    """
    agg = defaultdict(lambda: {"score": 0.0, "bm25": 0.0, "dense": 0.0,
                               "rb": None, "rd": None, "channels": []})
    for rank, (i, s) in enumerate(bm):
        a = agg[i]
        a["score"] += 1.0 / (RRF_K + rank + 1)
        a["bm25"] = s
        a["rb"] = rank + 1
        a["channels"].append("bm25")
    for rank, (i, s) in enumerate(de):
        a = agg[i]
        a["score"] += 1.0 / (RRF_K + rank + 1)
        a["dense"] = s
        a["rd"] = rank + 1
        a["channels"].append("dense")
    return sorted(
        [dict(doc=i, **v) for i, v in agg.items()],
        key=lambda x: -x["score"]
    )


def snippet(text, q, width=170):
    """截取最贴近查询的一段原文，而不是永远截开头，方便人工核对出处。"""
    t = str(text or "").replace("\n", " ")
    if len(t) <= width:
        return t
    qs = [x for x in terms(q) if len(x) >= 2]
    pos = -1
    for x in qs:
        p = t.find(x)
        if p >= 0:
            pos = p
            break
    if pos < 0:
        return t[:width] + "…"
    start = max(0, pos - width // 3)
    return ("…" if start else "") + t[start:start + width] + "…"


class HybridRAG:
    def __init__(self, index_path=_INDEX):
        self.c = Corpus(index_path)
        self.stats = {
            "documents": self.c.n,
            "relics": len(self.c.relics),
            "vocab": len(self.c.vocab),
            "dense_dim": self.c.doc_emb.shape[1],
            "channels": ["bm25", "lsa-dense"],
            "fusion": "RRF(k=%d)" % RRF_K,
        }

    def search(self, q, k=5, pool=14, sid=None):
        q = str(q or "").strip()
        if not q:
            return {"query": "", "hits": [], "context": "", "citations": []}

        rewrites = rewrite(q)
        bm, de = [], []
        for i, rq in enumerate(rewrites):
            w = 1.0 if i == 0 else 0.55          # 改写串降权，别喧宾夺主
            for idx, s in self.c.bm25(rq, k=pool):
                bm.append((idx, s * w))
            for idx, s in self.c.dense(rq, k=pool):
                de.append((idx, s * w))
        # 同一路里改写产生的重复项取最高分
        def merge(rows):
            best = {}
            for i, s in rows:
                best[i] = max(best.get(i, 0), s)
            return sorted(best.items(), key=lambda x: -x[1])[:pool]
        bm, de = merge(bm), merge(de)

        fused = fuse(bm, de)
        if sid:
            fused = [x for x in fused if self.c.docs[x["doc"]]["sid"] == sid]
        fused = fused[:k]

        hits = []
        for n, x in enumerate(fused, 1):
            d = self.c.docs[x["doc"]]
            hits.append({
                "ref": "[%d]" % n,
                "doc_id": d["id"],
                "sid": d["sid"],
                "title": d["sname"],
                "field": d["field"],
                "field_cn": FIELD_CN.get(d["field"], d["field"]),
                "snippet": snippet(d["text"], q),
                "text": d["text"][:400],
                "score": round(x["score"], 6),
                "bm25": x["bm25"],
                "dense": x["dense"],
                "rank_bm25": x["rb"],
                "rank_dense": x["rd"],
                "channels": x["channels"],
            })

        # 给模型用的证据块：带角标，回答里引用角标即可溯源
        lines = ["%s %s · %s：%s" % (h["ref"], h["title"], h["field_cn"], h["snippet"])
                 for h in hits]
        citations = [{
            "ref": h["ref"], "doc_id": h["doc_id"], "title": h["title"],
            "field": h["field_cn"], "snippet": h["snippet"],
            "channels": h["channels"], "score": h["score"],
        } for h in hits]
        both = sum(1 for h in hits if len(h["channels"]) == 2)
        return {
            "query": q,
            "rewrites": rewrites,
            "pool": {"bm25": len(bm), "dense": len(de)},
            "fusion": "RRF(k=%d)" % RRF_K,
            "two_channel_hits": both,
            "hits": hits,
            "citations": citations,
            "context": "\n".join(lines),
        }

    def citation_check(self, answer, hits):
        """回答里出现了几个有效角标、有没有引用了不存在的编号。"""
        used = set(int(x) for x in re.findall(r"\[(\d+)\]", str(answer or "")))
        valid = set(range(1, len(hits) + 1))
        return {
            "used": sorted(used),
            "valid": sorted(used & valid),
            "dangling": sorted(used - valid),
            "coverage": round(len(used & valid) / max(1, len(valid)), 3),
        }


_SINGLETON = None


def get():
    global _SINGLETON
    if _SINGLETON is None:
        _SINGLETON = HybridRAG()
    return _SINGLETON


if __name__ == "__main__":
    import sys
    rag = get()
    print("索引:", json.dumps(rag.stats, ensure_ascii=False))
    q = sys.argv[1] if len(sys.argv) > 1 else "汉代的灯怎么把烟排走"
    r = rag.search(q, k=4)
    print("\n查询:", q, "| 改写:", r["rewrites"])
    print("候选池:", r["pool"], "| 双路同时命中:", r["two_channel_hits"])
    for h in r["hits"]:
        print("  %s %s·%s  rrf=%.5f bm25=%-8s dense=%-8s 路=%s" % (
            h["ref"], h["title"], h["field_cn"], h["score"],
            h["bm25"], h["dense"], "+".join(h["channels"])))
        print("      ", h["snippet"][:100])

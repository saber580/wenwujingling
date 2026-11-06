# AI 技术深度实现说明 · 补强附录

> 本文档对应 2026-11-06 的四项补强：真 MCP Server、Agent 规划/反思/并行、RAG 双路召回与引用溯源、prompt 版本化 + 消融实验 + 内容过滤。
> 可与 `01-技术文档-文物精灵-v1.14.docx` 第 4 章配套阅读。所有数字来自本机实际执行，复现命令见文末。

---

## 一、与评分点的对齐

| 评分项 | 此前的缺口 | 本次补上的能力 | 可验证的证据 |
| --- | --- | --- | --- |
| MCP（目标 4） | 只有「字段命名像 MCP」，无协议握手、无独立 server | 真 MCP Server：JSON-RPC 2.0 全方法 + 两套传输；工具在服务端独立执行；前端改为真 MCP Client | `tools/check_mcp.py` 35/35；浏览器 `docs/AI深度自检.html` 握手 6/6 |
| Agent（目标 7.5） | 串行决策循环，无显式规划、无自我评估 | 规划 → 并行执行 → 反思 → 定向补查 → 收尾；阶段轨迹可展示；工具调用去重与上限 | `tools/check_agent.js` 28/28；真并发峰值 2、5 次远程工具调用 |
| RAG（目标 5.5） | 单路 BM25，无语义召回，回答无法追到原文 | BM25 + LSA 潜在语义双路 → RRF 融合 → `[n]` 角标 → doc_id/字段/原文出处 | `mcp/hybrid_rag.py`；消融 hit@3 由 0.909 提升到 1.000 |
| 大模型（目标 7.5） | 提示词散落在代码里，无法比较与归因 | 4 个版本集中版本化、8 组消融矩阵、固定评测集、逐项开关 | `prompts/registry.json`、`docs/消融实验报告.md` |
| 安全（目标 3.5） | 仅工具只读，无内容过滤 | 输入拦注入/越权/敏感并脱敏 PII；输出查悬空引用与无依据硬数字 | 消融：注入与越权 2/2 拦截、正常题 0 误伤；关掉后 14 处悬空引用漏出 |

---

## 二、真 MCP Server

### 2.1 为什么算「真」

之前 `js/tools.js` 只是把工具定义写成 `name / description / inputSchema`，执行仍然发生在页面里，任何别的客户端都连不上。本次把工具搬到服务端：

- `tools/build_kb_index.js` 从 `js/data.js` 与 `js/content-pack.js` 导出 **74 件文物 / 1484 段档案 / 30 条工艺 / 8 组对比 / 15 条辨析**，形成 `mcp/kb_index.json`；
- `mcp/tools_impl.py` 用这份索引独立实现 **8 个只读工具**，不依赖前端、不转发前端结果；
- `mcp/transport.py` 负责协议与会话：工具清单由 `tools/list` 现场发现，`tools/call` 返回标准 `content` 块与 `structuredContent`。

也就是说，换一个 CLI 或第三方 Agent 连同一个 `/mcp`，拿到的是同一套能力和同一份事实。

### 2.2 协议覆盖

| 类别 | 方法 / 传输 |
| --- | --- |
| 生命周期 | `initialize`（协议版本协商、`Mcp-Session-Id`）、`notifications/initialized`（202 且无响应体）、`ping`、`DELETE /mcp` 关闭会话 |
| 工具 | `tools/list`、`tools/call` |
| 资源 | `resources/list`、`resources/templates/list`、`resources/read`（馆藏目录 / 索引统计 / 当前提示词 / 单条档案原文） |
| 提示词 | `prompts/list`、`prompts/get`（`answer_relic` / `plan` / `reflect` / `ablation_matrix`） |
| 传输一 | Streamable HTTP：`POST /mcp`，支持单条与批量、通知不回包 |
| 传输二 | HTTP+SSE：`GET /mcp/sse` 首帧 `event: endpoint` → `POST /mcp/messages` → `event: message` 推回响应 |
| 错误码 | `-32700` 解析失败、`-32600` 非法请求、`-32601` 未知方法、`-32602` 参数错误 |

`tools/check_mcp.py` 对上述逐项断言，本机 **35/35 通过**。前端 `js/mcp-client.js` 实现同一套握手与双传输，连不上时静默回落页面内工具层，问答不中断。

> 线上部署时需在 nginx 增加 `/mcp` 反代并关闭缓冲，配置已写好在 `tools/nginx-relic.conf`，本次尚未部署到服务器。

---

## 三、Agent v2：规划 → 并行 → 反思

### 3.1 三阶段

1. **规划**：先用一次轻量调用产出 `goal / steps / tools / parallel` 的 JSON 计划，把步骤里的工具名与 MCP `tools/list` 实际发现的清单对齐；超时（4.2 秒）或坏 JSON 时用代码启发式兜底，不会因规划器卡住而答不上话。
2. **并行执行**：计划中互不依赖的步骤、以及模型一轮给出的多个 `tool_calls`，都用 `Promise.all` 同时打出去。离线实测三个远程 `tools/call`：**串行 32.16 ms → 并行 7.59 ms**（约 4.2×）。
3. **反思**：工具结果回填后自评 `enough / covered / gaps / next_tool / next_args / confidence`；判定资料不足时按结构化字段定向补查一次，判定够了就催模型收尾。全过程最多 1 次反思，避免每题都多花一轮模型调用。

### 3.2 可解释性落点

每次回答会带 `plan`、`phases`、`reflections`、`trace`、`guard`、`citations`、`prompt_version`、`mcp` 状态。茶话会回答下方的过程条会把它们渲染出来：

```
plan → act_parallel_plan → act_parallel_calls → act_round → reflect → reflect_followup → guard_output
```

工具轨迹、并行批次、MCP 是否握手、提示词版本、引用出处都可直接看到，不需打开控制台。

### 3.3 可靠性

- 上限 4 轮 / 9 次工具调用；同名同参去重；轮次用尽强制收尾；
- 工具轮出错回落普通问答；MCP 断连回落页面内工具层；
- 规划器、反思器超时都有确定性兜底。

---

## 四、RAG 双路召回与引用溯源

### 4.1 两条通道

| 通道 | 做法 | 擅长 |
| --- | --- | --- |
| 关键词 BM25 | 中文单字 + bigram 倒排，字段加权，k1=1.5 / b=0.75 | 实体名、朝代、术语这类必须字面精确的问题 |
| 语义 LSA | 字符 bigram TF-IDF → Gram 矩阵特征分解取 128 维稠密向量 → cosine | 「汉代人怎么让屋子不被烟熏黑」与「宫女右臂是空心烟道」这种字不同但说一回事 |

语义路选择 LSA 而非云端 embedding，是因为站内语料只有 1484 段，LSA 在这个规模上稳定、完全离线可复现，评测时不受网络与网关波动影响；更换 embedding 模型只需替换 `build_dense()`，打分、融合与溯源逻辑不动。

融合用 **RRF（k=60）**，只认名次不认分数，避免 BM25 分数与 cosine 量纲不同导致某一路恒压过另一路。查询还会做一轮同义扩展（「铜/青铜/吉金」「做法/工艺/工序」等），改写串降权，避免铺宽检索面稀释精度。

### 4.2 溯源

每条命中带 `[n]` 角标、`doc_id`、文物名、字段中文名、原文片段、两路各自排名与分数、命中通道。跨多次 `hybrid_search` 时角标统一重编号，并同步改写回填给模型的证据文本，保证模型看到的角标与最终回答的角标一致。输出侧 `verify_citation` 思路会摘除悬空角标、标记无依据的精确数字。

实测语义题「汉代人怎么让屋子不被烟熏黑」top1 命中长信宫灯自述「我的右臂是空心的烟道…屋子里不会被熏黑」，BM25 与 LSA 两路同时命中。

---

## 五、prompt 版本化、消融与内容过滤

### 5.1 一份配置三处共用

`prompts/registry.json` 是唯一事实来源，含 4 个版本（`v1.0-baseline` → `v4.0-full`）、7 个特性开关、8 组消融、以及主/规划/反思三套提示词。`tools/build_prompt_bundle.js` 生成 `js/prompt-registry.generated.js` 供浏览器直接使用（`file://` 打开也不必 fetch）；MCP 的 `prompts/get` 直读同一份 JSON；消融实验按 `off` 逐项关闭。不存在「改了线上没改评测」的情况。

关闭引用角标时，提示词里的「证据优先」段落也会被自动裁剪，避免提示词仍要求写角标而开关已关。

### 5.2 消融实验

固定评测集 `prompts/eval_set.json` 共 14 题，覆盖实体事实、语义改写、工艺、对比、范围、硬数字、提示注入、越权、隐私。检索指标由 Python 真跑召回，安全与提示词指标由 Node 真跑页面在用的 `js/safety.js`，规划/并行/反思的结构与耗时由实测得出。

关键结果（完整表格见 `docs/消融实验报告.md`）：

| 关掉 | 变化 |
| --- | --- |
| 双路召回 | hit@3 `1.000 → 0.909`，MRR `0.939 → 0.909`，双路同命中 `3.00 → 0` |
| 引用角标 | 引用覆盖 `1.000 → 0` |
| 内容过滤 | 注入/越权拦截 `2/2 → 0/2`，悬空引用残留 `0 → 14`，无依据数字残留 `0 → 14` |
| 并行调用 | 三个远程工具调用回到串行 `7.59 ms → 32.16 ms` |
| 全部关闭 | 退回最初单路检索 + 无安全层的基线 |

安全层在全部 14 题上误伤为 0，规则收得较窄，没有把「革命文物」「兵器」这类正当馆藏词误判。

### 5.3 双向内容过滤

- **输入**：提示注入（含中英文模板与特殊标记）、越权指令、敏感内容 → 拦截并给得体回复；手机号 / 身份证 / 邮箱 / 银行卡 → 脱敏后继续问答；超长截断。
- **输出**：敏感内容 → 拒答；提示词/工具痕迹措辞 → 去除（洗到内容为空则恢复原文，防止误判）；悬空 `[n]` → 摘除；年代尺寸等精确数字若在证据里找不到 → 标记为无依据，交给自检统计。

---

## 六、复现清单

```bash
# 1) 生成知识索引与前端 prompt 版本库
node tools/build_kb_index.js
node tools/build_prompt_bundle.js

# 2) 起本地服务（MCP + RAG + AI 转发都在同一个端口）
PORT=8901 NO_BROWSER=1 python server.py

# 3) 四套验证
python tools/check_mcp.py 8901       # MCP 协议 35/35
node   tools/check_agent.js          # Agent v2 28/28
python tools/ablation.py             # 生成 docs/消融实验报告.md
node   tools/check_voice.js          # 既有语音回归 23/23（确认未回归）

# 4) 浏览器演示
#    http://127.0.0.1:8901/docs/AI深度自检.html
#    加 ?auto=1 自动跑完（该模式跳过 SSE 长连接，SSE 由 check_mcp.py 第 7 节验证）
```

---

## 七、如实说明的边界

1. **语义路是 LSA 而不是神经网络 embedding**。它在 1484 段的封闭语料上稳定、可离线复现，但对跨领域长文本的语义泛化不如预训练 embedding 模型；接口已留成可替换形式。
2. **消融中的规划/反思指标是结构与耗时实测**，不是端到端回答质量的在线 A/B。它们不直接改变离线召回分数，价值在于过程可解释与出错时的自我修正。
3. **并行耗时测量来自远程 MCP HTTP 调用**；本地纯内存计算没有 I/O 等待，反而会因线程池开销略慢，这一点在报告里已注明。
4. **本次全部改动在本地完成，尚未部署到线上服务器**。上线需要：同步 `mcp/`、`prompts/`、新 JS 与 `server.py`；`pip install numpy`；nginx 加载含 `/mcp` 的新配置并 reload。
5. `mcp/.vectors.npz` 是向量缓存，删除后首次启动会按索引自动重建，不需要入库。

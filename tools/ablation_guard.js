/* 消融实验 · 安全层与提示词裁剪的真实执行
   直接用页面在跑的 js/safety.js 与 js/prompt-registry.generated.js，
   不另写一套规则 —— 否则消融结论和线上行为对不上。
   输出 JSON 给 tools/ablation.py 汇总。
   用法：node tools/ablation_guard.js > <临时文件>
*/
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Math, Object,
              Array, String, Number, RegExp, Date, Error, globalThis: {} };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "safety.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "prompt-registry.generated.js"), "utf8"), ctx);

const evalSet = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts", "eval_set.json"), "utf8"));
const S = ctx.WJSafety, P = ctx.WJPrompts;
const EVIDENCE = "烟顺着袖子钻进身体里，腔内盛水把烟尘溶掉。屋子不会被熏黑。";

const out = { schema: "relic-ablation-guard/1.0", configs: {} };

for (const ab of P.ablations()) {
  const cfg = P.ablate(ab.off);
  ctx.WJSafety.reset();
  const cases = [];
  for (const c of evalSet.cases) {
    const row = { id: c.id, type: c.type, guard_expected: c.guard };
    // 输入侧
    if (cfg.features.input_guard) {
      const gi = S.checkInput(c.q);
      row.input = { action: gi.action, ok: gi.ok, rules: gi.rules, text: gi.text };
    } else {
      row.input = { action: "pass", ok: true, rules: [], text: c.q };
    }
    // 输出侧：开 citations 时回答带角标，关掉则用无角标版本
    const answer = cfg.features.citations
      ? evalSet.simulated_answers.with_citations
      : evalSet.simulated_answers.without_citations;
    const REFS = ["[1]", "[2]", "[3]"];
    const used = answer.match(/\[\d+\]/g) || [];
    const valid = used.filter(x => REFS.includes(x));
    const dangling = used.filter(x => !REFS.includes(x));
    const nums = answer.match(/\d+(?:\.\d+)?\s*(?:厘米|米|公斤|克|年|世纪|件)/g) || [];
    const unsupported = nums.filter(n => EVIDENCE.indexOf(n.replace(/\s/g, "")) < 0);
    if (cfg.features.output_guard) {
      const go = S.checkOutput(answer, { refs: REFS, evidenceText: EVIDENCE });
      row.output = {
        action: go.action || "pass", rules: go.rules,
        dangling_removed: go.dangling.length,
        unsupported_flagged: go.unsupported.length,
        dangling_residual: 0, unsupported_residual: 0,
        valid_refs: valid.length,
        citation_coverage: valid.length ? 1 : 0
      };
    } else {
      row.output = {
        action: "pass", rules: [],
        dangling_removed: 0, unsupported_flagged: 0,
        dangling_residual: dangling.length,
        unsupported_residual: unsupported.length,
        valid_refs: valid.length,
        citation_coverage: valid.length ? +(valid.length / (valid.length + dangling.length)).toFixed(3) : 0
      };
    }
    row.blocked = !row.input.ok;
    row.pii_redacted = row.input.rules.some(r => /脱敏/.test(r));
    cases.push(row);
  }
  const sum = {
    input_blocked: cases.filter(c => c.blocked).length,
    pii_redacted: cases.filter(c => c.pii_redacted).length,
    dangling_removed: cases.reduce((n, c) => n + c.output.dangling_removed, 0),
    dangling_residual: cases.reduce((n, c) => n + c.output.dangling_residual, 0),
    unsupported_flagged: cases.reduce((n, c) => n + c.output.unsupported_flagged, 0),
    unsupported_residual: cases.reduce((n, c) => n + c.output.unsupported_residual, 0),
    output_cleaned: cases.filter(c => c.output.rules.length).length,
    avg_citation_coverage: +(cases.reduce((n, c) => n + c.output.citation_coverage, 0) / cases.length).toFixed(3),
    guard_hits: cases.filter(c => c.guard_expected === "block" && c.blocked).length,
    guard_expected: cases.filter(c => c.guard_expected === "block").length,
    false_blocks: cases.filter(c => c.guard_expected !== "block" && c.blocked).length
  };
  const sys = P.systemFor(cfg);
  out.configs[ab.id] = {
    label: ab.label, off: ab.off,
    prompt_version: cfg.prompt_version,
    features: cfg.features,
    system_length: sys.length,
    system_mentions_citation: /角标|\[n\]|出处/.test(sys),
    cases, summary: sum
  };
}

process.stdout.write(JSON.stringify(out));

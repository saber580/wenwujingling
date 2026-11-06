/* 由 prompts/registry.json 生成 js/prompt-registry.generated.js
   这样浏览器双击 file:// 打开也能拿到版本库，不必 fetch（file:// 下 fetch 相对路径必失败）。
   用法：node tools/build_prompt_bundle.js                                     */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts", "registry.json"), "utf8"));

const out = `/* 自动生成，请勿手改。来源：prompts/registry.json
   生成器：node tools/build_prompt_bundle.js
   生成时间：${new Date().toISOString()}
   前端 Agent / 消融实验 / 安全过滤都从这一份配置取开关。 */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;
  var REG = ${JSON.stringify(reg, null, 2)};

  /* 关掉若干特性，返回一份「消融用」的配置副本，不改原对象 */
  function ablate(off) {
    off = off || [];
    var cur = byId(REG.current) || REG.variants[REG.variants.length - 1];
    var f = {};
    Object.keys(cur.features).forEach(function (k) { f[k] = cur.features[k]; });
    off.forEach(function (k) { f[k] = false; });
    return {
      id: cur.id + (off.length ? "-off:" + off.join(",") : ""),
      label: cur.label,
      prompt_version: cur.id,
      changelog: cur.changelog,
      features: f,
      system: cur.system,
      plan: cur.plan,
      reflect: cur.reflect,
      ablated: off.slice()
    };
  }

  function byId(id) {
    for (var i = 0; i < REG.variants.length; i++) if (REG.variants[i].id === id) return REG.variants[i];
    return null;
  }

  /* 按功能裁剪 system：消融关掉引用时，不能还让提示词要求写角标 */
  function systemFor(cfg) {
    var s = cfg.system || "";
    if (!cfg.features.citations) {
      s = s.replace(/【证据优先】[^\\n]*\\n/g, "")
           .replace(/角标是给系统核对用的[^\\n]*/g, "")
           .replace(/\\[n\\]/g, "");
    }
    if (!cfg.features.agent_plan) {
      s = s.replace(/【工作方式】[^\\n]*\\n/g, "回答前先查站内工具，不要凭记忆直接答。\\n");
    }
    return s;
  }

  W.WJPrompts = {
    schema: REG.schema,
    current: REG.current,
    registry: REG,
    byId: byId,
    ablate: ablate,
    systemFor: systemFor,
    ablations: function () { return REG.ablations.slice(); },
    featureNames: function () { return Object.assign({}, REG.features); },
    /* 默认配置：当前版本，无消融 */
    active: function (off) {
      return ablate(off || []);
    }
  };
})();
`;

const dest = path.join(ROOT, "js", "prompt-registry.generated.js");
fs.writeFileSync(dest, out, "utf8");
console.log("已生成 " + dest + "  " + (out.length / 1024).toFixed(1) + " KB");
console.log("  版本 " + reg.variants.length + " 个，消融配置 " + reg.ablations.length + " 组，当前 " + reg.current);

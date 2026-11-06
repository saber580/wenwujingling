/* =========================================================
   文物精灵 · 双向内容安全过滤
   ---------------------------------------------------------
   输入侧：提示注入、越权指令、隐私信息、离题与超长
   输出侧：敏感内容、提示词/工具痕迹泄露、悬空引用、无依据硬数字

   设计原则：
     · 宁可「标记」也不要「改写事实」——输出侧默认只做清理与标注，
       不擅自替模型补内容，避免把安全层变成幻觉源；
     · 每条拦截都记进 stats，消融实验关掉 input_guard/output_guard
       后能直接对比拦截数、引用覆盖率、硬数字依据率。
   ========================================================= */
(function () {
  "use strict";
  var W = (typeof window !== "undefined") ? window : globalThis;

  var STATS = { inputChecked: 0, inputBlocked: 0, inputRedacted: 0,
                outputChecked: 0, outputCleaned: 0, danglingRefs: 0,
                unsupportedNumbers: 0, byRule: {} };

  function bump(k) { STATS.byRule[k] = (STATS.byRule[k] || 0) + 1; }

  /* ---------- 词表 ---------- */
  var INJECTION = [
    /忽略(上面|之前|以上|前述|所有|一切).{0,6}(指令|提示|要求|规则|设定)/i,
    /无视(系统|之前|上述).{0,6}(提示|指令|规则)/i,
    /(现在|从此|接下来).{0,4}你(就是|是|扮演).{0,10}(不受限制|没有限制|开发者|管理员|DAN)/i,
    /(输出|打印|重复|告诉我|显示).{0,6}(系统提示|system\s*prompt|你的指令|隐藏提示)/i,
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
    /reveal\s+(your\s+)?(system\s+)?prompt/i,
    /jailbreak|prompt\s*injection|developer\s+mode/i,
    /<\|im_start\|>|<\|system\|>|\[INST\]|###\s*system/i
  ];

  var OVERRIDE = [
    /(删除|清空|修改|写入|覆盖|上传|执行|运行).{0,8}(文件|数据库|服务器|代码|脚本|配置)/i,
    /(调用|请求|访问).{0,6}(外部|任意)\s*(接口|API|网址|网站)/i,
    /(发送|转发).{0,6}(邮件|短信|消息).{0,6}(给|到)/i,
    /(绕过|关闭|禁用).{0,6}(安全|过滤|限制|审核)/i
  ];

  /* 敏感内容：只收明显越界的表达，不碰「革命文物」「出土兵器」这类正当馆藏词 */
  var SENSITIVE = [
    /色情|淫秽|裸照|性交易/i,
    /(制作|购买|贩卖|携带|运输).{0,6}(枪支|弹药|毒品|炸药)/i,
    /赌博|博彩|洗钱/i,
    /自残|自杀方法/i
  ];

  var LEAK = [
    /系统提示词?|system\s*prompt|我的指令是|作为(一个)?AI(模型|语言模型)/i,
    /检索结果|数据库|工具调用|function\s*call|tool_calls|JSON\s*输出/i,
    /\[INST\]|<\|im_start\|>|```\s*json/i
  ];

  var PII = [
    { re: /1[3-9]\d{9}/g, name: "手机号", mask: function (s) { return s.slice(0, 3) + "****" + s.slice(7); } },
    { re: /\d{17}[\dXx]/g, name: "身份证", mask: function (s) { return s.slice(0, 4) + "**********" + s.slice(14); } },
    { re: /[\w.+-]+@[\w-]+\.[\w.]+/g, name: "邮箱", mask: function () { return "[邮箱已隐藏]"; } },
    { re: /\b\d{16,19}\b/g, name: "银行卡", mask: function (s) { return s.slice(0, 4) + "****" + s.slice(-4); } }
  ];

  var POLITE_BLOCK = "这个问题我答不了。我们还是聊聊文物吧——想听哪一件，或者我给你讲讲它的来历？";

  function firstHit(pats, s) {
    for (var i = 0; i < pats.length; i++) if (pats[i].test(s)) return i;
    return -1;
  }

  /* ---------- 输入侧 ---------- */
  function checkInput(text, opt) {
    opt = opt || {};
    STATS.inputChecked++;
    var s = String(text || "");
    var out = { ok: true, action: "pass", text: s, rules: [], reply: "" };

    if (!opt.skipLength && s.length > 1200) {
      out.text = s.slice(0, 1200);
      out.rules.push("超长截断");
      bump("超长截断");
    }
    if (firstHit(INJECTION, s) >= 0) {
      out.ok = false; out.action = "block";
      out.rules.push("提示注入");
      out.reply = POLITE_BLOCK;
      STATS.inputBlocked++; bump("提示注入");
      return out;
    }
    if (firstHit(OVERRIDE, s) >= 0) {
      out.ok = false; out.action = "block";
      out.rules.push("越权指令");
      out.reply = "我只能查站内资料、聊文物，不能替你做这类操作。";
      STATS.inputBlocked++; bump("越权指令");
      return out;
    }
    if (firstHit(SENSITIVE, s) >= 0) {
      out.ok = false; out.action = "block";
      out.rules.push("敏感内容");
      out.reply = POLITE_BLOCK;
      STATS.inputBlocked++; bump("敏感内容");
      return out;
    }
    PII.forEach(function (p) {
      if (p.re.test(out.text)) {
        p.re.lastIndex = 0;
        out.text = out.text.replace(p.re, p.mask);
        out.rules.push(p.name + "脱敏");
        STATS.inputRedacted++; bump(p.name + "脱敏");
        p.re.lastIndex = 0;
      } else { p.re.lastIndex = 0; }
    });
    if (out.rules.length) out.action = "redact";
    return out;
  }

  /* ---------- 输出侧 ---------- */
  /* hits：本轮给模型的证据角标列表（如 ["[1]","[2]"]），用于查悬空引用与硬数字依据 */
  function checkOutput(text, ctx) {
    ctx = ctx || {};
    STATS.outputChecked++;
    var s = String(text || "");
    var out = { ok: true, text: s, rules: [], dangling: [], unsupported: [] };

    if (firstHit(SENSITIVE, s) >= 0) {
      out.ok = false; out.action = "block";
      out.text = POLITE_BLOCK;
      out.rules.push("输出敏感内容");
      STATS.outputCleaned++; bump("输出敏感内容");
      return out;
    }

    /* 提示词/工具痕迹：直接去掉那一句，别把内部机制说给参观者听 */
    var beforeLeak = out.text;
    LEAK.forEach(function (re) {
      if (re.test(out.text)) {
        out.text = out.text.split(/(?<=[。！？\n])/).filter(function (line) {
          return !re.test(line);
        }).join("");
        out.rules.push("去除内部机制措辞");
        bump("去除内部机制措辞");
      }
    });
    /* 清洗后不能把回答洗没了：那说明整段都是误判，恢复原文 */
    if (out.text.trim().length < 8 && beforeLeak.trim().length >= 8) out.text = beforeLeak;

    /* 悬空引用：回答里 [9] 但只给了 [1][2] → 摘掉，避免伪造出处 */
    var allowed = (ctx.refs || []).map(function (r) {
      var m = String(r).match(/(\d+)/); return m ? +m[1] : -1;
    }).filter(function (n) { return n > 0; });
    if (allowed.length) {
      out.text = out.text.replace(/\[(\d+)\]/g, function (all, n) {
        if (allowed.indexOf(+n) < 0) {
          out.dangling.push(+n);
          STATS.danglingRefs++; bump("悬空引用");
          return "";
        }
        return all;
      });
      if (out.dangling.length) out.rules.push("移除 " + out.dangling.length + " 处悬空引用");
    }

    /* 硬数字依据：回答里出现「48 厘米」「公元前 2 世纪」这类精确数据，
       检查它是否在本轮证据原文里出现过。没出现就标出来，交给自检/评测统计。 */
    if (ctx.evidenceText) {
      var ev = String(ctx.evidenceText);
      var nums = s.match(/\d+(?:\.\d+)?\s*(?:厘米|米|公斤|千克|克|年|世纪|件|厘米高)/g) || [];
      nums.forEach(function (n) {
        var bare = n.replace(/\s/g, "");
        if (ev.indexOf(bare) < 0 && ev.indexOf(bare.replace(/(厘米|米|公斤|千克|克|年|世纪|件)/g, "")) < 0) {
          out.unsupported.push(bare);
        }
      });
      if (out.unsupported.length) {
        STATS.unsupportedNumbers += out.unsupported.length;
        out.rules.push("标记 " + out.unsupported.length + " 处无依据硬数字");
        bump("无依据硬数字");
      }
    }

    out.text = out.text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (out.rules.length) { out.action = "clean"; STATS.outputCleaned++; }
    return out;
  }

  function stats() { return JSON.parse(JSON.stringify(STATS)); }
  function reset() {
    STATS = { inputChecked: 0, inputBlocked: 0, inputRedacted: 0,
              outputChecked: 0, outputCleaned: 0, danglingRefs: 0,
              unsupportedNumbers: 0, byRule: {} };
  }

  W.WJSafety = {
    version: "guard-1.0",
    checkInput: checkInput,
    checkOutput: checkOutput,
    stats: stats,
    reset: reset,
    patterns: { injection: INJECTION.length, override: OVERRIDE.length,
                sensitive: SENSITIVE.length, leak: LEAK.length, pii: PII.length }
  };
})();

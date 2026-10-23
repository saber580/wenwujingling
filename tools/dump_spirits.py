# -*- coding: utf-8 -*-
"""导出精灵元数据(海报功能调研用)→ tools/_dump_spirits.json"""
import json, pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
import quickjs

root = pathlib.Path(__file__).resolve().parent.parent
js = (root / "js" / "data.js").read_text(encoding="utf-8")
ctx = quickjs.Context()
ctx.eval(js)
out = ctx.eval("""
JSON.stringify({
  stations: STATIONS.map(s => ({id: s.id, order: s.order, name: s.name, spiritIds: s.spiritIds})),
  spirits: Object.values(SPIRITS).map(s => ({
    id: s.id, name: s.name, starter: !!s.starter, dir: (s.dir === undefined ? null : s.dir),
    era: s.era || null, primary: s.primary, secondary: s.secondary,
    intro: s.intro, history: (s.history || "").slice(0, 170),
    knowledge: (s.knowledge || []).map(k => k.a)
  })),
  museums: MUSEUMS.map(m => ({id: m.id, name: m.name, city: m.city, station: m.station || null}))
})
""")
data = json.loads(out)
dest = root / "tools" / "_dump_spirits.json"
dest.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("OK", len(data["spirits"]), "spirits,", len(data["stations"]), "stations,", len(data["museums"]), "museums")
for s in data["spirits"]:
    k = " | ".join(a[:38] for a in s["knowledge"][-2:])
    print(f'{s["id"]:<14} {s["name"]:<8} era={s["era"]} dir={s["dir"]} :: {k}')

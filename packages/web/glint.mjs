import pw from "/home/dell/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
const p = await ctx.newPage();
p.setDefaultTimeout(0);
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(8000);
// freeze the glint mid-sweep so a static screenshot shows it
await p.addStyleTag({ content: ".lp-nav__cta::after{ left:22% !important; animation:none !important; } .lp-nav__cta{ box-shadow:0 5px 22px -4px var(--accent-glow) !important; animation:none !important; }" });
await p.waitForTimeout(600);
const el = await p.$(".lp-nav__cta");
await el.screenshot({ path: "/tmp/glint.png", timeout: 0 });
console.log("glint shot done");
await b.close().catch(()=>{}); process.exit(0);

const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = path.join(__dirname, 'diagrams');
  const browser = await chromium.launch();
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = svg.match(/width="(\d+)"\s+height="(\d+)"/);
    const w = +m[1], h = +m[2];
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2.5 });
    await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
    await page.screenshot({ path: path.join(dir, f.replace(/\.svg$/, '.png')) });
    await page.close();
    console.log(f.replace(/\.svg$/, '.png'), w, 'x', h);
  }
  await browser.close();
})();

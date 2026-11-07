import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const pw = await import(pathToFileURL(process.env.SQUEEK_PLAYWRIGHT!).href);
const browser = await pw.chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const svg = await readFile("src/assets/share.svg", "utf8");
  await page.setContent(
    `<style>body{margin:0}svg{display:block;width:1200px;height:630px}</style>${svg}`,
  );
  await page.screenshot({ path: "public/og-image.png" });
} finally {
  await browser.close();
}

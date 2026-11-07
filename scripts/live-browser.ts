import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { officialFetch, type Settlements } from "../src/activity";
import { bridgeOfficialNetwork } from "./network-bridge";
import { newGame } from "../src/game";
const output: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  networkBridge: process.env.SQUEEK_TEST_NETWORK_BRIDGE === "1",
  note: "Live API and public Sepolia RPC only. An isolated guest save is dated before the selected historical receipts to exercise conversion without waiting for future rounds. No activity, receipts, users or global scores are fabricated.",
};
const pw = await import(pathToFileURL(process.env.SQUEEK_PLAYWRIGHT!).href),
  dist = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url ?? "/", "http://localhost");
    const p = resolve(
      dist,
      "." + (u.pathname === "/" ? "/index.html" : u.pathname),
    );
    if (!p.startsWith(dist + sep)) throw Error();
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    res.setHeader(
      "Content-Type",
      types[extname(p)] ?? "application/octet-stream",
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
let browser;
let activePage;
const externalFailures: string[] = [];
const browserErrors: string[] = [];
try {
  const data = await officialFetch<Settlements>("/settlements");
  const active = data.recentSettlements
    .filter((s) => BigInt(s.workAdded) > 0n)
    .sort((a, b) => Number(BigInt(b.workAdded) - BigInt(a.workAdded)));
  const selected: typeof active = [];
  let selectedWork = 0n;
  for (const settlement of active) {
    selected.push(settlement);
    selectedWork += BigInt(settlement.workAdded);
    if (selectedWork >= 1000n) break;
  }
  assert.ok(
    selectedWork >= 1000n,
    "Official recent history does not currently include enough work to exercise Young evolution.",
  );
  const createdAt =
    Math.min(...selected.map((s) => Date.parse(s.blockTimestamp))) - 60000;
  const game = newGame(createdAt);
  game.updatedAt = Date.now();

  browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  activePage = page;
  await bridgeOfficialNetwork(page);
  page.setDefaultTimeout(30000);
  page.on(
    "requestfailed",
    (r: { url: () => string; failure: () => { errorText: string } }) => {
      if (r.url().startsWith("https://"))
        externalFailures.push(
          `${new URL(r.url()).host}: ${r.failure()?.errorText}`,
        );
    },
  );
  page.on("pageerror", (e: Error) => browserErrors.push(e.message));
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await page.addInitScript(
    (g: ReturnType<typeof newGame>) =>
      localStorage.setItem("squeek.game.v1:guest", JSON.stringify(g)),
    game,
  );
  await page.goto(base + "/#activity");
  await page.waitForFunction(
    () => {
      const b = document.querySelectorAll(".data-stat b")[2];
      return b && b.textContent !== "Unavailable";
    },
    {},
    { timeout: 25000 },
  );
  await page.locator('.sidebar nav a[href="#evolution"]').click();
  const proofs: { hash: string; work: string; round: string }[] = [];
  output.confirmedProofs = proofs;
  for (const s of selected) {
    await page
      .getByLabel("Settlement transaction hash")
      .fill(s.transactionHash);
    await page
      .getByRole("button", { name: "Verify settlement", exact: true })
      .click();
    await page.waitForFunction(
      () => {
        const tags = [
          ...document.querySelectorAll(".verification-panel .status-tag"),
        ];
        const note = document.getElementById("verification-note");
        return (
          tags.some((t) => t.textContent === "CONFIRMED") ||
          (tags.some((t) => t.textContent === "UNAVAILABLE") &&
            note?.textContent)
        );
      },
      {},
      { timeout: 60000 },
    );
    const note = await page.locator("#verification-note").innerText();
    assert.ok(note.includes("work units verified"), note);
    proofs.push({
      hash: s.transactionHash,
      work: s.workAdded,
      round: s.settledThroughRound,
    });
    const evolution = page.getByRole("dialog", {
      name: "A little legend is growing",
    });
    if (await evolution.isVisible())
      await evolution
        .getByRole("button", { name: "Meet your new little wonder" })
        .click();
  }
  const expected = Math.floor(
    selected.reduce((n, s) => n + Number(s.workAdded), 0) / 10,
  );
  const displayed = await page.locator(".energy-large b").innerText();
  assert.equal(Number(displayed), expected);
  assert.ok(
    expected >= 100,
    "Selected live receipts should unlock Young to validate the stage transition.",
  );
  assert.equal(
    await page.locator(".current-stage h2").innerText(),
    expected >= 1000 ? "Legendary" : "Young",
  );
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("squeek.game.v1:guest")!),
  );
  await page
    .getByRole("button", { name: "Verify settlement", exact: true })
    .click();
  await page
    .getByText("Already verified. No duplicate energy awarded.", {
      exact: true,
    })
    .waitFor();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("squeek.game.v1:guest")!),
  );
  assert.equal(after.seeds, before.seeds);
  assert.equal(
    Number(await page.locator(".energy-large b").innerText()),
    expected,
  );
  await page.locator('.sidebar nav a[href="#hamster"]').click();
  assert.ok(
    await page
      .getByText("A little settlement celebration", { exact: true })
      .isVisible(),
  );
  assert.ok(after.evolutionRewards.includes(1));
  assert.equal(after.appearance, expected >= 1000 ? "cosmic" : "cream");
  assert.deepEqual(errors, []);
  await mkdir("test/scratch/live-browser", { recursive: true });
  await page.screenshot({
    path: "test/scratch/live-browser/verified-evolution.png",
    fullPage: true,
  });
  output.ok = true;
  output.confirmedEnergy = expected;
  output.stage = expected >= 1000 ? "Legendary" : "Young";
  output.proofs = proofs;
  output.duplicateRewardBlocked = true;
  output.worldEventActivated = true;
  output.evolutionRewardSeeds = expected >= 1000 ? 70 : 20;
} catch (e) {
  output.ok = false;
  output.error = (e as Error).message;
  output.externalFailures = [...new Set(externalFailures)];
  output.browserErrors = browserErrors;
  if (activePage) {
    output.pageText = (await activePage.locator("body").innerText()).slice(
      -2500,
    );
    await mkdir("test/scratch/live-browser", { recursive: true });
    await activePage.screenshot({
      path: "test/scratch/live-browser/failure.png",
      fullPage: true,
    });
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise<void>((r) => server.close(() => r()));
  await writeFile(
    "artifacts/live-browser-integration.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
}

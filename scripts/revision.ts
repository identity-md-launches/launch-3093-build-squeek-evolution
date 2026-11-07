import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Page, Route, BrowserContext } from "playwright";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage, type Hex, type PublicClient } from "viem";
import { randomUUID } from "node:crypto";
import { createService } from "../server/service";
import { createHttpServer } from "../server/http";
import { finishPlay, newGame, type Game } from "../src/game";
import { bridgeOfficialNetwork } from "./network-bridge";

// Fault injection and generated signing keys are isolated here, never in the export.
const baseline = process.argv.includes("--baseline");
const results: { name: string; passed: boolean; details?: unknown }[] = [];
const evidence: Record<string, unknown> = {};
const out = "test/scratch/revision";
await mkdir(out, { recursive: true });
const pw = await import(pathToFileURL(process.env.SQUEEK_PLAYWRIGHT!).href);
const browser = await pw.chromium.launch({ headless: true });
const errors: string[] = [];
const db = `${out}/service.sqlite`;
await rm(db, { force: true });
const settings = { port: 0, publicOrigin: "http://localhost", allowedOrigins: [] as string[] };
const options = {
  databasePath: db,
  publicOrigin: settings.publicOrigin,
  client: { verifyMessage: async (args: Parameters<typeof verifyMessage>[0]) => verifyMessage(args) } as unknown as PublicClient,
  frontier: async () => ({ round: 10n, block: 100n }),
};
const service = createService(options);
const server = createHttpServer(settings, service);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
settings.publicOrigin = options.publicOrigin = base;
settings.allowedOrigins.push(base);
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    const details = await fn();
    results.push({ name, passed: true, ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, details: (e as Error).message });
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
async function pageFor(g?: Game) {
  const c: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  await bridgeOfficialNetwork(c);
  const p: Page = await c.newPage();
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  if (g) await c.addInitScript((game) => {
    if (!localStorage.getItem("squeek.game.v1:guest")) localStorage.setItem("squeek.game.v1:guest", JSON.stringify(game));
  }, g);
  return p;
}
const saved = (p: Page, key = "squeek.game.v1:guest") => p.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key) as Promise<Game>;
const go = (p: Page, tab: string) => p.locator(`nav a[href="#${tab}"]:visible`).click();
const tinyBadge = (p: Page) => p.locator(".achievement-card").filter({ hasText: "Tiny beginnings" });
async function walletPage(account: ReturnType<typeof privateKeyToAccount>) {
  const p = await pageFor();
  await p.context().exposeFunction("__revisionSign", (hex: Hex) => account.signMessage({ message: { raw: hex } }));
  await p.context().addInitScript(({ address, uuid }) => {
    let authorized = sessionStorage.getItem("revision-authorized") === "true";
    const listeners = new Map<string, Function[]>();
    const provider = {
      on: (event: string, fn: Function) => listeners.set(event, [...(listeners.get(event) ?? []), fn]),
      removeListener: (event: string, fn: Function) => listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn)),
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts") { authorized = true; sessionStorage.setItem("revision-authorized", "true"); return [address]; }
        if (method === "eth_accounts") return authorized ? [address] : [];
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "personal_sign") return (window as unknown as { __revisionSign: (h: unknown) => Promise<string> }).__revisionSign(params?.[0]);
        if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        throw Error(`Unsupported regression provider method: ${method}`);
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
    const detail = { info: { uuid, name: "Revision test wallet", rdns: "test.squeek.revision", icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="green"/></svg>' }, provider };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, { address: account.address, uuid: randomUUID() });
  await p.goto(base);
  return p;
}
async function signIn(p: Page) {
  if (await p.getByRole("button", { name: "Connect wallet", exact: true }).isVisible()) {
    await p.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await p.getByRole("button", { name: "Revision test wallet", exact: true }).click();
  }
  await p.locator(".wallet-button.connected").waitFor();
  // Wait for actual service health, not a guessed delay.
  await p.getByRole("button", { name: "Settings", exact: true }).click();
  await p.getByText("Shared profiles and global rankings are connected.", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Close dialog", exact: true }).click();
  await p.locator(".wallet-button").click();
  await p.getByRole("button", { name: "Verify wallet ownership", exact: true }).click();
  await p.waitForFunction(() => !!document.querySelector(".wallet-button .lucide-shield-check"));
}
async function disconnect(p: Page) {
  await p.locator(".wallet-button").click();
  await p.getByRole("button", { name: "Disconnect wallet", exact: true }).click();
  await p.getByRole("button", { name: "Connect wallet", exact: true }).waitFor();
}
try {
  for (const width of [320, 390, 1440]) await check(`24-letter rename fits at ${width}px`, async () => {
    const p = await pageFor();
    try {
      await p.setViewportSize({ width, height: 844 });
      await p.goto(base);
      await p.getByRole("button", { name: "Rename hamster", exact: true }).click();
      await p.getByLabel("Hamster name").fill("W".repeat(24));
      await p.getByRole("button", { name: "Save name", exact: true }).click();
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      const measurements = await p.evaluate(() => {
        const rect = (selector: string) => {
          const e = document.querySelector(selector)!;
          const b = e.getBoundingClientRect();
          return { text: e.textContent, x: b.x, right: b.right, width: b.width, height: b.height, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth };
        };
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, room: rect(".room-name h2"), pet: rect(".pet-identity h2"), avatar: rect(".pet-identity .avatar"), tools: rect(".room-tools") };
      });
      evidence[`name${width}`] = measurements;
      await p.screenshot({ path: `${out}/${baseline ? "before" : "after"}-long-${width}.png`, fullPage: true });
      if (!baseline && width === 390) await p.screenshot({ path: `${out}/long-name-first-screen.jpg`, type: "jpeg", quality: 85 });
      assert.equal(measurements.scrollWidth, width);
      for (const heading of [measurements.room, measurements.pet]) {
        assert.ok(heading.scrollWidth <= heading.clientWidth + 1, "Name spills outside its text column");
        assert.ok(heading.right <= width && heading.x >= 0);
      }
      assert.equal(measurements.avatar.width, width <= 1050 ? 40 : 48);
      for (const tab of ["evolution", "missions", "activity", "achievements", "leaderboard", "hamster"]) {
        await go(p, tab);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width, `${tab} overflows with the accepted name`);
      }
      if (width === 1440) {
        await p.getByRole("button", { name: "How to play", exact: true }).click();
        const dialog = p.getByRole("dialog");
        assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), "Help content must fit with the accepted name");
        await p.keyboard.press("Escape");
      }
      return measurements;
    } finally { await p.context().close(); }
  });
  await check("Mission collection unlocks Tiny beginnings immediately at 107 XP", async () => {
    const p = await pageFor();
    try {
      await p.clock.install();
      await p.goto(base);
      for (let i = 0; i < 3; i++) { await p.clock.runFor(1100); await p.locator(".feed-action").click(); }
      await go(p, "missions");
      await p.locator(".mission-row").filter({ hasText: "A proper breakfast" }).getByRole("button", { name: /Collect/ }).click();
      await go(p, "hamster");
      for (let i = 0; i < 5; i++) { await p.clock.runFor(1100); await p.locator(".care-action").filter({ hasText: "Pet" }).click(); }
      await go(p, "missions");
      await p.locator(".mission-row").filter({ hasText: "A little affection" }).getByRole("button", { name: /Collect/ }).click();
      await go(p, "hamster");
      await p.clock.runFor(1100);
      await p.locator(".care-action").filter({ hasText: "Clean" }).click();
      assert.equal((await saved(p)).xp, 97);
      await go(p, "missions");
      await p.locator(".mission-row").filter({ hasText: "Room to bloom" }).getByRole("button", { name: /Collect/ }).click();
      await go(p, "achievements");
      const g = await saved(p);
      evidence.missionXp = { xp: g.xp, badges: g.badges };
      assert.equal(g.xp, 107);
      assert.ok(g.badges.includes("first-steps"));
      assert.match(await tinyBadge(p).innerText(), /Unlocked/);
    } finally { await p.context().close(); }
  });
  await check("Completed play awards the 100-XP badge once", () => {
    const g = newGame();
    g.xp = 97;
    const played = finishPlay(g, 1);
    evidence.playXp = { xp: played.xp, badges: played.badges };
    assert.equal(played.xp, 100);
    assert.ok(played.badges.includes("first-steps"));
    assert.equal(finishPlay(played, 8, true).badges.filter((b) => b === "first-steps").length, 1);
    assert.ok(!finishPlay({ ...g, xp: 96 }, 1).badges.includes("first-steps"));
  });
  await check("Loading a qualifying older save reconciles the XP achievement", async () => {
    const g = newGame(); g.xp = 107;
    const p = await pageFor(g);
    try {
      await p.goto(base + "/#achievements");
      await p.locator(".achievement-card").first().waitFor();
      const loaded = await saved(p);
      evidence.loadedXp = { xp: loaded.xp, badges: loaded.badges };
      assert.ok(loaded.badges.includes("first-steps"));
      assert.match(await tinyBadge(p).innerText(), /Unlocked/);
    } finally { await p.context().close(); }
  });
  await check("Ranking read failure is unavailable and retry recovers to a true empty result", async () => {
    const p = await pageFor();
    let fail = false;
    const error = "Verification service is unavailable. Check the connection and try again.";
    await p.route("**/api/leaderboard", (r) => fail ? r.fulfill({ status: 503, json: { error } }) : r.continue());
    try {
      await p.goto(base + "/#leaderboard");
      await p.getByText("No profiles have joined this service yet.", { exact: false }).waitFor();
      fail = true;
      await p.getByRole("button", { name: "Refresh rankings", exact: true }).click();
      await p.getByRole("button", { name: "Refreshing…", exact: true }).waitFor({ state: "hidden" });
      const text = await p.locator("main").innerText();
      evidence.boardFailure = text;
      await p.screenshot({ path: `${out}/${baseline ? "before" : "after"}-board-failure.png` });
      assert.match(text, /Shared rankings unavailable/);
      assert.ok(text.includes(error));
      assert.ok(!text.includes("No profiles have joined"));
      assert.ok(!text.includes("Shared persistent rankings"));
      fail = false;
      await p.getByRole("button", { name: "Retry rankings", exact: true }).click();
      await p.getByText("No profiles have joined this service yet.", { exact: false }).waitFor();
      assert.match(await p.locator(".leaderboard-toolbar").innerText(), /Shared persistent rankings/);
    } finally { await p.context().close(); }
  });
  await check("Signed reconnect preserves newer local wallet care", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const p = await walletPage(account);
    const key = `squeek.game.v1:${account.address.toLowerCase()}`;
    try {
      await signIn(p);
      await p.locator(".care-action").filter({ hasText: "Pet" }).click();
      const before = await saved(p, key);
      assert.equal(before.xp, 5); assert.equal(before.lifetime.pet, 1);
      await disconnect(p);
      await signIn(p);
      const after = await saved(p, key);
      evidence.reconnect = { before: { xp: before.xp, pet: before.lifetime.pet }, after: { xp: after.xp, pet: after.lifetime.pet } };
      assert.equal(after.xp, 5); assert.equal(after.lifetime.pet, 1);
      await p.reload();
      await signIn(p);
      assert.equal((await saved(p, key)).xp, 5);
      // The selected local snapshot must use the latest server revision.
      await p.getByRole("button", { name: "Settings", exact: true }).click();
      await p.getByRole("button", { name: "Save to cloud", exact: true }).click();
      await p.waitForFunction(() => document.querySelector(".live-announcement")?.textContent === "Progress saved to your shared profile.");
      await p.getByRole("button", { name: "Close dialog", exact: true }).click();
      const other = await walletPage(account);
      try {
        await signIn(other);
        assert.equal((await saved(other, key)).xp, 5, "New device should restore cloud care");
        await other.clock.install();
        await other.clock.runFor(1100);
        await other.locator(".care-action").filter({ hasText: "Clean" }).click();
        assert.equal((await saved(other, key)).xp, 13);
        await other.getByRole("button", { name: "Settings", exact: true }).click();
        await other.getByRole("button", { name: "Save to cloud", exact: true }).click();
        await other.waitForFunction(() => document.querySelector(".live-announcement")?.textContent === "Progress saved to your shared profile.");
      } finally { await other.context().close(); }
      await disconnect(p);
      await signIn(p);
      assert.equal((await saved(p, key)).xp, 5, "Newer cloud snapshot still requires explicit load");
      await p.getByRole("button", { name: "Settings", exact: true }).click();
      await p.getByRole("button", { name: "Save to cloud", exact: true }).click();
      await p.waitForFunction(() => document.querySelector(".live-announcement")?.textContent === "Progress saved to your shared profile.");
      await p.getByRole("button", { name: "Close dialog", exact: true }).click();
      await p.clock.install();
      await p.clock.runFor(1100);
      await p.locator(".care-action").filter({ hasText: "Clean" }).click();
      assert.equal((await saved(p, key)).xp, 13);
      await p.getByRole("button", { name: "Settings", exact: true }).click();
      await p.getByRole("button", { name: "Load cloud save", exact: true }).click();
      await p.waitForFunction(() => document.querySelector(".live-announcement")?.textContent === "Cloud save loaded.");
      assert.equal((await saved(p, key)).xp, 5);
    } finally { await p.context().close(); }
  });
  for (const recovery of ["manual", "sources", ...(baseline ? [] : ["retry", "partial"])]) await check(`Saved proof outage recovers through ${recovery}`, async () => {
    const hash = "0x3b85ba40aae7596729431ebb26fea004d515310a11a2b214fba1e35ade3c5563";
    const other = "0x9f5eb6fb2633ab681922499bdde6b15b1930424922a0027a0d54639c587e2a4a";
    const g = newGame(Date.parse("2026-11-06T00:00:00Z"));
    g.updatedAt = Date.now(); g.proofs = recovery === "partial" ? [hash, other] : [hash];
    const p = await pageFor(g);
    const rpc = /^https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.org)\//;
    const outage = (r: Route) => r.abort();
    const failOther = async (r: Route) => {
      if (r.request().postData()?.includes(other)) return r.abort();
      return r.fallback();
    };
    await p.route(rpc, outage);
    try {
      await p.goto(base + "/#evolution");
      await p.locator(".energy-large b").filter({ hasText: "Unavailable" }).waitFor({ timeout: 60000 });
      await p.unroute(rpc, outage);
      if (recovery === "sources") {
        await go(p, "activity");
        await p.getByRole("button", { name: "Refresh sources", exact: true }).click();
        await go(p, "evolution");
      } else if (recovery === "retry") {
        await p.getByRole("button", { name: "Retry saved proofs", exact: true }).click();
      } else {
        if (recovery === "partial") await p.route(rpc, failOther);
        await p.getByLabel("Settlement transaction hash").fill(hash);
        await p.getByRole("button", { name: "Verify settlement", exact: true }).click();
        await p.locator("#verification-note").filter({ hasText: /work units verified|Already verified/ }).waitFor({ timeout: 60000 });
      }
      if (recovery === "partial") {
        await p.locator(".energy-large b").filter({ hasText: "Unavailable" }).waitFor({ timeout: 60000 });
        assert.ok(!(await p.locator(".energy-large b").innerText()).includes("60"), "Unchecked proof cannot become zero");
        await p.unroute(rpc, failOther);
        await p.getByRole("button", { name: "Verify settlement", exact: true }).click();
        await p.waitForFunction(() => document.querySelector(".energy-large b")?.textContent === "99", {}, { timeout: 60000 });
        evidence["proof-partial"] = { duringPartialFailure: "Unavailable", recoveredEnergy: 99, savedProofs: (await saved(p)).proofs.length };
      } else {
        const energy = p.locator(".energy-large b");
        await p.waitForFunction(() => document.querySelector(".energy-large b")?.textContent === "60", {}, { timeout: baseline ? 4000 : 60000 });
        assert.equal(await energy.innerText(), "60");
        assert.match(await p.locator(".evolution-hero h2").innerText(), /baby wonder/);
        evidence[`proof-${recovery}`] = { energy: await energy.innerText(), status: await p.locator("#verification-note").textContent() };
      }
    } catch (e) {
      evidence[`proof-${recovery}`] = { energy: await p.locator(".energy-large b").innerText(), status: await p.locator("#verification-note").textContent(), error: (e as Error).message };
      throw e;
    } finally { await p.context().close(); }
  });
  await check("No page exceptions", () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  service.close();
  const report = { checkedAt: new Date().toISOString(), baseline, note: "Production dist client. Isolated SQLite service with test registration frontier; genuine ownership signatures from generated in-memory accounts. RPC outage is injected, then real public Sepolia responses pass through the optional Node bridge unchanged. No test accounts, scores or responses enter dist.", evidence, results };
  await writeFile(baseline ? `${out}/baseline.json` : "artifacts/revision-tests.json", JSON.stringify(report, null, 2));
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
  if (!baseline && results.some((r) => !r.passed)) process.exitCode = 1;
}

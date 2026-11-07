import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import type { Page, Browser, BrowserContext } from "playwright";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage, type PublicClient, type Hex } from "viem";
import { createService } from "../server/service";
import { bridgeOfficialNetwork } from "./network-bridge";
import { createHttpServer } from "../server/http";
const pw = await import(pathToFileURL(process.env.SQUEEK_PLAYWRIGHT!).href);
const results: { name: string; passed: boolean; details?: unknown }[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    const d = await fn();
    results.push({ name, passed: true, ...(d ? { details: d } : {}) });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, details: (e as Error).message });
    console.error(`FAIL ${name}: ${(e as Error).message}`);
    if (chromium)
      for (const [ci, c] of chromium.contexts().entries())
        for (const [pi, p] of c.pages().entries()) {
          console.error(
            "Visible page",
            ci,
            pi,
            (await p.locator("body").innerText()).slice(0, 900),
          );
          await p
            .screenshot({
              path: `test/scratch/browser-checks/failure-${results.length}-${ci}-${pi}.png`,
            })
            .catch(() => {});
        }
  }
}
await mkdir("test/scratch/browser-checks", { recursive: true });
const dist = resolve("dist");
const staticServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = decodeURIComponent(url.pathname).replace(/^\/preview\//, "/");
    const p = resolve(dist, "." + (rel === "/" ? "/index.html" : rel));
    if (!p.startsWith(dist + sep)) throw Error();
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json",
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
const listen = (s: Server) =>
  new Promise<number>((r) =>
    s.listen(0, "127.0.0.1", () => r((s.address() as { port: number }).port)),
  );
const staticPort = await listen(staticServer),
  base = `http://127.0.0.1:${staticPort}/preview/`;
let chromium: Browser | null = null,
  webkit: Browser | null = null,
  serviceServer: Server | null = null,
  service: ReturnType<typeof createService> | null = null;
const errors: string[] = [],
  remoteFailures: string[] = [];
try {
  chromium = await pw.chromium.launch({ headless: true });
  const page: Page = await chromium!.newPage({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await bridgeOfficialNetwork(page);
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => {
    if (!r.url().startsWith(base))
      remoteFailures.push(
        `${new URL(r.url()).host}: ${r.failure()?.errorText}`,
      );
  });
  await page.clock.install();
  await check(
    "Production export renders at a gateway subpath with its own fonts and assets",
    async () => {
      await page.goto(base);
      await page
        .getByRole("heading", { name: "My hamster", exact: true })
        .waitFor();
      assert.equal(await page.locator(".room-scene").count(), 1);
      assert.ok(await page.locator(".room-scene").isVisible());
      assert.equal(await page.locator(".fatal-error").count(), 0);
      await page.screenshot({
        path: "test/scratch/browser-checks/desktop.png",
      });
    },
  );
  const localGame = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("squeek.game.v1:guest")!),
    );
  await check(
    "Feed spends one seed, increases fullness and XP, and survives reload",
    async () => {
      await page
        .getByRole("button", { name: "Feed 1 seed", exact: true })
        .click();
      const g = await localGame();
      assert.equal(g.seeds, 19);
      assert.equal(g.xp, 8);
      assert.ok(g.fullness > 89);
      await page.reload();
      assert.equal((await localGame()).xp, 8);
    },
  );
  await check(
    "Pet, clean, sleep and wake controls perform actual care actions",
    async () => {
      await page.clock.runFor(1100);
      await page.locator(".care-action").filter({ hasText: "Pet" }).click();
      assert.equal((await localGame()).counts.pet, 1);
      await page.clock.runFor(1100);
      await page.locator(".care-action").filter({ hasText: "Clean" }).click();
      assert.equal((await localGame()).cleanliness, 100);
      await page.clock.runFor(1100);
      await page.locator(".care-action").filter({ hasText: "Sleep" }).click();
      assert.equal((await localGame()).sleeping, true);
      assert.equal(await page.locator(".feed-action").isDisabled(), true);
      await page.clock.runFor(1100);
      await page.getByRole("button", { name: /Wake up Hello/ }).click();
      assert.equal((await localGame()).sleeping, false);
    },
  );
  await check(
    "Seed-catching game is playable with pointer and keyboard, and pays only collected seeds",
    async () => {
      await page.clock.runFor(1100);
      await page.locator(".care-action").filter({ hasText: "Play" }).click();
      await page
        .getByRole("dialog", { name: "A pocketful of seeds" })
        .waitFor();
      const field = page.locator(".catch-area");
      await field.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      for (let i = 0; i < 8; i++) {
        const seed = page.locator(".falling-seed");
        await seed.waitFor();
        const left = await seed.evaluate((e) =>
          parseFloat((e as HTMLElement).style.left),
        );
        const box = (await field.boundingBox())!;
        await page.mouse.click(
          box.x + (box.width * left) / 100,
          box.y + box.height * 0.8,
        );
        await page.clock.runFor(1850);
      }
      await page
        .getByRole("button", { name: "Collect 8 seeds", exact: true })
        .click();
      const g = await localGame();
      assert.equal(g.seeds, 27);
      assert.equal(g.counts.play, 1);
      assert.ok(g.badges.includes("seed-champion"));
    },
  );
  await check(
    "Daily mission reward becomes collectible and cannot be collected twice",
    async () => {
      await page.locator('.sidebar nav a[href="#missions"]').click();
      const row = page
        .locator(".mission-row")
        .filter({ hasText: "Room to bloom" });
      await row.getByRole("button", { name: "Collect reward" }).click();
      assert.equal(
        await row.getByRole("button", { name: "Collected" }).isDisabled(),
        true,
      );
      assert.ok((await localGame()).claimed.includes("fresh-room"));
    },
  );
  await check(
    "Evolution, activity, achievements and leaderboard sections are functional",
    async () => {
      for (const id of [
        "evolution",
        "activity",
        "achievements",
        "leaderboard",
      ]) {
        await page.locator(`.sidebar nav a[href="#${id}"]`).click();
        await page.locator("main h1").waitFor();
        assert.ok((await page.locator("main h1").textContent())!.length);
      }
      await page.locator('.sidebar nav a[href="#achievements"]').click();
      const dl = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export record" }).click();
      const download = await dl;
      await download.saveAs(
        "test/scratch/browser-checks/achievement-record.json",
      );
      const record = JSON.parse(
        await readFile(
          "test/scratch/browser-checks/achievement-record.json",
          "utf8",
        ),
      );
      assert.equal(record.properties.mintStatus, "not-minted");
      await page.locator('.sidebar nav a[href="#leaderboard"]').click();
      assert.ok(
        await page
          .getByText("Shared rankings unavailable", { exact: true })
          .isVisible(),
      );
      assert.equal(await page.locator(".leaderboard-entry").count(), 0);
    },
  );
  await check(
    "Wallet dialog offers installed-browser and Coinbase paths, closes with Escape and restores focus",
    async () => {
      const trigger = page.getByRole("button", {
        name: "Connect wallet",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
      await dialog.waitFor();
      assert.ok(
        await dialog
          .getByRole("button", { name: "Browser wallet", exact: true })
          .isVisible(),
      );
      assert.ok(
        await dialog.getByRole("button", { name: /Coinbase/ }).isVisible(),
      );
      await dialog
        .getByRole("button", { name: "Browser wallet", exact: true })
        .click();
      await page
        .getByText("Wallet connection declined or unavailable.", {
          exact: false,
        })
        .waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), false);
      assert.equal(
        await trigger.evaluate((e) => document.activeElement === e),
        true,
      );
    },
  );
  await check(
    "Rename form reports invalid input inside the dialog and persists a valid name",
    async () => {
      await page.locator('.sidebar nav a[href="#hamster"]').click();
      await page.getByRole("button", { name: "Rename hamster" }).click();
      await page.getByLabel("Hamster name").fill("!!!!");
      await page
        .getByRole("button", { name: "Save name", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Hamster name").getAttribute("aria-invalid"),
        "true",
      );
      assert.ok(
        await page
          .getByRole("dialog")
          .getByText(
            "Use 1–24 letters, numbers, spaces, underscores or hyphens.",
            { exact: true },
          )
          .isVisible(),
      );
      await page.getByLabel("Hamster name").fill("Pip");
      await page
        .getByRole("button", { name: "Save name", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Pip’s room", exact: true })
        .waitFor();
      assert.ok(
        await page
          .getByRole("button", { name: "Pet Pip in the room" })
          .isVisible(),
      );
      await page.reload();
      assert.equal((await localGame()).name, "Pip");
    },
  );
  await check(
    "Invalid transaction hash is rejected before any chain request, and future appearances stay locked",
    async () => {
      await page.locator('.sidebar nav a[href="#evolution"]').click();
      await page.getByLabel("Settlement transaction hash").fill("0xnotvalid");
      await page
        .getByRole("button", { name: "Verify settlement", exact: true })
        .click();
      await page
        .getByText(
          "Enter a complete 0x transaction hash with 64 hexadecimal characters.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByLabel("Settlement transaction hash")
          .getAttribute("aria-invalid"),
        "true",
      );
      assert.equal(
        await page.getByRole("button", { name: "Locked" }).count(),
        2,
      );
      assert.equal(
        await page.getByRole("button", { name: "Locked" }).first().isDisabled(),
        true,
      );
    },
  );
  await check(
    "All six sections reflow without page overflow at 320, 390, 768 and 1440 pixels",
    async () => {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const tab of [
          "hamster",
          "evolution",
          "missions",
          "activity",
          "achievements",
          "leaderboard",
        ]) {
          await page.goto(base + "#" + tab);
          await page.locator("main h1").waitFor();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          assert.equal(overflow, false, `${tab} overflow at ${width}`);
        }
        if (width === 390) {
          await page.goto(base);
          await page
            .getByRole("heading", { name: "My hamster", exact: true })
            .waitFor();
          const feed = await page.locator(".feed-action").boundingBox();
          assert.ok(feed && feed.y + feed.height < 844);
          await page.screenshot({
            path: "test/scratch/browser-checks/mobile.png",
          });
        }
      }
    },
  );
  await check(
    "Unavailable official APIs leave care usable and never display missing readings as zero",
    async () => {
      await page.route("https://api.squeekchain.com/**", (r) => r.abort());
      await page.goto(base + "#activity");
      await page.reload();
      await page
        .getByText("Live measurement unavailable", { exact: true })
        .waitFor();
      await page.clock.runFor(16000);
      assert.ok(
        await page
          .locator(".data-stat")
          .first()
          .getByText("Unavailable", { exact: true })
          .isVisible(),
      );
      await page.goto(base);
      await page.locator(".feed-action").click();
      assert.equal((await localGame()).seeds, 29);
      await page.unroute("https://api.squeekchain.com/**");
    },
  );
  await check(
    "Reduced-motion preference stops nonessential hamster animation",
    async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect &&
                Number((a.effect as KeyframeEffect).getTiming().iterations) ===
                  Infinity,
            ).length,
      );
      assert.equal(running, 0);
    },
  );
  const phone = await chromium!.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  await bridgeOfficialNetwork(phone);
  const mobile = await phone.newPage();
  await check(
    "Mobile wallet picker offers MetaMask, Coinbase, Rabby, Phantom and Smart Wallet without a relay",
    async () => {
      await mobile.goto(base);
      await mobile
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert.ok(
          await mobile
            .getByRole("link", { name: `Open in ${name}`, exact: true })
            .isVisible(),
        );
      assert.ok(
        await mobile
          .getByRole("button", { name: "Coinbase Smart Wallet" })
          .isVisible(),
      );
      const link = await mobile
        .getByRole("link", { name: "Open in MetaMask" })
        .getAttribute("href");
      assert.ok(link?.includes("link.metamask.io/dapp/"));
      const rabby = new URL(
        (await mobile
          .getByRole("link", { name: "Open in Rabby", exact: true })
          .getAttribute("href"))!,
      );
      assert.equal(rabby.pathname, "/mobile/");
      assert.equal(rabby.searchParams.get("_cmd"), "open-dapp");
      assert.equal(rabby.searchParams.get("dapp"), mobile.url());
    },
  );
  await phone.close();
  // An isolated service uses production HTTP routes and real signature verification, with an explicit test frontier.
  const db = "test/scratch/browser-checks/shared.sqlite";
  await rm(db, { force: true });
  const settings = {
    port: 0,
    publicOrigin: "http://localhost",
    allowedOrigins: [] as string[],
  };
  const serviceOptions = {
    databasePath: db,
    publicOrigin: settings.publicOrigin,
    client: {
      verifyMessage: async (args: Parameters<typeof verifyMessage>[0]) =>
        verifyMessage(args),
    } as unknown as PublicClient,
    frontier: async () => ({ round: 10n, block: 100n }),
  };
  service = createService(serviceOptions);
  serviceServer = createHttpServer(settings, service);
  const port = await listen(serviceServer);
  settings.publicOrigin = `http://127.0.0.1:${port}`;
  settings.allowedOrigins.push(settings.publicOrigin);
  serviceOptions.publicOrigin = settings.publicOrigin;
  const sharedBase = settings.publicOrigin;
  async function walletContext(
    account: ReturnType<typeof privateKeyToAccount>,
    wrongNetwork = false,
    mobile = false,
    generic = false,
  ) {
    const c = await chromium!.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 900 },
      ...(mobile
        ? {
            isMobile: true,
            hasTouch: true,
            userAgent:
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
          }
        : {}),
    });
    await bridgeOfficialNetwork(c);
    c.setDefaultTimeout(10000);
    c.on("page", (p) =>
      p.on("pageerror", (e) => {
        errors.push(e.message);
        console.error("Wallet page exception:", e.message);
      }),
    );
    await c.exposeFunction("__squeekTestSign", async (hex: string) =>
      account.signMessage({ message: { raw: hex as Hex } }),
    );
    await c.addInitScript(
      ({ address, wrongNetwork, uuid, generic }) => {
        let authorized = false;
        let chain = wrongNetwork ? "0x1" : "0xaa36a7";
        const listeners = new Map<string, ((v: unknown) => void)[]>();
        const provider = {
          on: (event: string, fn: (v: unknown) => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
          },
          removeListener: (event: string, fn: (v: unknown) => void) => {
            listeners.set(
              event,
              (listeners.get(event) ?? []).filter((x) => x !== fn),
            );
          },
          request: async ({
            method,
            params,
          }: {
            method: string;
            params?: unknown[];
          }) => {
            if (method === "eth_requestAccounts") {
              authorized = true;
              return [address];
            }
            if (method === "eth_accounts") return authorized ? [address] : [];
            if (method === "eth_chainId") return chain;
            if (
              method === "wallet_switchEthereumChain" ||
              method === "wallet_addEthereumChain"
            ) {
              chain = (params?.[0] as { chainId: string }).chainId;
              for (const f of listeners.get("chainChanged") ?? []) f(chain);
              return null;
            }
            if (method === "personal_sign")
              return (
                window as unknown as {
                  __squeekTestSign: (h: unknown) => Promise<string>;
                }
              ).__squeekTestSign(params?.[0]);
            if (method === "wallet_getPermissions")
              return [{ parentCapability: "eth_accounts" }];
            if (method === "wallet_requestPermissions")
              return [{ parentCapability: "eth_accounts" }];
            throw Error(`Unsupported test wallet method: ${method}`);
          },
        };
        Object.defineProperty(window, "ethereum", {
          value: provider,
          configurable: true,
        });
        const detail = {
          info: {
            uuid,
            name: "Test EVM wallet",
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="green"/></svg>',
            rdns: "test.squeek.evm",
          },
          provider,
        };
        const announce = () =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", { detail }),
          );
        if (!generic) {
          window.addEventListener("eip6963:requestProvider", announce);
          announce();
        }
      },
      { address: account.address, wrongNetwork, uuid: randomUUID(), generic },
    );
    return c;
  }
  const a = privateKeyToAccount(generatePrivateKey()),
    b = privateKeyToAccount(generatePrivateKey());
  await check(
    "A mobile wallet browser with a generic injected provider can connect without a deep-link loop",
    async () => {
      const c = await walletContext(a, false, true, true);
      const p = await c.newPage();
      try {
        await p.goto(sharedBase);
        await p
          .getByRole("button", { name: "Connect wallet", exact: true })
          .click();
        await p
          .getByRole("button", { name: "Browser wallet", exact: true })
          .click();
        await p.locator(".wallet-button.connected").waitFor();
        assert.equal(
          await p
            .getByRole("link", { name: "Open in MetaMask", exact: true })
            .count(),
          0,
        );
      } finally {
        await c.close();
      }
    },
  );
  const cA = await walletContext(a, true),
    pA = await cA.newPage();
  await check(
    "EIP-6963 named wallet connects; wrong network is detected and switches to Sepolia",
    async () => {
      const response = await pA.goto(sharedBase);
      assert.equal(response?.status(), 200);
      await pA
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await pA
        .getByRole("button", { name: "Test EVM wallet", exact: true })
        .click();
      await pA.getByRole("button", { name: "Switch to Sepolia" }).waitFor();
      await pA.getByRole("button", { name: "Switch to Sepolia" }).click();
      await pA.locator(".wallet-button.connected").waitFor();
      await pA.waitForFunction(
        () =>
          !document
            .querySelector(".wallet-button")
            ?.textContent?.includes("Switch"),
      );
    },
  );
  await check(
    "Wallet message signing creates a service profile; shared leaderboard shows that real test signature",
    async () => {
      await pA.locator(".wallet-button").click();
      await pA.getByRole("button", { name: "Verify wallet ownership" }).click();
      await pA.waitForFunction(
        () => !!document.querySelector(".wallet-button .lucide-shield-check"),
      );
      await pA.locator('.sidebar nav a[href="#leaderboard"]').click();
      await pA.locator(".leaderboard-entry").waitFor();
      assert.equal(await pA.locator(".leaderboard-entry").count(), 1);
      const table = pA.getByRole("table", {
        name: "Global leaderboard",
        exact: true,
      });
      assert.equal(await table.getByRole("columnheader").count(), 5);
      assert.equal(await table.getByRole("row").count(), 2);
    },
  );
  const cB = await walletContext(b),
    pB = await cB.newPage();
  await check(
    "Two browser profiles share persistent global rankings; another device restores the same wallet",
    async () => {
      await pB.goto(sharedBase);
      await pB
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await pB.getByRole("button", { name: "Test EVM wallet" }).click();
      await pB.locator(".wallet-button.connected").click();
      await pB.getByRole("button", { name: "Verify wallet ownership" }).click();
      await pB.waitForFunction(
        () => !!document.querySelector(".wallet-button .lucide-shield-check"),
      );
      await pB.locator('.sidebar nav a[href="#leaderboard"]').click();
      await pB.waitForFunction(
        () => document.querySelectorAll(".leaderboard-entry").length === 2,
      );
      await pA.getByRole("button", { name: "Refresh rankings" }).click();
      await pA.waitForFunction(
        () => document.querySelectorAll(".leaderboard-entry").length === 2,
      );
      assert.equal(
        await pA.locator(".leaderboard-entry").count(),
        await pB.locator(".leaderboard-entry").count(),
      );
    },
  );
  await check(
    "Shared cloud save travels between independent browser contexts",
    async () => {
      await pA.locator('.sidebar nav a[href="#hamster"]').click();
      await pA.locator(".feed-action").click();
      await pA.getByRole("button", { name: "Settings", exact: true }).click();
      await pA.getByRole("button", { name: "Save to cloud" }).click();
      await pA.waitForFunction(
        () =>
          document.querySelector('[role="status"].live-announcement')
            ?.textContent === "Progress saved to your shared profile.",
      );
      const device = await walletContext(a);
      const pd = await device.newPage();
      await pd.goto(sharedBase);
      await pd
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await pd.getByRole("button", { name: "Test EVM wallet" }).click();
      await pd.locator(".wallet-button.connected").click();
      await pd.getByRole("button", { name: "Verify wallet ownership" }).click();
      await pd.waitForFunction(
        () => !!document.querySelector(".wallet-button .lucide-shield-check"),
      );
      const saved = await pd.evaluate(
        (address) =>
          JSON.parse(
            localStorage.getItem(`squeek.game.v1:${address.toLowerCase()}`)!,
          ),
        a.address,
      );
      assert.equal(saved.xp, 8);
      assert.equal(saved.seeds, 19);
      await device.close();
    },
  );
  await check(
    "Disconnect returns to the guest save and clears ownership",
    async () => {
      await pA
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog" })
        .click();
      await pA.locator(".wallet-button").click();
      await pA.getByRole("button", { name: "Disconnect wallet" }).click();
      await pA
        .getByRole("button", { name: "Connect wallet", exact: true })
        .waitFor();
      assert.equal(
        await pA.locator(".wallet-button .lucide-shield-check").count(),
        0,
      );
    },
  );
  await cA.close();
  await cB.close();
  await check(
    "WebKit renders the exported game and performs the primary feed interaction",
    async () => {
      webkit = await pw.webkit.launch({ headless: true });
      const p: Page = await webkit!.newPage({
        viewport: { width: 390, height: 844 },
      });
      await p.goto(base);
      await p.locator(".feed-action").click();
      const g = await p.evaluate(() =>
        JSON.parse(localStorage.getItem("squeek.game.v1:guest")!),
      );
      assert.equal(g.seeds, 19);
      assert.equal(g.xp, 8);
      await p.screenshot({
        path: "test/scratch/browser-checks/webkit-mobile.png",
      });
    },
  );
  await check("No uncaught application exceptions occurred", () =>
    assert.deepEqual(errors, []),
  );
} catch (e) {
  results.push({
    name: "Browser suite initialization or uncaught failure",
    passed: false,
    details: (e as Error).message,
  });
  console.error(e);
} finally {
  await chromium?.close();
  await (webkit as Browser | null)?.close();
  await new Promise<void>((r) => staticServer.close(() => r()));
  if (serviceServer)
    await new Promise<void>((r) => serviceServer!.close(() => r()));
  service?.close();
  await writeFile(
    "artifacts/browser-tests.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        networkBridge: process.env.SQUEEK_TEST_NETWORK_BRIDGE === "1",
        note: "Production export at /preview/. Wallet tests use an explicitly named test provider and generated in-memory accounts; no real MetaMask approval or Coinbase passkey ceremony was attempted. Shared-service tests use isolated SQLite and a fixed test registration frontier, not seeded production profiles.",
        remoteFailures: [...new Set(remoteFailures)],
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => !r.passed)) process.exitCode = 1;

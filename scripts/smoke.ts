import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFile, mkdir, rm } from "node:fs/promises";
import assert from "node:assert/strict";
const results: { name: string; passed: boolean; detail?: string }[] = [];
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, "127.0.0.1", () => r()));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((r) => probe.close(() => r()));
await mkdir("test/scratch/smoke", { recursive: true });
await rm("test/scratch/smoke/production.sqlite", { force: true });
await writeFile(
  "test/scratch/smoke/settings.json",
  JSON.stringify({
    port,
    publicOrigin: `http://127.0.0.1:${port}`,
    allowedOrigins: [`http://127.0.0.1:${port}`],
    databasePath: "test/scratch/smoke/production.sqlite",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  }),
);
const child = spawn(
  process.execPath,
  ["scripts/run.mjs", "server", "--config", "test/scratch/smoke/settings.json"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
child.stdout.on("data", (c) => (logs += c));
child.stderr.on("data", (c) => (logs += c));
const base = `http://127.0.0.1:${port}`;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, detail: (e as Error).message });
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
try {
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Production service did not start within 20 seconds.");
  await check(
    "Production npm-start entry serves the actual built game",
    async () => {
      const r = await fetch(base);
      assert.equal(r.status, 200);
      assert.ok((await r.text()).includes("Squeek Evolution"));
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    },
  );
  await check(
    "Production host advertises its real same-origin service",
    async () => {
      const r = await fetch(base + "/runtime-config.json");
      assert.deepEqual(await r.json(), {
        sameOriginService: true,
        serviceUrl: "",
      });
    },
  );
  await check(
    "Fresh persistent storage has an empty, truthful global leaderboard",
    async () => {
      const r = await fetch(base + "/api/leaderboard");
      assert.equal(r.status, 200);
      const b = (await r.json()) as {
        players: unknown[];
        totalPlayers: number;
        personal: unknown;
      };
      assert.deepEqual(b.players, []);
      assert.equal(b.totalPlayers, 0);
      assert.equal(b.personal, null);
    },
  );
  await check(
    "Private profiles require ownership and malformed requests fail safely",
    async () => {
      assert.equal((await fetch(base + "/api/profile")).status, 401);
      assert.equal(
        (
          await fetch(base + "/api/auth/challenge", {
            method: "POST",
            body: "not json",
            headers: { "Content-Type": "application/json" },
          })
        ).status,
        400,
      );
    },
  );
  await check("Production CORS refuses unconfigured origins", async () => {
    const r = await fetch(base + "/api/health", {
      headers: { Origin: "https://unconfigured-origin.invalid" },
    });
    assert.equal(r.status, 403);
  });
} catch (e) {
  results.push({
    name: "Production entry initialization",
    passed: false,
    detail: (e as Error).message,
  });
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((r) => {
    if (child.exitCode !== null) r();
    else {
      child.once("exit", () => r());
      setTimeout(() => {
        child.kill("SIGKILL");
        r();
      }, 3000).unref();
    }
  });
  await writeFile(
    "artifacts/server-smoke.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        note: "Runs the production server entry with its real HTTP implementation and a fresh persistent SQLite database. No users or scores are seeded.",
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => !r.passed)) process.exitCode = 1;

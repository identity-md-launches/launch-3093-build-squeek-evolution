import assert from "node:assert/strict";
import { mock } from "node:test";
import { officialFetch } from "../src/activity";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  verifyMessage,
  keccak256,
  toBytes,
  type PublicClient,
  type Hex,
} from "viem";
import {
  act,
  applyEvolution,
  newGame,
  tickGame,
  finishPlay,
  claimMission,
  stageFor,
  dayKey,
  isGame,
} from "../src/game";
import { CORE, IMPLEMENTATION } from "../src/chain";
import { createService, ApiError } from "../server/service";
import {
  VerificationError,
  verifySettlement,
  type VerifiedSettlement,
} from "../src/verification";
const results: { name: string; passed: boolean; error?: string }[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, error: (e as Error).message });
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
let now = Date.now();
await check(
  "All five care actions change actual game state; care XP stays separate from energy",
  () => {
    let g = newGame(now);
    const fed = act(g, "feed", now + 1000);
    assert.ok(
      fed.game.fullness > g.fullness + 21.9 &&
        fed.game.fullness <= g.fullness + 22,
    );
    assert.equal(fed.game.seeds, 19);
    assert.equal(fed.mode, "eating");
    assert.equal(fed.game.xp, 8);
    const pet = act(fed.game, "pet", now + 2000);
    assert.ok(pet.game.happiness > g.happiness);
    assert.equal(pet.mode, "reaction");
    const clean = act(pet.game, "clean", now + 3000);
    assert.equal(clean.game.cleanliness, 100);
    const sleep = act(clean.game, "sleep", now + 4000);
    assert.equal(sleep.mode, "sleeping");
    assert.equal(sleep.game.sleeping, true);
    const rest = tickGame(sleep.game, now + 604000);
    assert.ok(rest.rest > sleep.game.rest);
    const blocked = act(rest, "feed", now + 605000);
    assert.equal(blocked.game.seeds, rest.seeds);
    const awake = act(rest, "sleep", now + 606000);
    assert.equal(awake.game.sleeping, false);
    const play = act(awake.game, "play", now + 607000);
    assert.equal(play.mode, "running");
    assert.equal(play.game.counts.play, 0);
    const end = finishPlay(play.game, 8, true);
    assert.equal(end.counts.play, 1);
    assert.equal(end.xp, play.game.xp + 40);
    assert.ok(end.badges.includes("seed-champion"));
    assert.equal(stageFor(0), 0);
  },
);
await check(
  "Daily mission rewards cannot be claimed twice and reset at UTC midnight",
  () => {
    let g = newGame(now);
    g.counts.feed = 3;
    g = claimMission(g, "breakfast", false);
    assert.equal(g.seeds, 25);
    assert.deepEqual(claimMission(g, "breakfast", false), g);
    const tomorrow = tickGame(g, now + 86400000);
    assert.equal(tomorrow.counts.feed, 0);
    assert.equal(tomorrow.claimed.length, 0);
    assert.equal(tomorrow.seeds, 30);
    assert.notEqual(dayKey(now), tomorrow.day);
  },
);
await check("Evolution thresholds use only verified energy", () => {
  assert.equal(stageFor(99), 0);
  assert.equal(stageFor(100), 1);
  assert.equal(stageFor(999), 1);
  assert.equal(stageFor(1000), 2);
});
await check("Malformed transaction hashes fail before RPC access", async () => {
  await assert.rejects(
    () => verifySettlement({} as PublicClient, "0xnot-a-transaction"),
    VerificationError,
  );
});
await check("Wrong RPC network fails closed", async () => {
  await assert.rejects(
    () =>
      verifySettlement(
        { getChainId: async () => 1 } as unknown as PublicClient,
        keccak256(toBytes("test-hash")),
      ),
    /not Ethereum Sepolia/,
  );
});
await check(
  "Corrupt local or cloud saves are rejected before they can break the game",
  () => {
    assert.ok(isGame(newGame(now)));
    assert.equal(isGame({ version: 1, health: 100 }), false);
    const bad = { ...newGame(now), sleeping: "yes" };
    assert.equal(isGame(bad), false);
    assert.equal(
      isGame({ ...newGame(now), badges: ["legendary"] }),
      false,
      "Care saves cannot fabricate chain achievements",
    );
  },
);
await check(
  "Evolution grants every crossed stage reward exactly once, including a direct Legendary jump",
  () => {
    const baby = newGame(now);
    assert.equal(applyEvolution(baby, 99).seedsReward, 0);
    const young = applyEvolution(baby, 106);
    assert.equal(young.seedsReward, 20);
    assert.equal(young.game.appearance, "cream");
    assert.equal(applyEvolution(young.game, 106).seedsReward, 0);
    const legendary = applyEvolution(young.game, 1000);
    assert.equal(legendary.seedsReward, 50);
    assert.equal(legendary.game.appearance, "cosmic");
    const jump = applyEvolution(baby, 1000);
    assert.equal(jump.seedsReward, 70);
    assert.deepEqual(jump.game.evolutionRewards, [1, 2]);
    assert.equal(applyEvolution(jump.game, 1200).game.seeds, 90);
  },
);
const txFixtureHash = keccak256(toBytes("test-only transaction receipt"));
await check(
  "Missing receipts are unavailable rather than zero work",
  async () => {
    const c = {
      getChainId: async () => 11155111,
      getTransactionReceipt: async () => {
        throw Error("offline");
      },
    } as unknown as PublicClient;
    await assert.rejects(
      () => verifySettlement(c, txFixtureHash),
      (e) => e instanceof VerificationError && e.status === "UNAVAILABLE",
    );
  },
);
await check(
  "Reverted and wrong-contract receipts cannot earn rewards",
  async () => {
    const c = {
      getChainId: async () => 11155111,
      getTransactionReceipt: async () => ({ status: "reverted" }),
    } as unknown as PublicClient;
    await assert.rejects(() => verifySettlement(c, txFixtureHash), /reverted/);
    const wrong = {
      getChainId: async () => 11155111,
      getTransactionReceipt: async () => ({
        status: "success",
        to: IMPLEMENTATION,
      }),
    } as unknown as PublicClient;
    await assert.rejects(
      () => verifySettlement(wrong, txFixtureHash),
      /does not call the official/,
    );
  },
);
await check(
  "A pending or noncanonical receipt cannot be promoted to confirmed",
  async () => {
    const hash = keccak256(toBytes("test-only block"));
    const c = {
      getChainId: async () => 11155111,
      getTransactionReceipt: async () => ({
        status: "success",
        to: CORE,
        blockNumber: 100n,
        blockHash: hash,
      }),
      getBlockNumber: async () => 105n,
      getBlock: async () => ({ hash }),
      getTransaction: async () => ({ blockHash: hash, chainId: 11155111 }),
    } as unknown as PublicClient;
    await assert.rejects(
      () => verifySettlement(c, txFixtureHash),
      (e) => e instanceof VerificationError && e.status === "PENDING",
    );
    const reorg = {
      ...c,
      getBlock: async () => ({
        hash: keccak256(toBytes("test-only different canonical block")),
      }),
    } as unknown as PublicClient;
    await assert.rejects(
      () => verifySettlement(reorg, txFixtureHash),
      /canonical chain/,
    );
  },
);
await check(
  "Verification deadline returns unavailable and prevents later RPC phases",
  async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let resolveChain: (value: number) => void = () => {};
      let receiptCalled = false;
      const c = {
        getChainId: () =>
          new Promise<number>((resolve) => {
            resolveChain = resolve;
          }),
        getTransactionReceipt: async () => {
          receiptCalled = true;
          throw Error("should not run");
        },
      } as unknown as PublicClient;
      const pending = verifySettlement(c, txFixtureHash);
      mock.timers.tick(45001);
      await assert.rejects(
        pending,
        (e) => e instanceof VerificationError && e.status === "UNAVAILABLE",
      );
      resolveChain(11155111);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(receiptCalled, false);
    } finally {
      mock.timers.reset();
    }
  },
);
await check(
  "Malformed official responses fail closed while missing observations remain unknown",
  async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        Response.json({
          schemaVersion: 1,
          status: "available",
          chain: { chainId: "11155111" },
          identities: { core: CORE },
        })) as typeof fetch;
      await assert.rejects(() => officialFetch("/core"), /incomplete/);
      globalThis.fetch = (async () =>
        Response.json({
          schemaVersion: 1,
          activity: {
            coverage: { coverageBps: 50 },
            days: [
              {
                date: "2026-11-07",
                coverage: { observedRoundCount: 1 },
                observedWorkUnits: null,
              },
            ],
          },
        })) as typeof fetch;
      const data = await officialFetch<{
        activity: { days: { observedWorkUnits: string | null }[] };
      }>("/measurement/stats?range=7d");
      assert.equal(data.activity.days[0].observedWorkUnits, null);
    } finally {
      globalThis.fetch = original;
    }
  },
);
const accountA = privateKeyToAccount(generatePrivateKey()),
  accountB = privateKeyToAccount(generatePrivateKey());
const blockHash = keccak256(toBytes("test-only canonical block"));
let canonicalHash: Hex = blockHash;
const fakeClient = {
  verifyMessage: async (args: Parameters<typeof verifyMessage>[0]) =>
    verifyMessage(args),
  getBlock: async () => ({ hash: canonicalHash }),
} as unknown as PublicClient;
const proof = (
  label: string,
  round: string,
  work: string,
): VerifiedSettlement => ({
  hash: keccak256(toBytes(label)),
  blockHash,
  blockNumber: "110",
  timestamp: Math.floor(now / 1000) + 1,
  confirmations: "12",
  work,
  blocks: "1",
  through: round,
  logIndex: 1,
  rounds: [{ id: round, work, dataHash: keccak256(toBytes(label + "-data")) }],
});
const pA = proof("test-only-a", "11", "1000"),
  pB = proof("test-only-b", "12", "2000"),
  pOld = { ...proof("test-only-old", "9", "1000"), blockNumber: "99" };
const fixtures = new Map([pA, pB, pOld].map((p) => [p.hash, p]));
await mkdir("test/scratch/tests", { recursive: true });
const databasePath = "test/scratch/tests/service.sqlite";
await rm(databasePath, { force: true });
const opts = {
  databasePath,
  publicOrigin: "http://localhost:8787",
  client: fakeClient,
  now: () => now,
  frontier: async () => ({ round: 10n, block: 100n }),
  verify: async (hash: string) => {
    const p = fixtures.get(hash as Hex);
    if (!p) throw new VerificationError("No valid proof.");
    return p;
  },
};
let service = createService(opts);
async function login(account: typeof accountA) {
  const c = (await service.handle(
    "POST",
    "/api/auth/challenge",
    { address: account.address },
    "",
  )) as { nonce: string; message: string };
  const signature = await account.signMessage({ message: c.message });
  const r = (await service.handle(
    "POST",
    "/api/auth/verify",
    { nonce: c.nonce, signature },
    "",
  )) as { token: string; profile: Record<string, unknown> };
  return { ...r, challenge: c, signature };
}
let a: Awaited<ReturnType<typeof login>>,
  a2: Awaited<ReturnType<typeof login>>,
  b: Awaited<ReturnType<typeof login>>;
await check(
  "Two real cryptographic ownership signatures create separate shared profiles",
  async () => {
    a = await login(accountA);
    b = await login(accountB);
    assert.notEqual(a.token, b.token);
    const leaderboard = (await service.handle(
      "GET",
      "/api/leaderboard",
      {},
      "",
    )) as { totalPlayers: number };
    assert.equal(leaderboard.totalPlayers, 2);
  },
);
await check("Used sign-in nonce cannot be replayed", async () => {
  await assert.rejects(
    () =>
      service.handle(
        "POST",
        "/api/auth/verify",
        { nonce: a.challenge.nonce, signature: a.signature },
        "",
      ),
    (e) => e instanceof ApiError && e.status === 401,
  );
});
await check("Wrong wallet signature is rejected", async () => {
  const c = (await service.handle(
    "POST",
    "/api/auth/challenge",
    { address: accountA.address },
    "",
  )) as { nonce: string; message: string };
  const signature = await accountB.signMessage({ message: c.message });
  await assert.rejects(
    () =>
      service.handle(
        "POST",
        "/api/auth/verify",
        { nonce: c.nonce, signature },
        "",
      ),
    /does not prove ownership/,
  );
});
await check(
  "Unauthenticated score or claim submissions are refused",
  async () => {
    await assert.rejects(
      () =>
        service.handle(
          "POST",
          "/api/claims",
          { hash: pA.hash, score: 999999 },
          "",
        ),
      /Verify wallet ownership/,
    );
  },
);
await check("A settlement before registration cannot earn energy", async () => {
  await assert.rejects(
    () => service.handle("POST", "/api/claims", { hash: pOld.hash }, a.token),
    /predates/,
  );
});
await check(
  "Verified work earns energy; duplicate rounds and client-supplied scores cannot inflate it",
  async () => {
    const r = (await service.handle(
      "POST",
      "/api/claims",
      { hash: pA.hash, energy: 999999, score: 999999 },
      a.token,
    )) as {
      profile: { energy: number; level: number; score: number };
      addedRounds: number;
    };
    assert.equal(r.profile.energy, 100);
    assert.equal(r.profile.level, 1);
    assert.equal(r.profile.score, 10550);
    const duplicate = (await service.handle(
      "POST",
      "/api/claims",
      { hash: pA.hash },
      a.token,
    )) as {
      addedRounds: number;
      duplicate: boolean;
      profile: { energy: number };
    };
    assert.equal(duplicate.addedRounds, 0);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.profile.energy, 100);
  },
);
await check(
  "Two independent sessions see the same wallet profile and global rank",
  async () => {
    a2 = await login(accountA);
    const profile = (await service.handle(
      "GET",
      "/api/profile",
      {},
      a2.token,
    )) as { energy: number };
    assert.equal(profile.energy, 100);
    await service.handle("POST", "/api/claims", { hash: pB.hash }, b.token);
    const first = await service.handle("GET", "/api/leaderboard", {}, a.token),
      second = await service.handle("GET", "/api/leaderboard", {}, b.token);
    assert.deepEqual(
      (first as { players: unknown }).players,
      (second as { players: unknown }).players,
    );
    assert.equal((first as { personal: { rank: number } }).personal.rank, 2);
    assert.equal((second as { personal: { rank: number } }).personal.rank, 1);
    const board = first as { players: { address: string; rank: number }[] };
    assert.equal(board.players[0].address, accountB.address.toLowerCase());
    assert.equal(board.players[1].rank, 2);
  },
);
await check(
  "Cloud save revisions prevent silent overwrites from another device",
  async () => {
    const game = newGame(now);
    game.xp = 42;
    await service.handle(
      "PUT",
      "/api/profile/game",
      { game, revision: 0 },
      a.token,
    );
    await assert.rejects(
      () =>
        service.handle(
          "PUT",
          "/api/profile/game",
          { game, revision: 0 },
          a2.token,
        ),
      /newer save/,
    );
    const p = (await service.handle("GET", "/api/profile", {}, a2.token)) as {
      game: { xp: number };
    };
    assert.equal(p.game.xp, 42);
  },
);
await check(
  "Profiles, claims, sessions and leaderboard survive a database restart",
  async () => {
    const before = await service.handle("GET", "/api/leaderboard", {}, "");
    service.close();
    service = createService(opts);
    assert.deepEqual(
      await service.handle("GET", "/api/leaderboard", {}, ""),
      before,
    );
    const p = (await service.handle("GET", "/api/profile", {}, a2.token)) as {
      energy: number;
    };
    assert.equal(p.energy, 100);
  },
);
await check(
  "NFT preparation exports evidence without inventing a mint or contract",
  async () => {
    const m = (await service.handle(
      "GET",
      "/api/achievements/metadata",
      {},
      a.token,
    )) as {
      properties: { mintStatus: string; owner: string; proofs: unknown[] };
      image: string;
    };
    assert.equal(m.properties.mintStatus, "not-minted");
    assert.equal(m.properties.owner, accountA.address.toLowerCase());
    assert.ok(m.properties.proofs.length);
    assert.ok(m.image.endsWith("/favicon.svg"));
  },
);
await check(
  "Canonical block reconciliation removes rewards from reorged blocks",
  async () => {
    canonicalHash = keccak256(toBytes("test-only reorg replacement"));
    now += 31000;
    const board = (await service.handle("GET", "/api/leaderboard", {}, "")) as {
      players: { energy: number }[];
    };
    assert.ok(board.players.every((p) => p.energy === 0));
  },
);
await check("Expired ownership challenges are rejected", async () => {
  const c = (await service.handle(
    "POST",
    "/api/auth/challenge",
    { address: accountA.address },
    "",
  )) as { nonce: string; message: string };
  const signature = await accountA.signMessage({ message: c.message });
  now += 301000;
  await assert.rejects(
    () =>
      service.handle(
        "POST",
        "/api/auth/verify",
        { nonce: c.nonce, signature },
        "",
      ),
    /expired/,
  );
});
await check("Disconnect revokes the shared session", async () => {
  await service.handle("POST", "/api/auth/logout", {}, a.token);
  await assert.rejects(
    () => service.handle("GET", "/api/profile", {}, a.token),
    /Verify wallet ownership/,
  );
});
service.close();
await writeFile(
  "artifacts/unit-service-tests.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      note: "Isolated tests use generated in-memory signing keys and explicitly injected settlement fixtures. No test accounts or scores enter the product.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;

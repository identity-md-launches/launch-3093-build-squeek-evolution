import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { createSiweMessage } from "viem/siwe";
import { CORE, CHAIN_ID, CONFIRMATIONS, coreAbi } from "../src/chain";
import {
  verifyIdentity,
  verifySettlement,
  type VerifiedSettlement,
  VerificationError,
} from "../src/verification";
import { newGame, stageFor, STAGES, isGame } from "../src/game";
export type ServiceOptions = {
  databasePath: string;
  publicOrigin: string;
  client: PublicClient;
  now?: () => number;
  verify?: (hash: string) => Promise<VerifiedSettlement>;
  frontier?: () => Promise<{ round: bigint; block: bigint }>;
};
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const string = (v: unknown) => (typeof v === "string" ? v : "");
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createService(options: ServiceOptions) {
  const now = options.now ?? Date.now,
    client = options.client;
  const db = new DatabaseSync(options.databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS profiles(address TEXT PRIMARY KEY,name TEXT NOT NULL,joined_at INTEGER NOT NULL,baseline_round TEXT NOT NULL,baseline_block TEXT NOT NULL,game TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS challenges(nonce TEXT PRIMARY KEY,address TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,address TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS claims(address TEXT NOT NULL,core TEXT NOT NULL,round_id TEXT NOT NULL,work INTEGER NOT NULL,tx_hash TEXT NOT NULL,block_hash TEXT NOT NULL,block_number TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(address,core,round_id),FOREIGN KEY(address) REFERENCES profiles(address));
 CREATE INDEX IF NOT EXISTS claims_address ON claims(address);`);
  const frontier =
    options.frontier ??
    (async () => {
      const tip = await client.getBlockNumber({ cacheTime: 0 }),
        block = tip - CONFIRMATIONS + 1n;
      await verifyIdentity(client, block);
      const s = await client.readContract({
        address: CORE,
        abi: coreAbi,
        functionName: "state",
        blockNumber: block,
      });
      return { round: s.settledThroughRound, block };
    });
  const verify = options.verify ?? ((hash) => verifySettlement(client, hash));
  function address(value: unknown): Address {
    try {
      return getAddress(string(value));
    } catch {
      throw new ApiError(400, "Enter a valid Ethereum wallet address.");
    }
  }
  function auth(token: string): string {
    const row = db
      .prepare("SELECT address FROM sessions WHERE token_hash=? AND expires>?")
      .get(digest(token), now());
    if (!row) throw new ApiError(401, "Verify wallet ownership to continue.");
    return row.address as string;
  }
  let lastReconciled = 0;
  async function reconcile() {
    if (now() - lastReconciled < 30000) return;
    const blocks = db
      .prepare("SELECT DISTINCT block_number,block_hash FROM claims")
      .all();
    const changed: string[] = [];
    for (const b of blocks) {
      const canonical = await client.getBlock({
        blockNumber: BigInt(b.block_number as string),
      });
      if (
        canonical.hash?.toLowerCase() !== (b.block_hash as string).toLowerCase()
      )
        changed.push(b.block_hash as string);
    }
    if (changed.length) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const hash of changed)
          db.prepare("DELETE FROM claims WHERE block_hash=?").run(hash);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    lastReconciled = now();
  }
  function ranking() {
    const rows = db
      .prepare(
        `SELECT p.address,p.name,p.joined_at,COALESCE(SUM(c.work),0) work,COUNT(c.round_id) rounds FROM profiles p LEFT JOIN claims c ON c.address=p.address GROUP BY p.address ORDER BY p.joined_at ASC`,
      )
      .all();
    return rows
      .map((r) => {
        const energy = Math.floor(Number(r.work) / 10),
          level = stageFor(energy),
          rounds = Number(r.rounds);
        const badges = [
          ...(rounds > 0 ? ["first-proof"] : []),
          ...(rounds >= 10 ? ["wheel-witness"] : []),
          ...(level >= 1 ? ["young"] : []),
          ...(level === 2 ? ["legendary"] : []),
        ];
        return {
          address: r.address as string,
          name: r.name as string,
          energy,
          rounds,
          level,
          stage: STAGES[level],
          appearance:
            level === 2 ? "cosmic" : level === 1 ? "cream" : "classic",
          badges,
          score: energy * 100 + badges.length * 25 + level * 500,
        };
      })
      .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }
  function profile(a: string) {
    const p = db.prepare("SELECT * FROM profiles WHERE address=?").get(a);
    if (!p) throw new ApiError(404, "Create a wallet profile first.");
    return {
      ...ranking().find((r) => r.address === a),
      joinedAt: p.joined_at,
      baselineRound: p.baseline_round,
      game: JSON.parse(p.game as string),
      revision: p.revision,
      claims: db
        .prepare(
          "SELECT DISTINCT tx_hash hash,block_hash blockHash,block_number blockNumber FROM claims WHERE address=?",
        )
        .all(a),
    };
  }
  async function handle(
    method: string,
    path: string,
    body: Record<string, unknown>,
    token: string,
  ) {
    db.prepare("DELETE FROM challenges WHERE expires<?").run(now());
    db.prepare("DELETE FROM sessions WHERE expires<?").run(now());
    if (method === "GET" && path === "/api/health")
      return {
        status: "available",
        chainId: CHAIN_ID,
        storage: "sqlite",
        core: CORE,
      };
    if (method === "GET" && path === "/api/leaderboard") {
      await reconcile();
      const players = ranking();
      let personal = null;
      if (token) {
        try {
          const a = auth(token);
          personal = players.find((p) => p.address === a) ?? null;
        } catch {
          /* Public rankings remain readable after a session expires. */
        }
      }
      return {
        personal,
        status: "available",
        players: players.slice(0, 100),
        totalPlayers: players.length,
        generatedAt: new Date(now()).toISOString(),
        ranking:
          "energy × 100 + chain achievements × 25 + evolution stage × 500",
      };
    }
    if (method === "POST" && path === "/api/auth/challenge") {
      const a = address(body.address),
        nonce = randomBytes(16).toString("hex"),
        issued = new Date(now());
      const message = createSiweMessage({
        domain: new URL(options.publicOrigin).host,
        address: a,
        statement:
          "Link your Squeek Evolution profile. This signs in only; no transaction or token approval.",
        uri: options.publicOrigin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
        issuedAt: issued,
        expirationTime: new Date(now() + 300000),
      });
      db.prepare("INSERT INTO challenges VALUES(?,?,?,?)").run(
        nonce,
        a.toLowerCase(),
        message,
        now() + 300000,
      );
      return { nonce, message, expiresAt: now() + 300000 };
    }
    if (method === "POST" && path === "/api/auth/verify") {
      const nonce = string(body.nonce),
        signature = string(body.signature);
      if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length > 20000)
        throw new ApiError(400, "Wallet signature is malformed.");
      const c = db
        .prepare("SELECT * FROM challenges WHERE nonce=? AND expires>?")
        .get(nonce, now());
      if (!c)
        throw new ApiError(
          401,
          "Sign-in expired or already used. Request a new message.",
        );
      if (
        !(await client.verifyMessage({
          address: getAddress(c.address as string),
          message: c.message as string,
          signature: signature as Hex,
        }))
      )
        throw new ApiError(
          401,
          "The signature does not prove ownership of this wallet.",
        );
      const a = c.address as string;
      let f: { round: bigint; block: bigint } | null = null;
      if (!db.prepare("SELECT address FROM profiles WHERE address=?").get(a))
        f = await frontier();
      const session = randomBytes(32).toString("hex");
      db.exec("BEGIN IMMEDIATE");
      try {
        const removed = db
          .prepare("DELETE FROM challenges WHERE nonce=? AND expires>?")
          .run(nonce, now());
        if (removed.changes !== 1)
          throw new ApiError(
            401,
            "This challenge was already used. Request a new one.",
          );
        if (f)
          db.prepare(
            "INSERT OR IGNORE INTO profiles(address,name,joined_at,baseline_round,baseline_block,game) VALUES(?,?,?,?,?,?)",
          ).run(
            a,
            "Mochi",
            now(),
            f.round.toString(),
            f.block.toString(),
            JSON.stringify(newGame(now())),
          );
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          digest(session),
          a,
          now() + 86400000,
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { token: session, profile: profile(a) };
    }
    if (method === "POST" && path === "/api/auth/logout") {
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
      return { ok: true };
    }
    const a = auth(token);
    if (method === "GET" && path === "/api/profile") {
      await reconcile();
      return profile(a);
    }
    if (method === "PATCH" && path === "/api/profile") {
      const name = string(body.name).trim();
      if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(name))
        throw new ApiError(
          400,
          "Use 1–24 letters, numbers, spaces, underscores or hyphens.",
        );
      db.prepare("UPDATE profiles SET name=? WHERE address=?").run(name, a);
      return profile(a);
    }
    if (method === "PUT" && path === "/api/profile/game") {
      const game = body.game as ReturnType<typeof newGame>;
      if (!isGame(game)) throw new ApiError(400, "Save format is unsupported.");
      for (const k of [
        "health",
        "happiness",
        "fullness",
        "rest",
        "cleanliness",
        "xp",
        "seeds",
      ] as const)
        if (
          typeof game[k] !== "number" ||
          !Number.isFinite(game[k]) ||
          game[k] < 0 ||
          game[k] > (["xp", "seeds"].includes(k) ? 10000000 : 100)
        )
          throw new ApiError(400, "Save contains invalid game values.");
      if (JSON.stringify(game).length > 48000)
        throw new ApiError(400, "Save is too large.");
      const r = db
        .prepare(
          "UPDATE profiles SET game=?,revision=revision+1 WHERE address=? AND revision=?",
        )
        .run(JSON.stringify(game), a, Number(body.revision));
      if (r.changes !== 1)
        throw new ApiError(
          409,
          "A newer save exists on another device. Load the cloud save before saving again.",
        );
      return profile(a);
    }
    if (method === "POST" && path === "/api/claims") {
      await reconcile();
      const verified = await verify(string(body.hash));
      const p = db
        .prepare(
          "SELECT baseline_round,baseline_block,joined_at FROM profiles WHERE address=?",
        )
        .get(a)!;
      if (
        BigInt(verified.blockNumber) <= BigInt(p.baseline_block as string) ||
        verified.timestamp * 1000 < Number(p.joined_at)
      )
        throw new ApiError(
          422,
          "This settlement predates your profile. Only new work after joining earns energy.",
        );
      const eligible = verified.rounds.filter(
        (r) => BigInt(r.id) > BigInt(p.baseline_round as string),
      );
      if (!eligible.length)
        throw new ApiError(422, "No new active rounds in this settlement.");
      db.exec("BEGIN IMMEDIATE");
      let added = 0;
      try {
        for (const r of eligible) {
          const result = db
            .prepare("INSERT OR IGNORE INTO claims VALUES(?,?,?,?,?,?,?,?)")
            .run(
              a,
              CORE,
              r.id,
              Number(r.work),
              verified.hash,
              verified.blockHash,
              verified.blockNumber,
              now(),
            );
          added += Number(result.changes);
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return {
        status: "CONFIRMED",
        addedRounds: added,
        duplicate: added === 0,
        verification: verified,
        profile: profile(a),
      };
    }
    if (method === "GET" && path === "/api/achievements/metadata") {
      const p = profile(a);
      return {
        name: `${p.name} · Squeek Evolution`,
        description:
          "Offchain game achievements backed by verified Sepolia work. No NFT has been minted.",
        image: new URL("/favicon.svg", options.publicOrigin).href,
        attributes: [
          { trait_type: "Evolution", value: p.stage },
          { trait_type: "Verified Evolution Energy", value: p.energy },
        ],
        properties: {
          chainId: CHAIN_ID,
          core: CORE,
          owner: a,
          achievements: p.badges,
          proofs: p.claims,
          mintStatus: "not-minted",
        },
      };
    }
    throw new ApiError(404, "API route not found.");
  }
  return { handle, db, close: () => db.close() };
}
export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return { status: e.status, error: e.message };
  if (e instanceof VerificationError)
    return {
      status: e.status === "PENDING" ? 409 : 422,
      error: e.message,
      verificationStatus: e.status,
    };
  return {
    status: 503,
    error:
      "Verification service is unavailable. Check the connection and try again.",
  };
}

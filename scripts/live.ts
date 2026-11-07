import { writeFile } from "node:fs/promises";
import {
  officialFetch,
  type Status,
  type Stats,
  type Settlements,
  type CoreData,
} from "../src/activity";
import {
  API,
  CORE,
  RPC_URL,
  RELEASE,
  publicClient,
  CHAIN_ID,
} from "../src/chain";
import { verifySettlement } from "../src/verification";
const results: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  chainId: CHAIN_ID,
  core: CORE,
  release: RELEASE,
  rpcSource: RPC_URL,
};
const paths = [
  "/status",
  "/measurement/stats?range=7d",
  "/settlements",
  "/core",
];
let settlements: Settlements | null = null;
for (const path of paths) {
  try {
    const d = await officialFetch<Status | Stats | Settlements | CoreData>(
      path,
    );
    results[API + path] = {
      ok: true,
      ...("generatedAt" in d ? { generatedAt: d.generatedAt } : {}),
      ...("chain" in d ? { chain: d.chain } : {}),
      ...("identities" in d ? { identities: d.identities } : {}),
      ...("recentSettlements" in d
        ? { recentCount: d.recentSettlements.length }
        : {}),
    };
    if ("recentSettlements" in d) settlements = d;
  } catch (e) {
    results[API + path] = { ok: false, error: (e as Error).message };
  }
}
if (settlements?.recentSettlements[0]) {
  const hash = settlements.recentSettlements[0].transactionHash;
  try {
    results.receiptVerification = {
      ok: true,
      ...(await verifySettlement(publicClient, hash)),
    };
  } catch (e) {
    results.receiptVerification = {
      ok: false,
      hash,
      error: (e as Error).message,
    };
  }
}
await writeFile(
  "artifacts/live-integration.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));

if (
  paths.some((path) => (results[API + path] as { ok: boolean }).ok !== true) ||
  (results.receiptVerification as { ok?: boolean } | undefined)?.ok !== true
)
  process.exitCode = 1;

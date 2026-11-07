import {
  decodeEventLog,
  keccak256,
  parseAbi,
  type Hex,
  type PublicClient,
} from "viem";
import {
  CHAIN_ID,
  CORE,
  IMPLEMENTATION,
  RUNTIME_HASH,
  LAYOUT,
  PROXY_ADMIN,
  TIMELOCK,
  STREAM,
  CONFIRMATIONS,
  coreAbi,
} from "./chain";
const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
export class VerificationError extends Error {
  constructor(
    message: string,
    public status: "PENDING" | "UNAVAILABLE" | "REJECTED" = "REJECTED",
  ) {
    super(message);
  }
}
const same = (a: string | undefined, b: string) =>
  a?.toLowerCase() === b.toLowerCase();
export async function verifyIdentity(
  client: PublicClient,
  blockNumber: bigint,
  ensureActive: () => void = () => {},
) {
  if ((await client.getChainId()) !== CHAIN_ID)
    throw new VerificationError("RPC is not Ethereum Sepolia.");
  ensureActive();
  const [implementation, admin, code, layout, owner, configuration] =
    await Promise.all([
      client.getStorageAt({
        address: CORE,
        slot: implementationSlot,
        blockNumber,
      }),
      client.getStorageAt({ address: CORE, slot: adminSlot, blockNumber }),
      client.getCode({ address: IMPLEMENTATION, blockNumber }),
      client.readContract({
        address: CORE,
        abi: coreAbi,
        functionName: "implementationStorageLayoutDigest",
        blockNumber,
      }),
      client.readContract({
        address: PROXY_ADMIN,
        abi: parseAbi(["function owner() view returns (address)"]),
        functionName: "owner",
        blockNumber,
      }),
      client.readContract({
        address: CORE,
        abi: coreAbi,
        functionName: "configuration",
        blockNumber,
      }),
    ]);
  ensureActive();
  if (
    !same(implementation?.slice(-40), IMPLEMENTATION.slice(2)) ||
    !same(admin?.slice(-40), PROXY_ADMIN.slice(2)) ||
    !code ||
    keccak256(code) !== RUNTIME_HASH ||
    layout !== LAYOUT ||
    !same(owner, TIMELOCK) ||
    configuration.streamId !== STREAM
  )
    throw new VerificationError(
      "Official core identity changed. Rewards paused until the deployment is reviewed.",
      "UNAVAILABLE",
    );
  return configuration;
}
export type VerifiedSettlement = {
  hash: Hex;
  blockHash: Hex;
  blockNumber: string;
  timestamp: number;
  confirmations: string;
  work: string;
  blocks: string;
  rounds: { id: string; work: string; dataHash: Hex }[];
  through: string;
  logIndex: number;
};
export async function verifySettlement(
  client: PublicClient,
  hash: string,
): Promise<VerifiedSettlement> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const ensureActive = () => {
    if (expired)
      throw new VerificationError(
        "Sepolia verification took too long. No energy was added. Try again.",
        "UNAVAILABLE",
      );
  };
  try {
    return await Promise.race([
      readSettlement(client, hash, ensureActive),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          expired = true;
          reject(
            new VerificationError(
              "Sepolia verification took too long. No energy was added. Try again.",
              "UNAVAILABLE",
            ),
          );
        }, 45_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
async function readSettlement(
  client: PublicClient,
  hash: string,
  ensureActive: () => void,
): Promise<VerifiedSettlement> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash))
    throw new VerificationError(
      "Enter a complete 0x transaction hash with 64 hexadecimal characters.",
    );
  if ((await client.getChainId()) !== CHAIN_ID)
    throw new VerificationError("RPC is not Ethereum Sepolia.");
  ensureActive();
  const txHash = hash as Hex;
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    throw new VerificationError(
      "Receipt unavailable on Sepolia. Check the hash or try again.",
      "UNAVAILABLE",
    );
  }
  ensureActive();
  if (receipt.status !== "success")
    throw new VerificationError(
      "This transaction reverted. It cannot earn rewards.",
    );
  if (!same(receipt.to ?? undefined, CORE))
    throw new VerificationError(
      "This transaction does not call the official SqueekCore.",
    );
  const [tip, block, transaction] = await Promise.all([
    client.getBlockNumber({ cacheTime: 0 }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getTransaction({ hash: txHash }),
  ]);
  ensureActive();
  if (block.hash !== receipt.blockHash || transaction.blockHash !== block.hash)
    throw new VerificationError(
      "Receipt is not in the canonical chain.",
      "PENDING",
    );
  if (transaction.chainId !== CHAIN_ID)
    throw new VerificationError("Transaction chain ID does not match Sepolia.");
  const confirmations = tip - receipt.blockNumber + 1n;
  if (confirmations < CONFIRMATIONS)
    throw new VerificationError(
      `Waiting for confirmations: ${confirmations}/${CONFIRMATIONS}.`,
      "PENDING",
    );
  await verifyIdentity(client, receipt.blockNumber, ensureActive);
  ensureActive();
  const logs = receipt.logs.filter((l) => same(l.address, CORE));
  const batches = logs.flatMap((l) => {
    try {
      const e = decodeEventLog({
        abi: coreAbi,
        data: l.data,
        topics: l.topics,
      });
      return e.eventName === "BatchSettled"
        ? [{ ...e, logIndex: l.logIndex }]
        : [];
    } catch {
      return [];
    }
  });
  if (batches.length !== 1)
    throw new VerificationError(
      "Expected exactly one official BatchSettled event.",
    );
  const batch = batches[0].args;
  const rounds = logs.flatMap((l) => {
    try {
      const e = decodeEventLog({
        abi: coreAbi,
        data: l.data,
        topics: l.topics,
      });
      return e.eventName === "RoundRecorded" ? [e.args] : [];
    } catch {
      return [];
    }
  });
  if (rounds.length !== Number(batch.activeRoundCount))
    throw new VerificationError(
      "Settlement round count does not match its events.",
    );
  const [page, state] = await Promise.all([
    client.readContract({
      address: CORE,
      abi: coreAbi,
      functionName: "roundPage",
      args: [batch.previousSettledThroughRound, batch.settledThroughRound, 16n],
      blockNumber: receipt.blockNumber,
    }),
    client.readContract({
      address: CORE,
      abi: coreAbi,
      functionName: "state",
      blockNumber: receipt.blockNumber,
    }),
  ]);
  ensureActive();
  const work = rounds.reduce((n, r) => n + r.work, 0n);
  if (
    page.certifiedThroughRound !== batch.settledThroughRound ||
    page.rounds.length !== rounds.length ||
    page.end.cumulativeWork !== batch.cumulativeWork ||
    page.end.cumulativeBlockUnits !== batch.cumulativeBlockUnits ||
    page.end.cumulativeWork - page.start.cumulativeWork !== work ||
    state.settledThroughRound < batch.settledThroughRound ||
    state.cumulativeWork < batch.cumulativeWork ||
    state.authorizationNonce <= batch.nonce
  )
    throw new VerificationError(
      "Receipt events do not reconcile with the settled core ledger.",
    );
  let previousWork = page.start.cumulativeWork;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i],
      p = page.rounds[i];
    if (
      r.roundId !== p.roundId ||
      r.dataHash !== p.dataHash ||
      r.cumulativeWork !== p.cumulativeWork ||
      r.cumulativeBlockUnits !== p.cumulativeBlockUnits ||
      r.cumulativeWork - previousWork !== r.work ||
      r.work <= 0n
    )
      throw new VerificationError(
        "A round does not match the official ledger.",
      );
    previousWork = r.cumulativeWork;
  }
  const blocks =
    page.end.cumulativeBlockUnits / 1_000_000_000n -
    page.start.cumulativeBlockUnits / 1_000_000_000n;
  if (blocks > 0n) {
    const info = await client.readContract({
      address: CORE,
      abi: coreAbi,
      functionName: "blockInfo",
      args: [page.end.cumulativeBlockUnits / 1_000_000_000n],
      blockNumber: receipt.blockNumber,
    });
    if (
      info.roundId <= batch.previousSettledThroughRound ||
      info.roundId > batch.settledThroughRound
    )
      throw new VerificationError("Block record exceeds the settled round.");
  }
  return {
    hash: txHash,
    blockHash: block.hash!,
    blockNumber: receipt.blockNumber.toString(),
    timestamp: Number(block.timestamp),
    confirmations: confirmations.toString(),
    work: work.toString(),
    blocks: blocks.toString(),
    rounds: rounds.map((r) => ({
      id: r.roundId.toString(),
      work: r.work.toString(),
      dataHash: r.dataHash,
    })),
    through: batch.settledThroughRound.toString(),
    logIndex: batches[0].logIndex!,
  };
}

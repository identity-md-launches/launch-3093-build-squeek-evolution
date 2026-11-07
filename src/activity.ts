import { API, CORE, CHAIN_ID } from "./chain";
export type Status = {
  generatedAt: string;
  measurement: {
    freshness: string;
    observedAt: string;
    staleAfterSeconds: number;
    coreStatus: string;
    rpmMilli: number | null;
    cumulativeWorkUnits: string | null;
  };
  builder: {
    anchor: {
      blockHeight: string;
      blockProgress: string;
      settledThroughRound: string;
    };
    queued: { closedWorkUnits: string; openRoundWorkUnits: string };
  };
};
export type Settlement = {
  transactionHash: string;
  settledThroughRound: string;
  previousSettledThroughRound: string;
  workAdded: string;
  blockTimestamp: string;
  confirmationStatus: string;
  ethereumBlockNumber: string;
  completedBlockCount: string;
};
export type Settlements = {
  status: string;
  chain: { chainId: string };
  recentSettlements: Settlement[];
};
export type CoreData = {
  status: string;
  chain: { chainId: string; safeThroughBlock: string };
  identities: { core: string };
  core: {
    cumulativeWork: string;
    blockHeight: string;
    settledThroughRound: string;
  };
  source: { transactionHash: string };
};
export type Stats = {
  generatedAt: string;
  activity: {
    coverage: { coverageBps: number; complete: boolean };
    days: {
      date: string;
      coverage: { observedRoundCount: number };
      observedWorkUnits: string | null;
    }[];
    summary: { observedWorkUnits: string };
  };
  lifetime: { settledWorkUnits: string; settlementCount: string };
};
export type Resource<T> = {
  state: "loading" | "available" | "unavailable";
  data: T | null;
  error?: string;
  fetchedAt?: number;
};
export async function officialFetch<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    signal: signal ?? AbortSignal.timeout(12000),
    headers: { Accept: "application/json" },
  });
  if (!r.ok)
    throw Error(`Official API returned HTTP ${r.status}. Try again shortly.`);
  const data = await r.json();
  if (!data || typeof data !== "object" || data.schemaVersion == null)
    throw Error("Official API returned an unsupported response.");
  if (data.status && data.status !== "available")
    throw Error("The official service reports data unavailable.");
  const uint = (v: unknown) => typeof v === "string" && /^\d+$/.test(v);
  const date = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
  if (
    path === "/core" &&
    (data.chain?.chainId !== String(CHAIN_ID) ||
      typeof data.identities?.core !== "string" ||
      data.identities.core.toLowerCase() !== CORE.toLowerCase())
  )
    throw Error(
      "Official deployment differs from the reviewed core. Rewards are paused.",
    );
  if (
    path === "/settlements" &&
    (!Array.isArray(data.recentSettlements) ||
      data.chain?.chainId !== String(CHAIN_ID))
  )
    throw Error("Settlement response is incomplete or on the wrong network.");
  if (
    path === "/core" &&
    (!uint(data.core?.blockHeight) ||
      !uint(data.core?.cumulativeWork) ||
      !uint(data.core?.settledThroughRound))
  )
    throw Error(
      "Official core response is incomplete. Try refreshing the sources.",
    );
  if (
    path === "/status" &&
    (!data.measurement ||
      !data.builder?.anchor ||
      !date(data.measurement.observedAt) ||
      typeof data.measurement.staleAfterSeconds !== "number" ||
      data.measurement.staleAfterSeconds <= 0 ||
      (data.measurement.rpmMilli !== null &&
        (typeof data.measurement.rpmMilli !== "number" ||
          !Number.isFinite(data.measurement.rpmMilli) ||
          data.measurement.rpmMilli < 0)))
  )
    throw Error(
      "Live measurement response is incomplete. Try refreshing the sources.",
    );
  if (
    path === "/settlements" &&
    !data.recentSettlements.every(
      (s: {
        transactionHash?: unknown;
        settledThroughRound?: unknown;
        workAdded?: unknown;
        completedBlockCount?: unknown;
        blockTimestamp?: unknown;
      }) =>
        s &&
        typeof s.transactionHash === "string" &&
        /^0x[0-9a-fA-F]{64}$/.test(s.transactionHash) &&
        uint(s.settledThroughRound) &&
        uint(s.workAdded) &&
        uint(s.completedBlockCount) &&
        date(s.blockTimestamp),
    )
  )
    throw Error(
      "Official settlement records are incomplete. Try refreshing the sources.",
    );
  if (
    path.includes("/measurement") &&
    (!Array.isArray(data.activity?.days) ||
      typeof data.activity?.coverage?.coverageBps !== "number" ||
      data.activity.coverage.coverageBps < 0 ||
      data.activity.coverage.coverageBps > 10000 ||
      !data.activity.days.every(
        (d: {
          date?: unknown;
          observedWorkUnits?: unknown;
          coverage?: { observedRoundCount?: unknown };
        }) =>
          d &&
          typeof d.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
          typeof d.coverage?.observedRoundCount === "number" &&
          d.coverage.observedRoundCount >= 0 &&
          (d.observedWorkUnits === null || uint(d.observedWorkUnits)),
      ))
  )
    throw Error(
      "Measurement history is incomplete. Try refreshing the sources.",
    );
  return data as T;
}
export function liveAvailable(s: Status | null, now = Date.now()) {
  return (
    !!s &&
    s.measurement.freshness === "online" &&
    now - Date.parse(s.measurement.observedAt) <
      s.measurement.staleAfterSeconds * 1000
  );
}
export function pendingWork(s: Status | null): string | null {
  if (!s?.builder.queued) return null;
  try {
    return (
      BigInt(s.builder.queued.closedWorkUnits) +
      BigInt(s.builder.queued.openRoundWorkUnits)
    ).toString();
  } catch {
    return null;
  }
}

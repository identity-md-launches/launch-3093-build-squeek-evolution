import type { Game } from "./game";
import type { VerifiedSettlement } from "./verification";
export type Player = {
  address: string;
  name: string;
  energy: number;
  rounds: number;
  level: number;
  stage: string;
  appearance: string;
  badges: string[];
  score: number;
  rank: number;
};
export type Profile = Player & {
  game: Game;
  revision: number;
  baselineRound: string;
  joinedAt: number;
  claims: { hash: string; blockHash: string; blockNumber: string }[];
};
export type Leaderboard = {
  personal: Player | null;
  status: string;
  players: Player[];
  totalPlayers: number;
  generatedAt: string;
  ranking: string;
};
export async function serviceRequest<T>(
  base: string,
  path: string,
  token = "",
  method = "GET",
  body?: unknown,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch {
    throw Error(
      "Game service unreachable. Check the service address and try again.",
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("This address does not serve the Squeek Evolution game API.");
  }
  if (!r.ok)
    throw Error(data.error || `Game service returned HTTP ${r.status}.`);
  return data;
}
export type ClaimResponse = {
  status: string;
  addedRounds: number;
  duplicate: boolean;
  verification: VerifiedSettlement;
  profile: Profile;
};

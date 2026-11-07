export type Action = "feed" | "pet" | "clean" | "sleep" | "play";
export type Mode =
  "idle" | "eating" | "sleeping" | "running" | "reaction" | "cleaning";
export type Game = {
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  health: number;
  happiness: number;
  fullness: number;
  rest: number;
  cleanliness: number;
  xp: number;
  seeds: number;
  sleeping: boolean;
  day: string;
  counts: Record<Action, number>;
  lifetime: Record<Action, number>;
  claimed: string[];
  badges: string[];
  proofs: string[];
  evolutionRewards: number[];
  appearance: "classic" | "cream" | "cosmic";
  lastAction: number;
};
export const dayKey = (now = Date.now()) =>
  new Date(now).toISOString().slice(0, 10);
const zeros = (): Record<Action, number> => ({
  feed: 0,
  pet: 0,
  clean: 0,
  sleep: 0,
  play: 0,
});
export function newGame(now = Date.now()): Game {
  return {
    version: 1,
    name: "Mochi",
    createdAt: now,
    updatedAt: now,
    health: 85,
    happiness: 80,
    fullness: 68,
    rest: 76,
    cleanliness: 88,
    xp: 0,
    seeds: 20,
    sleeping: false,
    day: dayKey(now),
    counts: zeros(),
    lifetime: zeros(),
    claimed: [],
    badges: [],
    proofs: [],
    evolutionRewards: [],
    appearance: "classic",
    lastAction: 0,
  };
}
const cap = (n: number) => Math.max(0, Math.min(100, n));
function reconcileXpAchievement(g: Game): Game {
  return g.xp >= 100 && !g.badges.includes("first-steps")
    ? { ...g, badges: [...g.badges, "first-steps"] }
    : g;
}
export function tickGame(g: Game, now = Date.now()): Game {
  const minutes = Math.max(0, Math.min(480, (now - g.updatedAt) / 60000));
  const n = {
    ...g,
    updatedAt: now,
    fullness: cap(g.fullness - minutes * 0.12),
    cleanliness: cap(g.cleanliness - minutes * 0.07),
    happiness: cap(g.happiness - minutes * 0.05),
    rest: cap(g.rest + minutes * (g.sleeping ? 0.65 : -0.07)),
  };
  n.health = cap(
    g.health +
      minutes *
        (n.fullness < 15 || n.cleanliness < 15 ? -0.14 : n.sleeping ? 0.08 : 0),
  );
  if (g.day !== dayKey(now)) {
    n.day = dayKey(now);
    n.counts = zeros();
    n.claimed = [];
    n.seeds += 5;
  }
  return reconcileXpAchievement(n);
}
export function act(
  g: Game,
  a: Action,
  now = Date.now(),
  worldBonus = false,
): { game: Game; mode: Mode; message: string } {
  let n = tickGame(g, now);
  if (now - g.lastAction < 900)
    return {
      game: n,
      mode: g.sleeping ? "sleeping" : "idle",
      message: `Give ${g.name} a moment, then try again.`,
    };
  if (g.sleeping && a !== "sleep")
    return {
      game: n,
      mode: "sleeping",
      message: `${g.name} is sleeping. Select Wake up first.`,
    };
  if (a === "feed" && n.seeds < 1)
    return {
      game: n,
      mode: "idle",
      message: "No seeds left. Play a round to earn some.",
    };
  if (a === "play" && n.rest < 10)
    return {
      game: n,
      mode: "reaction",
      message: `${g.name} needs a nap before playing.`,
    };
  n = {
    ...n,
    lastAction: now,
    counts: { ...n.counts, [a]: n.counts[a] + (a === "play" ? 0 : 1) },
    lifetime: { ...n.lifetime, [a]: n.lifetime[a] + (a === "play" ? 0 : 1) },
    xp: n.xp + { feed: 8, pet: 5, clean: 8, sleep: 5, play: 0 }[a],
  };
  let mode: Mode = "reaction",
    message = "";
  if (a === "feed") {
    n.fullness = cap(n.fullness + 22);
    n.health = cap(n.health + 3);
    n.seeds--;
    mode = "eating";
    message = "Crunch, crunch. +8 XP · Fullness +22";
  }
  if (a === "pet") {
    n.happiness = cap(n.happiness + 12);
    message = "That’s the spot! +5 XP · Happiness +12";
  }
  if (a === "clean") {
    n.cleanliness = 100;
    n.health = cap(n.health + 5);
    mode = "cleaning";
    message = "A fresh room for tiny paws. +8 XP";
  }
  if (a === "sleep") {
    n.sleeping = !g.sleeping;
    mode = n.sleeping ? "sleeping" : "reaction";
    message = n.sleeping
      ? `Sweet dreams. Rest recovers while ${g.name} sleeps.`
      : "Good morning, little one. +5 XP";
  }
  if (a === "play") {
    mode = "running";
    n.rest = cap(n.rest - 8);
    message = worldBonus
      ? "The real wheel is active! Catch seeds for bonus XP."
      : "Catch the falling seeds. Use the arrow keys or move the basket.";
  }
  if (n.lifetime.pet >= 5 && !n.badges.includes("best-friends"))
    n.badges = [...n.badges, "best-friends"];
  if (n.lifetime.clean >= 3 && !n.badges.includes("tidy-paws"))
    n.badges = [...n.badges, "tidy-paws"];
  return { game: reconcileXpAchievement(n), mode, message };
}
export function finishPlay(g: Game, caught: number, bonus = false): Game {
  const good = Math.max(0, Math.min(8, Math.floor(caught)));
  return reconcileXpAchievement({
    ...g,
    counts: { ...g.counts, play: g.counts.play + 1 },
    lifetime: { ...g.lifetime, play: g.lifetime.play + 1 },
    seeds: g.seeds + good,
    xp: g.xp + good * (bonus ? 5 : 3),
    happiness: cap(g.happiness + good * 2),
    badges:
      good === 8 && !g.badges.includes("seed-champion")
        ? [...g.badges, "seed-champion"]
        : g.badges,
  });
}
export const MISSIONS = [
  {
    id: "breakfast",
    title: "A proper breakfast",
    description: "Feed Mochi three times",
    action: "feed" as Action,
    target: 3,
    seeds: 5,
    xp: 20,
  },
  {
    id: "friendship",
    title: "A little affection",
    description: "Pet Mochi five times",
    action: "pet" as Action,
    target: 5,
    seeds: 5,
    xp: 20,
  },
  {
    id: "playtime",
    title: "Tiny athlete",
    description: "Play two seed-catching games",
    action: "play" as Action,
    target: 2,
    seeds: 8,
    xp: 25,
  },
  {
    id: "fresh-room",
    title: "Room to bloom",
    description: "Clean the room once",
    action: "clean" as Action,
    target: 1,
    seeds: 3,
    xp: 10,
  },
  {
    id: "nap",
    title: "Dream a little",
    description: "Let Mochi take a nap",
    action: "sleep" as Action,
    target: 1,
    seeds: 3,
    xp: 10,
  },
  {
    id: "settlement",
    title: "A real little milestone",
    description: "Verify new settled work today",
    action: null,
    target: 1,
    seeds: 10,
    xp: 30,
  },
];
export function claimMission(
  g: Game,
  id: string,
  verifiedToday: boolean,
): Game {
  const m = MISSIONS.find((m) => m.id === id);
  if (
    !m ||
    g.claimed.includes(id) ||
    (m.action ? g.counts[m.action] < m.target : !verifiedToday)
  )
    return g;
  return reconcileXpAchievement({
    ...g,
    seeds: g.seeds + m.seeds,
    xp: g.xp + m.xp,
    claimed: [...g.claimed, id],
  });
}
export const BADGES = [
  {
    id: "first-steps",
    title: "Tiny beginnings",
    description: "Earn 100 care XP",
    chain: false,
  },
  {
    id: "best-friends",
    title: "Best friends",
    description: "Pet your hamster five times",
    chain: false,
  },
  {
    id: "tidy-paws",
    title: "Tidy paws",
    description: "Clean the room three times",
    chain: false,
  },
  {
    id: "seed-champion",
    title: "Seed champion",
    description: "Catch all eight seeds in one game",
    chain: false,
  },
  {
    id: "first-proof",
    title: "Proof of paws",
    description: "Verify your first active round",
    chain: true,
  },
  {
    id: "wheel-witness",
    title: "Wheel witness",
    description: "Verify ten distinct active rounds",
    chain: true,
  },
  {
    id: "young",
    title: "Growing together",
    description: "Reach the Young evolution",
    chain: true,
  },
  {
    id: "legendary",
    title: "Written in the stars",
    description: "Reach the Legendary evolution",
    chain: true,
  },
];
export const stageFor = (energy: number) =>
  energy >= 1000 ? 2 : energy >= 100 ? 1 : 0;
export function applyEvolution(
  g: Game,
  verifiedEnergy: number,
): { game: Game; seedsReward: number } {
  const level = stageFor(verifiedEnergy);
  const unlocked = [1, 2].filter(
    (stage) => stage <= level && !g.evolutionRewards.includes(stage),
  );
  const seedsReward = unlocked.reduce(
    (sum, stage) => sum + (stage === 1 ? 20 : 50),
    0,
  );
  if (!unlocked.length) return { game: g, seedsReward: 0 };
  return {
    game: {
      ...g,
      seeds: g.seeds + seedsReward,
      evolutionRewards: [...g.evolutionRewards, ...unlocked],
      appearance: level === 2 ? "cosmic" : "cream",
    },
    seedsReward,
  };
}
export const STAGES = ["Baby", "Young", "Legendary"];
export function isGame(value: unknown): value is Game {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const g = value as Record<string, unknown>;
  if (
    g.version !== 1 ||
    typeof g.name !== "string" ||
    !/^[\p{L}\p{N} _-]{1,24}$/u.test(g.name) ||
    typeof g.sleeping !== "boolean" ||
    typeof g.day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(g.day)
  )
    return false;
  if (!["classic", "cream", "cosmic"].includes(String(g.appearance)))
    return false;
  for (const k of [
    "health",
    "happiness",
    "fullness",
    "rest",
    "cleanliness",
    "xp",
    "seeds",
    "updatedAt",
    "createdAt",
    "lastAction",
  ]) {
    const n = g[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return false;
    if (
      ["health", "happiness", "fullness", "rest", "cleanliness"].includes(k) &&
      n > 100
    )
      return false;
    if (["xp", "seeds"].includes(k) && n > 10000000) return false;
  }
  for (const key of ["counts", "lifetime"]) {
    if (!g[key] || typeof g[key] !== "object") return false;
    for (const action of ["feed", "pet", "clean", "sleep", "play"]) {
      const n = (g[key] as Record<string, unknown>)[action];
      if (
        typeof n !== "number" ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 1000000000
      )
        return false;
    }
  }
  for (const key of ["claimed", "badges"])
    if (
      !Array.isArray(g[key]) ||
      (g[key] as unknown[]).length > 32 ||
      !(g[key] as unknown[]).every(
        (x) => typeof x === "string" && x.length <= 50,
      )
    )
      return false;
  if (
    !(g.badges as string[]).every((id) =>
      BADGES.some((b) => !b.chain && b.id === id),
    )
  )
    return false;
  if (
    !Array.isArray(g.proofs) ||
    !g.proofs.every(
      (x) => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x),
    )
  )
    return false;
  if (
    !Array.isArray(g.evolutionRewards) ||
    g.evolutionRewards.length > 2 ||
    !g.evolutionRewards.every((x) => x === 1 || x === 2)
  )
    return false;
  return true;
}
export function readSavedGame(key: string): Game | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (g && !g.evolutionRewards) g.evolutionRewards = [];
    if (!isGame(g)) throw Error();
    return tickGame(g);
  } catch {
    return null;
  }
}
export function loadGame(key: string): Game {
  return readSavedGame(key) ?? newGame();
}
export const serializeGame = (g: Game) => JSON.stringify(g);

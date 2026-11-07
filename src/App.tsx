import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { parseSiweMessage } from "viem/siwe";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudOff,
  Droplets,
  ExternalLink,
  Heart,
  Home,
  Leaf,
  LockKeyhole,
  Moon,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wheat,
  Zap,
} from "lucide-react";
import { Hamster, Room, SeedIcon } from "./Art";
import {
  act,
  applyEvolution,
  BADGES,
  claimMission,
  dayKey,
  finishPlay,
  loadGame,
  readSavedGame,
  MISSIONS,
  stageFor,
  STAGES,
  tickGame,
  type Action,
  type Game,
  type Mode,
} from "./game";
import {
  API,
  CHAIN_ID,
  CORE,
  EXPLORER,
  publicClient,
  RELEASE,
  RPC_URL,
} from "./chain";
import {
  liveAvailable,
  officialFetch,
  pendingWork,
  type Resource,
  type Status,
  type Stats,
  type Settlements,
  type CoreData,
} from "./activity";
import { Dialog, short, WalletControl } from "./wallet";
import {
  serviceRequest,
  type ClaimResponse,
  type Leaderboard,
  type Profile,
} from "./service-client";
import {
  verifySettlement,
  VerificationError,
  type VerifiedSettlement,
} from "./verification";
import { MiniGame } from "./MiniGame";
const tabs = [
  { id: "hamster", label: "My hamster", icon: Home },
  { id: "evolution", label: "Evolution", icon: Sparkles },
  { id: "missions", label: "Daily missions", icon: Target },
  { id: "activity", label: "Activity dashboard", icon: Activity },
  { id: "achievements", label: "Achievements", icon: Award },
  { id: "leaderboard", label: "Global leaderboard", icon: Trophy },
];
const actionInfo = [
  { id: "feed", title: "Feed", icon: Wheat, hint: "1 seed" },
  { id: "pet", title: "Pet", icon: Heart, hint: "A little love" },
  { id: "play", title: "Play", icon: Play, hint: "Catch seeds" },
  { id: "clean", title: "Clean", icon: Droplets, hint: "Fresh & tidy" },
  { id: "sleep", title: "Sleep", icon: Moon, hint: "Rest up" },
] as const;
const empty = <T,>(): Resource<T> => ({ state: "loading", data: null });
const number = (v: string | number | null | undefined) => {
  if (v == null) return "Unavailable";
  try {
    return (
      typeof v === "number" ? BigInt(Math.floor(v)) : BigInt(v)
    ).toLocaleString();
  } catch {
    return "Unavailable";
  }
};
function StatusTag({
  kind,
}: {
  kind: "LIVE" | "PENDING" | "CONFIRMED" | "UNAVAILABLE" | "REJECTED";
}) {
  return (
    <span className={`status-tag ${kind.toLowerCase()}`}>
      <span />
      {kind}
    </span>
  );
}
function Meter({
  label,
  value,
  icon: Icon,
  color = "sage",
}: {
  label: string;
  value: number;
  icon: typeof Heart;
  color?: string;
}) {
  return (
    <div className={`meter ${color}`}>
      <div>
        <span>
          <Icon size={16} />
          {label}
        </span>
        <b>
          {Math.round(value)}
          <span>/100</span>
        </b>
      </div>
      <progress value={value} max="100" aria-label={label} />
    </div>
  );
}
function useOfficial<T>(path: string, revision: number) {
  const [r, setR] = useState<Resource<T>>(empty());
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setR((x) => ({ ...x, state: "loading" }));
    officialFetch<T>(path, controller.signal)
      .then((data) => setR({ state: "available", data, fetchedAt: Date.now() }))
      .catch((e) => {
        if (!cancelled)
          setR({
            state: "unavailable",
            data: null,
            error: (e as Error).message,
          });
      });
    const timeout = setTimeout(() => controller.abort(), 15000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [path, revision]);
  return r;
}
function App() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [page, setPage] = useState(
    () => tabs.find((t) => t.id === location.hash.slice(1))?.id ?? "hamster",
  );
  const [saveKey, setSaveKey] = useState("squeek.game.v1:guest"),
    [game, setGame] = useState<Game>(() => loadGame("squeek.game.v1:guest"));
  const [mode, setMode] = useState<Mode>(game.sleeping ? "sleeping" : "idle"),
    [message, setMessage] = useState(
      `${game.name} is happy to see you. What shall we do?`,
    );
  const [saveError, setSaveError] = useState(false),
    [paused, setPaused] = useState(false),
    [sound, setSound] = useState(false),
    [mini, setMini] = useState(false);
  const [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false),
    [rename, setRename] = useState(false),
    [nameError, setNameError] = useState(""),
    [renameBusy, setRenameBusy] = useState(false),
    [nameDraft, setNameDraft] = useState(game.name);
  const [serviceUrl, setServiceUrl] = useState<string | null>(null),
    [serviceReady, setServiceReady] = useState(false),
    [serviceMessage, setServiceMessage] = useState(""),
    [serviceDraft, setServiceDraft] = useState("");
  const [owned, setOwned] = useState(""),
    [token, setToken] = useState(""),
    [profile, setProfile] = useState<Profile | null>(null),
    [board, setBoard] = useState<Leaderboard | null>(null),
    [boardLoading, setBoardLoading] = useState(false),
    [boardError, setBoardError] = useState("");
  const [revision, setRevision] = useState(0),
    [hash, setHash] = useState(""),
    [verifying, setVerifying] = useState(false),
    [proofStatus, setProofStatus] = useState(""),
    [proofKind, setProofKind] = useState<
      "PENDING" | "CONFIRMED" | "UNAVAILABLE" | "REJECTED" | null
    >(null),
    [proofs, setProofs] = useState<VerifiedSettlement[]>([]),
    [proofChecking, setProofChecking] = useState(false),
    [proofUnavailable, setProofUnavailable] = useState(false),
    [proofRevision, setProofRevision] = useState(0),
    [festival, setFestival] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false),
    [evolving, setEvolving] = useState(false),
    [evolutionBonus, setEvolutionBonus] = useState(0);
  const accountRef = useRef({ address, chainId });
  accountRef.current = { address, chainId };
  const contextVersion = useRef(0);
  const modeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    actionBusy = useRef(false),
    ownedRef = useRef("");
  const status = useOfficial<Status>("/status", revision),
    stats = useOfficial<Stats>("/measurement/stats?range=7d", revision),
    settlements = useOfficial<Settlements>("/settlements", revision),
    core = useOfficial<CoreData>("/core", revision);
  const live = liveAvailable(status.data),
    spinning = live && status.data?.measurement.coreStatus === "SPINNING",
    bonus = spinning || festival;
  const roundMap = new Map<string, bigint>();
  for (const p of proofs)
    for (const r of p.rounds) roundMap.set(r.id, BigInt(r.work));
  const localWork = [...roundMap.values()].reduce((a, b) => a + b, 0n),
    localEnergy = Number(localWork / 10n);
  const energy = profile?.energy ?? localEnergy,
    energyKnown =
      !!profile ||
      (!proofChecking &&
        !proofUnavailable &&
        game.proofs.every((h) =>
          proofs.some((p) => p.hash.toLowerCase() === h.toLowerCase()),
        )),
    energyDisplay = energyKnown
      ? energy
      : proofChecking
        ? "Checking"
        : "Unavailable",
    level = stageFor(energy),
    levelName = energyKnown ? STAGES[level] : "Unverified",
    careLevel = Math.floor(game.xp / 100) + 1;
  const activeAppearance =
    game.appearance === "cosmic" && level < 2
      ? "classic"
      : game.appearance === "cream" && level < 1
        ? "classic"
        : game.appearance;
  const chainBadges = profile?.badges ?? [
    ...(roundMap.size ? ["first-proof"] : []),
    ...(roundMap.size >= 10 ? ["wheel-witness"] : []),
    ...(level >= 1 ? ["young"] : []),
    ...(level === 2 ? ["legendary"] : []),
  ];
  const unlocked = [
    ...new Set([
      ...game.badges.filter((id) =>
        BADGES.some((b) => !b.chain && b.id === id),
      ),
      ...chainBadges,
    ]),
  ];
  const verifiedToday = proofs.some(
    (p) => dayKey(p.timestamp * 1000) === game.day && p.rounds.length > 0,
  );
  const nextEnergy = level === 0 ? 100 : 1000;
  useEffect(() => {
    const onHash = () =>
      location.hash === "#main"
        ? undefined
        : setPage(
            tabs.find((t) => t.id === location.hash.slice(1))?.id ?? "hamster",
          );
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(saveKey, JSON.stringify(game));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [game, saveKey]);
  useEffect(() => {
    const id = setInterval(() => setGame((g) => tickGame(g)), 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setRevision((r) => r + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(
    () => () => {
      if (modeTimer.current) clearTimeout(modeTimer.current);
    },
    [],
  );
  const switchSave = useCallback((key: string, g?: Game) => {
    contextVersion.current++;
    setSaveKey(key);
    const loaded = g ? tickGame(g) : loadGame(key);
    setGame(loaded);
    setMode(loaded.sleeping ? "sleeping" : "idle");
    setProofs([]);
    setProofUnavailable(false);
    setProofChecking(false);
    setProofRevision((r) => r + 1);
  }, []);
  useEffect(() => {
    if (
      ownedRef.current &&
      (!address ||
        address.toLowerCase() !== ownedRef.current ||
        chainId !== CHAIN_ID)
    ) {
      ownedRef.current = "";
      setOwned("");
      setProfile(null);
      setToken("");
      switchSave("squeek.game.v1:guest");
    }
  }, [address, chainId, switchSave]);
  useEffect(() => {
    let stopped = false;
    const g = loadGame(saveKey);
    if (!g.proofs.length) {
      setProofs([]);
      setProofChecking(false);
      setProofUnavailable(false);
      return;
    }
    setProofChecking(true);
    setProofUnavailable(false);
    void (async () => {
      const valid: VerifiedSettlement[] = [];
      let failed = false;
      for (const h of g.proofs) {
        try {
          const p = await verifySettlement(publicClient, h);
          if (p.timestamp * 1000 >= g.createdAt) valid.push(p);
        } catch {
          failed = true;
          break; /* Stored receipts never earn energy without re-verification. */
        }
        if (stopped) return;
      }
      if (stopped) return;
      setProofs(valid);
      setProofUnavailable(failed);
      setProofChecking(false);
    })();
    return () => {
      stopped = true;
    };
  }, [saveKey, proofRevision]);
  function refreshSources() {
    setRevision((r) => r + 1);
    setProofRevision((r) => r + 1);
  }
  const navigate = (id: string) => {
    setPage(id);
    location.hash = id;
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const connectService = useCallback(async (base: string) => {
    setBoard(null);
    setBoardError("");
    setServiceMessage("Connecting to game service…");
    try {
      const data = await serviceRequest<{
        status: string;
        chainId: number;
        core: string;
      }>(base, "/api/health");
      if (
        data.status !== "available" ||
        data.chainId !== CHAIN_ID ||
        data.core.toLowerCase() !== CORE.toLowerCase()
      )
        throw Error("Game service uses an unreviewed deployment.");
      setServiceUrl(base);
      setServiceReady(true);
      setServiceMessage("Shared profiles and global rankings are connected.");
      return true;
    } catch (e) {
      setServiceUrl(base);
      setServiceReady(false);
      setServiceMessage((e as Error).message);
      return false;
    }
  }, []);
  useEffect(() => {
    void (async () => {
      let saved = "";
      try {
        saved = localStorage.getItem("squeek.service") ?? "";
      } catch {}
      if (saved) {
        setServiceDraft(saved);
        await connectService(saved);
        return;
      }
      try {
        const c = await fetch("./runtime-config.json", {
          signal: AbortSignal.timeout(5000),
        }).then((r) => r.json());
        if (c.serviceUrl || c.sameOriginService) {
          setServiceDraft(c.serviceUrl || location.origin);
          await connectService(c.serviceUrl || location.origin);
        } else
          setServiceMessage(
            "Shared service not connected. Local play is available.",
          );
      } catch {
        setServiceMessage(
          "Shared service not connected. Local play is available.",
        );
      }
    })();
  }, [connectService]);
  const loadBoard = useCallback(async () => {
    if (!serviceReady || serviceUrl === null) return;
    setBoardLoading(true);
    setBoardError("");
    try {
      const data = await serviceRequest<Leaderboard>(
        serviceUrl,
        "/api/leaderboard",
        token,
      );
      setBoard(data);
      if (data.personal)
        setProfile((p) =>
          p && p.address === data.personal!.address
            ? { ...p, ...data.personal! }
            : p,
        );
    } catch (e) {
      setBoard(null);
      setBoardError((e as Error).message);
    } finally {
      setBoardLoading(false);
    }
  }, [serviceReady, serviceUrl, token]);
  useEffect(() => {
    if (page === "leaderboard") void loadBoard();
  }, [page, loadBoard]);
  function chirp() {
    if (!sound) return;
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.15);
      o.onended = () => void ctx.close();
    } catch {}
  }
  function doAction(a: Action) {
    if (actionBusy.current || mini) return;
    const result = act(game, a, Date.now(), bonus);
    setGame(result.game);
    setMessage(result.message);
    setMode(result.mode);
    chirp();
    if (a === "play" && result.mode === "running") setMini(true);
    if (modeTimer.current) clearTimeout(modeTimer.current);
    if (result.mode !== "sleeping" && result.mode !== "running")
      modeTimer.current = setTimeout(() => setMode("idle"), 2300);
    actionBusy.current = true;
    setTimeout(() => {
      actionBusy.current = false;
    }, 200);
  }
  async function verifyOwner() {
    if (!address || chainId !== CHAIN_ID)
      throw Error("Connect your wallet on Ethereum Sepolia first.");
    const a = address.toLowerCase();
    const unchanged = () => {
      if (
        accountRef.current.address?.toLowerCase() !== a ||
        accountRef.current.chainId !== CHAIN_ID
      )
        throw Error(
          "Wallet or network changed. Connect the intended account and try again.",
        );
    };
    if (serviceReady && serviceUrl !== null) {
      const challenge = await serviceRequest<{
        nonce: string;
        message: string;
      }>(serviceUrl, "/api/auth/challenge", "", "POST", { address });
      const parsed = parseSiweMessage(challenge.message);
      if (
        parsed.address?.toLowerCase() !== a ||
        parsed.chainId !== CHAIN_ID ||
        parsed.nonce !== challenge.nonce ||
        parsed.domain !== new URL(serviceUrl).host ||
        parsed.uri !== serviceUrl ||
        !parsed.expirationTime ||
        parsed.expirationTime.getTime() < Date.now() ||
        parsed.expirationTime.getTime() > Date.now() + 360000
      )
        throw Error(
          "The game service returned an invalid sign-in message. No signature was requested.",
        );
      const signature = await signMessageAsync({ message: challenge.message });
      unchanged();
      const result = await serviceRequest<{ token: string; profile: Profile }>(
        serviceUrl,
        "/api/auth/verify",
        "",
        "POST",
        { nonce: challenge.nonce, signature },
      );
      unchanged();
      if (result.profile.address.toLowerCase() !== a)
        throw Error(
          "The service returned a different wallet profile. Sign-in was stopped.",
        );
      setToken(result.token);
      setProfile(result.profile);
      const key = `squeek.game.v1:${a}`;
      const local = readSavedGame(key);
      switchSave(key, local ?? result.profile.game);
      setMessage(
        local
          ? "Wallet verified. Care progress on this device was kept. Use Settings to load your cloud save."
          : "Wallet verified. Your shared profile is ready.",
      );
    } else {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const message = `${location.host} requests Squeek Evolution local profile ownership.\n\nAddress: ${address}\nChain ID: ${CHAIN_ID}\nURI: ${location.origin}\nNonce: ${nonce}\nIssued at: ${new Date().toISOString()}\n\nThis signs in locally only. No transaction or token approval.`;
      const signature = await signMessageAsync({ message });
      unchanged();
      if (!(await publicClient.verifyMessage({ address, message, signature })))
        throw Error("Signature verification failed. Try again.");
      unchanged();
      switchSave(`squeek.game.v1:${a}`);
      setMessage(
        "Wallet ownership verified. This profile is saved on this device.",
      );
    }
    ownedRef.current = a;
    setOwned(a);
  }
  function disconnect() {
    if (token && serviceUrl)
      void serviceRequest(serviceUrl, "/api/auth/logout", token, "POST").catch(
        () => {},
      );
    setToken("");
    setProfile(null);
    setOwned("");
    ownedRef.current = "";
    switchSave("squeek.game.v1:guest");
  }
  async function verifyHash(value = hash) {
    const startedContext = contextVersion.current;
    const sameContext = () => {
      if (startedContext !== contextVersion.current)
        throw Error(
          "Player profile changed during verification. Verify again for the current profile.",
        );
    };
    setHash(value);
    setVerifying(true);
    setProofStatus(
      "Reading Sepolia receipt, official core events and settled round records…",
    );
    setProofKind("PENDING");
    try {
      if (!/^0x[a-fA-F0-9]{64}$/.test(value))
        throw new VerificationError(
          "Enter a complete 0x transaction hash with 64 hexadecimal characters.",
        );
      if (
        !token &&
        proofs.some((p) => p.hash.toLowerCase() === value.toLowerCase())
      ) {
        setProofStatus("Already verified. No duplicate energy awarded.");
        setProofKind("CONFIRMED");
        if (!energyKnown) setProofRevision((r) => r + 1);
        return;
      }
      if (core.state !== "available")
        throw new VerificationError(
          "Official core metadata is unavailable. Refresh the sources before claiming.",
          "UNAVAILABLE",
        );
      const proof = await verifySettlement(publicClient, value);
      sameContext();
      if (proof.timestamp * 1000 < game.createdAt)
        throw new VerificationError(
          "This settlement predates your pet. Only new work after joining earns energy.",
        );
      if (!proof.rounds.length)
        throw new VerificationError(
          "Confirmed settlement contains no active work. No energy is awarded.",
        );
      let next = localEnergy;
      if (token && serviceReady && serviceUrl !== null) {
        const result = await serviceRequest<ClaimResponse>(
          serviceUrl,
          "/api/claims",
          token,
          "POST",
          { hash: value },
        );
        sameContext();
        setProfile(result.profile);
        next = result.profile.energy;
        setProofStatus(
          result.duplicate
            ? "Already credited. The same active round cannot earn energy twice."
            : `${result.addedRounds} new active rounds confirmed. Shared profile updated.`,
        );
      } else {
        const ids = new Map(roundMap);
        for (const r of proof.rounds) ids.set(r.id, BigInt(r.work));
        next = Number([...ids.values()].reduce((a, b) => a + b, 0n) / 10n);
        setProofStatus(
          proofs.some((p) => p.hash.toLowerCase() === proof.hash.toLowerCase())
            ? "Already verified. No duplicate energy awarded."
            : `${proof.work} work units verified. ${proof.confirmations} confirmations. Local proof saved.`,
        );
      }
      setProofs((p) => [
        ...p.filter((x) => x.hash.toLowerCase() !== proof.hash.toLowerCase()),
        proof,
      ]);
      setGame((g) => ({
        ...g,
        proofs: [...new Set([...g.proofs, proof.hash])],
      }));
      setProofKind("CONFIRMED");
      setFestival(true);
      if (!energyKnown) setProofRevision((r) => r + 1);
      const rewards = applyEvolution(game, next);
      if (rewards.seedsReward > 0) {
        setEvolutionBonus(rewards.seedsReward);
        setEvolving(true);
        setGame((g) => applyEvolution(g, next).game);
      }
    } catch (e) {
      setProofKind(e instanceof VerificationError ? e.status : "UNAVAILABLE");
      setProofStatus(
        (e as Error).message ||
          "Verification unavailable. Check the connection and try again.",
      );
    } finally {
      setVerifying(false);
    }
  }
  async function saveCloud(load = false) {
    if (!serviceReady || serviceUrl === null || !token || !profile) return;
    setCloudBusy(true);
    try {
      const p = await serviceRequest<Profile>(
        serviceUrl,
        load ? "/api/profile" : "/api/profile/game",
        token,
        load ? "GET" : "PUT",
        load
          ? undefined
          : { game: { ...game, proofs: [] }, revision: profile.revision },
      );
      setProfile(p);
      if (load) switchSave(saveKey, p.game);
      setMessage(
        load ? "Cloud save loaded." : "Progress saved to your shared profile.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setCloudBusy(false);
    }
  }
  function downloadProofs() {
    const metadata = {
      name: `${game.name} · Squeek Evolution`,
      description: "Game achievement record. This is not a minted NFT.",
      image: new URL("./favicon.svg", location.href).href,
      attributes: [
        { trait_type: "Evolution", value: levelName },
        { trait_type: "Verified Evolution Energy", value: energy },
      ],
      properties: {
        chainId: CHAIN_ID,
        core: CORE,
        owner: owned || null,
        mintStatus: "not-minted",
        achievements: unlocked,
        proofs: profile?.claims ?? proofs,
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(metadata, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "squeek-achievements.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const recent = settlements.data?.recentSettlements ?? [];
  const displayedTitle = tabs.find((t) => t.id === page)?.label ?? "My hamster";
  const missionRows = (limit = MISSIONS.length) =>
    MISSIONS.slice(0, limit).map((m) => {
      const count = m.action
          ? Math.min(game.counts[m.action], m.target)
          : verifiedToday
            ? 1
            : 0,
        claimed = game.claimed.includes(m.id);
      return (
        <div className="mission-row" key={m.id}>
          <span
            className={`mission-mark ${count >= m.target ? "complete" : ""}`}
          >
            {claimed ? (
              <Check size={19} />
            ) : m.action === "feed" ? (
              <Wheat size={19} />
            ) : m.action === "pet" ? (
              <Heart size={19} />
            ) : m.action === "play" ? (
              <Play size={19} />
            ) : m.action === "clean" ? (
              <Droplets size={19} />
            ) : m.action === "sleep" ? (
              <Moon size={19} />
            ) : (
              <ShieldCheck size={19} />
            )}
          </span>
          <div className="mission-copy">
            <b>{m.title}</b>
            <span>{m.description.replaceAll("Mochi", game.name)}</span>
            <progress
              value={count}
              max={m.target}
              aria-label={`${m.title} progress`}
            />
          </div>
          <div className="mission-reward">
            <span>
              {count}/{m.target}
            </span>
            <button
              className="text-button"
              disabled={claimed || count < m.target}
              onClick={() => {
                setGame((g) => claimMission(g, m.id, verifiedToday));
                setMessage(
                  `Reward collected: ${m.seeds} seeds and ${m.xp} XP.`,
                );
              }}
            >
              {claimed
                ? "Collected"
                : count >= m.target
                  ? "Collect reward"
                  : `+${m.seeds} seeds`}
            </button>
          </div>
        </div>
      );
    });
  return (
    <div className={`app-shell ${paused ? "motion-paused" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#hamster"
          onClick={() => navigate("hamster")}
        >
          <Hamster />
          <span>
            Squeek<span>evolution</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={page === t.id ? "page" : undefined}
              className={page === t.id ? "active" : ""}
              onClick={() => navigate(t.id)}
            >
              <t.icon size={20} />
              <span>{t.label}</span>
              {t.id === "missions" && game.claimed.length < MISSIONS.length && (
                <span className="nav-count">
                  {MISSIONS.length - game.claimed.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="tiny-plant">
            <Sprout size={30} />
          </div>
          <b>Small paws. Big possibilities.</b>
          <p>A tiny world that grows with real hamster-powered work.</p>
          <a
            href="https://docs.squeekchain.com/"
            target="_blank"
            rel="noreferrer"
          >
            Meet Squeekchain <ArrowUpRightIcon />
          </a>
          <div className="sepolia-label">
            <span className="status-dot green" />
            Ethereum Sepolia
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <Hamster />
            <b>
              Squeek <span>Evolution</span>
            </b>
          </div>
          <div className="desktop-breadcrumb">
            Your tiny world <ChevronRight size={14} />
            <span>{displayedTitle}</span>
          </div>
          <div className="topbar-right">
            <span className={`save-indicator ${saveError ? "error" : ""}`}>
              <span className={`status-dot ${saveError ? "amber" : "green"}`} />
              {saveError ? "Save unavailable" : "Locally saved"}
            </span>
            <button
              className="icon-button help-button"
              aria-label="How to play"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={20} />
            </button>
            <WalletControl
              verified={!!owned}
              onVerify={verifyOwner}
              onDisconnect={disconnect}
              serviceReady={serviceReady}
            />
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {tabs.map((t) => (
            <a
              href={`#${t.id}`}
              key={t.id}
              aria-current={page === t.id ? "page" : undefined}
              className={page === t.id ? "active" : ""}
              onClick={() => navigate(t.id)}
            >
              <t.icon size={18} />
              <span>
                {t.id === "activity"
                  ? "Activity"
                  : t.id === "leaderboard"
                    ? "Leaderboard"
                    : t.label}
              </span>
            </a>
          ))}
        </nav>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>{displayedTitle}</h1>
              <p>
                {page === "hamster"
                  ? "A little care goes a long way."
                  : page === "evolution"
                    ? "Every little legend starts somewhere."
                    : page === "missions"
                      ? "Little moments. A happier hamster."
                      : page === "activity"
                        ? "The real work behind your tiny world."
                        : page === "achievements"
                          ? "Good things come in tiny milestones."
                          : "A shared place for verified little legends."}
              </p>
            </div>
            <div className="heading-extra">
              {page === "hamster" ? (
                <div className="seed-balance">
                  <SeedIcon />
                  <b>{game.seeds}</b>
                  <span>seeds</span>
                </div>
              ) : (
                <button
                  className="button compact"
                  onClick={() => setSettings(true)}
                >
                  <Settings2 size={16} />
                  Game service
                </button>
              )}
            </div>
          </div>
          {page === "hamster" && (
            <>
              <div className="game-layout">
                <section className="pet-panel">
                  <div className="room-heading">
                    <div className="room-name">
                      <h2>{game.name}’s room</h2>
                      <button
                        className="icon-button"
                        aria-label="Rename hamster"
                        onClick={() => {
                          setNameDraft(game.name);
                          setNameError("");
                          setRename(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <span className="stage-badge">
                        <Sprout size={13} />
                        {levelName}
                      </span>
                    </div>
                    <div className="room-tools">
                      <button
                        className="icon-button"
                        aria-label={sound ? "Mute sound" : "Enable sound"}
                        aria-pressed={sound}
                        onClick={() => setSound(!sound)}
                      >
                        {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          paused ? "Resume animations" : "Pause animations"
                        }
                        aria-pressed={paused}
                        onClick={() => setPaused(!paused)}
                      >
                        {paused ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                    </div>
                  </div>
                  <Room
                    name={game.name}
                    mode={mode}
                    appearance={activeAppearance}
                    night={game.sleeping}
                    onAction={doAction}
                    festival={festival}
                    paused={paused}
                  />
                  <div className="care-actions">
                    {actionInfo.map((a) => (
                      <button
                        key={a.id}
                        className={`care-action ${a.id === "feed" ? "feed-action" : ""}`}
                        disabled={game.sleeping && a.id !== "sleep"}
                        onClick={() => doAction(a.id)}
                      >
                        <a.icon size={22} />
                        <b>
                          {a.id === "sleep" && game.sleeping
                            ? "Wake up"
                            : a.title}
                        </b>
                        <span>
                          {a.id === "feed"
                            ? a.hint
                            : a.id === "sleep" && game.sleeping
                              ? "Hello, sunshine"
                              : a.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="pet-message">
                    <Heart size={15} />
                    <span>{message}</span>
                  </div>
                </section>
                <aside className="pet-stats">
                  <div className="pet-identity">
                    <div className="avatar">
                      <Hamster appearance={activeAppearance} />
                    </div>
                    <div>
                      <h2>{game.name}</h2>
                      <span>
                        {levelName} hamster · Level {careLevel}
                      </span>
                    </div>
                    <span className="mood-symbol">
                      <Sun size={20} />
                    </span>
                  </div>
                  <div className="meters">
                    <Meter
                      label="Health"
                      value={game.health}
                      icon={Heart}
                      color="rose"
                    />
                    <Meter
                      label="Happiness"
                      value={game.happiness}
                      icon={Sun}
                      color="gold"
                    />
                    <Meter
                      label="Fullness"
                      value={game.fullness}
                      icon={Wheat}
                    />
                    <Meter
                      label="Rest"
                      value={game.rest}
                      icon={Moon}
                      color="lavender"
                    />
                    <Meter
                      label="Cleanliness"
                      value={game.cleanliness}
                      icon={Droplets}
                      color="blue"
                    />
                  </div>
                  <div className="xp-row">
                    <span>
                      <Leaf size={16} />
                      Care XP
                    </span>
                    <b>
                      {game.xp}
                      <span> / {careLevel * 100}</span>
                    </b>
                  </div>
                  <progress
                    className="xp-progress"
                    value={game.xp % 100}
                    max="100"
                    aria-label="Care XP to next level"
                  />
                  <div className="energy-summary">
                    <div>
                      <Zap size={18} />
                      <b>{energyDisplay}</b>
                      <span>Evolution Energy</span>
                    </div>
                    <span className="subtle-label">
                      {proofChecking
                        ? "Rechecking saved proofs…"
                        : proofUnavailable
                          ? "Sepolia recheck unavailable"
                          : profile
                            ? "Confirmed · shared profile"
                            : energy
                              ? "Confirmed · local proofs"
                              : "Earned from verified work"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("evolution")}
                    >
                      See evolution <ArrowRight size={15} />
                    </button>
                  </div>
                </aside>
              </div>
              <div className="home-bottom">
                <section className="daily-preview">
                  <div className="section-heading">
                    <h2>Little goals for today</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("missions")}
                    >
                      All missions <ArrowRight size={15} />
                    </button>
                  </div>
                  {missionRows(2)}
                </section>
                <section className="world-panel">
                  <div className="section-heading">
                    <h2>A world in motion</h2>
                    <StatusTag kind={live ? "LIVE" : "UNAVAILABLE"} />
                  </div>
                  <div className="world-callout">
                    <span className="world-icon">
                      <Activity size={25} />
                    </span>
                    <div>
                      <b>
                        {festival
                          ? "A little settlement celebration"
                          : spinning
                            ? "The real wheel is spinning"
                            : live
                              ? "A quiet moment on the wheel"
                              : "The wheel is out of view"}
                      </b>
                      <p>
                        {festival
                          ? "Verified work lit up the room. Enjoy bonus play XP this session."
                          : spinning
                            ? "Squeektoshi is moving. Catch seeds for extra care XP."
                            : live
                              ? `${game.name}’s room follows Squeektoshi’s real activity.`
                              : `Keep caring for ${game.name}. Live data will return when the source reconnects.`}
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("activity")}
                  >
                    Visit activity dashboard <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "evolution" && (
            <>
              <section className="evolution-hero surface">
                <div className="evolution-pet">
                  <Hamster
                    appearance={activeAppearance}
                    mode={evolving ? "reaction" : "idle"}
                  />
                </div>
                <div>
                  <h2>
                    {game.name} is a little {levelName.toLowerCase()} wonder.
                  </h2>
                  <p>
                    Care builds friendship. Settled Squeekchain work powers
                    evolution.
                  </p>
                  <div className="energy-large">
                    <Zap size={24} />
                    <b>{energyDisplay}</b>
                    <span>confirmed Evolution Energy</span>
                  </div>
                  <progress
                    value={
                      energyKnown ? (level === 2 ? 1000 : energy) : undefined
                    }
                    max={nextEnergy}
                    aria-label="Evolution progress"
                  />
                  <p className="muted">
                    {!energyKnown
                      ? "Reconnect to Sepolia to recheck saved proofs."
                      : level === 2
                        ? "Legendary unlocked. Keep growing your collection of verified moments."
                        : `${Math.max(0, nextEnergy - energy)} more energy to ${STAGES[level + 1]}. 10 verified work units become 1 energy.`}
                  </p>
                  {!energyKnown && (
                    <button
                      className="button compact"
                      disabled={proofChecking}
                      onClick={() => setProofRevision((r) => r + 1)}
                    >
                      <RefreshCw size={15} />
                      {proofChecking
                        ? "Rechecking saved proofs…"
                        : "Retry saved proofs"}
                    </button>
                  )}
                </div>
              </section>
              <div className="stage-grid">
                {STAGES.map((s, i) => (
                  <section
                    className={`stage-card ${i === level ? "current-stage" : ""}`}
                    key={s}
                  >
                    <span className="stage-number">0{i + 1}</span>
                    <Hamster appearance={["classic", "cream", "cosmic"][i]} />
                    <h2>{s}</h2>
                    <p>
                      {
                        [
                          "A curious little beginning.",
                          "Bigger paws, brighter days.",
                          "A tiny constellation of wonder.",
                        ][i]
                      }
                    </p>
                    <div className="stage-requirement">
                      {i === 0
                        ? "Your first day"
                        : `${i === 1 ? "100" : "1,000"} verified energy`}
                    </div>
                    <button
                      className="button"
                      disabled={i > level}
                      onClick={() => {
                        setGame((g) => ({
                          ...g,
                          appearance: (["classic", "cream", "cosmic"] as const)[
                            i
                          ],
                        }));
                        setMessage(`${s} appearance equipped.`);
                      }}
                    >
                      {i > level ? (
                        <>
                          <LockKeyhole size={15} />
                          Locked
                        </>
                      ) : activeAppearance ===
                        ["classic", "cream", "cosmic"][i] ? (
                        <>
                          <Check size={16} />
                          Equipped
                        </>
                      ) : (
                        "Equip appearance"
                      )}
                    </button>
                    <small>
                      {i === 1
                        ? "Evolution reward: 20 seeds"
                        : i === 2
                          ? "Evolution reward: 50 seeds"
                          : "Classic appearance"}
                    </small>
                  </section>
                ))}
              </div>
              {verificationPanel()}
              <div className="info-note">
                <ShieldCheck size={19} />
                <p>
                  Energy comes from active rounds settled after your pet or
                  shared profile was created. Every round is counted once.
                  Pending work and care XP never become confirmed energy.
                </p>
              </div>
            </>
          )}
          {page === "missions" && (
            <>
              <div className="mission-summary">
                <span className="round-icon">
                  <Target size={26} />
                </span>
                <div>
                  <h2>A fresh little adventure</h2>
                  <p>
                    {game.claimed.length} of {MISSIONS.length} rewards collected
                    · Resets at 00:00 UTC
                  </p>
                </div>
                <div className="seed-balance">
                  <SeedIcon />
                  <b>{game.seeds}</b>
                  <span>seeds</span>
                </div>
              </div>
              <section className="surface missions-list">
                {missionRows()}
              </section>
              <div className="info-note">
                <Sun size={19} />
                <p>
                  {bonus
                    ? "Wheel celebration is active. Catching seeds gives 5 XP each."
                    : "Play games to earn seeds. Mission rewards give seeds and care XP; only verified work gives Evolution Energy."}
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => navigate("hamster")}
              >
                Back to {game.name} <ArrowRight size={17} />
              </button>
            </>
          )}
          {page === "activity" && (
            <>
              <div className="section-heading source-heading">
                <div className="state-line">
                  <span className={`status-dot ${live ? "green" : "amber"}`} />
                  {live
                    ? "Official measurement connected"
                    : "Live measurement unavailable"}
                </div>
                <button
                  className="button compact"
                  onClick={refreshSources}
                >
                  <RefreshCw size={15} />
                  Refresh sources
                </button>
              </div>
              <div className="activity-grid">
                <section className="data-stat">
                  <span>Wheel speed</span>
                  <b>
                    {live && status.data?.measurement.rpmMilli != null
                      ? (status.data.measurement.rpmMilli / 1000).toFixed(1)
                      : "Unavailable"}
                    <small>{live ? " rpm" : ""}</small>
                  </b>
                  <StatusTag kind={live ? "LIVE" : "UNAVAILABLE"} />
                </section>
                <section className="data-stat">
                  <span>Unsettled work</span>
                  <b>
                    {status.state === "available" &&
                    pendingWork(status.data) !== null
                      ? number(pendingWork(status.data))
                      : "Unavailable"}
                  </b>
                  <StatusTag
                    kind={
                      status.state === "available" ? "PENDING" : "UNAVAILABLE"
                    }
                  />
                </section>
                <section className="data-stat">
                  <span>Official reported Squeek blocks</span>
                  <b>
                    {core.data
                      ? number(core.data.core.blockHeight)
                      : "Unavailable"}
                  </b>
                  <span className="subtle-label">
                    API report · verify receipts below
                  </span>
                </section>
                <section className="data-stat">
                  <span>Your verified rounds</span>
                  <b>
                    {energyKnown
                      ? (profile?.rounds ?? roundMap.size)
                      : "Unavailable"}
                  </b>
                  <StatusTag kind={energyKnown ? "CONFIRMED" : "UNAVAILABLE"} />
                </section>
              </div>
              <section className="surface history-panel">
                <div className="section-heading">
                  <h2>A week on the wheel</h2>
                  <span className="muted">Official accepted work · 7 days</span>
                </div>
                {stats.data ? (
                  <>
                    <div
                      className="work-chart"
                      role="img"
                      aria-label={`Seven-day accepted wheel work. Coverage ${stats.data.activity.coverage.coverageBps / 100} percent. Missing days are labeled unavailable.`}
                    >
                      {stats.data.activity.days.map((d) => {
                        const known =
                          d.coverage.observedRoundCount > 0 &&
                          d.observedWorkUnits !== null;
                        const values = stats
                          .data!.activity.days.filter(
                            (d) =>
                              d.coverage.observedRoundCount > 0 &&
                              d.observedWorkUnits !== null,
                          )
                          .map((d) => Number(d.observedWorkUnits));
                        const max = Math.max(...values, 1);
                        return (
                          <div className="chart-column" key={d.date}>
                            <span>
                              {known ? number(d.observedWorkUnits) : "N/A"}
                            </span>
                            <div
                              className={`chart-bar ${known ? "" : "missing"}`}
                              style={{
                                height: known
                                  ? `${Math.max(2, (Number(d.observedWorkUnits) / max) * 120)}px`
                                  : "8px",
                              }}
                            />
                            <span>
                              {new Date(
                                d.date + "T12:00:00Z",
                              ).toLocaleDateString("en", {
                                weekday: "short",
                                timeZone: "UTC",
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="subtle-label">
                      Coverage: {stats.data.activity.coverage.coverageBps / 100}
                      %. Missing observations are unknown.
                    </p>
                  </>
                ) : (
                  <div className="empty-inline">
                    <CloudOff size={24} />
                    <p>
                      {stats.state === "loading"
                        ? "Loading official history…"
                        : stats.error}
                    </p>
                  </div>
                )}
              </section>
              <section className="surface settlements-panel">
                <div className="section-heading">
                  <h2>Recent official settlements</h2>
                  <span className="muted">Ethereum Sepolia</span>
                </div>
                {settlements.state === "loading" ? (
                  <p>Reading official settlements…</p>
                ) : recent.length ? (
                  <div className="settlement-list">
                    {recent.map((s) => (
                      <div className="settlement-row" key={s.transactionHash}>
                        <span className="proof-icon">
                          <ShieldCheck size={20} />
                        </span>
                        <div>
                          <b>Round {s.settledThroughRound}</b>
                          <span>
                            {number(s.workAdded)} work ·{" "}
                            {number(s.completedBlockCount)} Squeek blocks
                          </span>
                          <a
                            href={`${EXPLORER}/tx/${s.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {s.transactionHash.slice(0, 10)}…
                            {s.transactionHash.slice(-6)}{" "}
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div>
                          <span className="subtle-label">
                            API: {s.confirmationStatus}
                          </span>
                          <button
                            className="button compact"
                            disabled={verifying}
                            onClick={() => void verifyHash(s.transactionHash)}
                          >
                            Verify receipt
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice">
                    {settlements.error ??
                      "No settlements returned by the official API."}
                  </p>
                )}
              </section>
              {verificationPanel()}
              <section className="surface source-details">
                <h2>Where this world gets its energy</h2>
                <p>
                  Live measurements are observations. Only settled active rounds
                  checked against Sepolia can earn confirmed game energy.
                </p>
                <dl>
                  <dt>Network</dt>
                  <dd>Ethereum Sepolia · {CHAIN_ID}</dd>
                  <dt>Reviewed release</dt>
                  <dd>{RELEASE}</dd>
                  <dt>SqueekCore proxy</dt>
                  <dd>
                    <a
                      href={`${EXPLORER}/address/${CORE}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {CORE} <ExternalLink size={13} />
                    </a>
                  </dd>
                  <dt>RPC</dt>
                  <dd>
                    <a href={RPC_URL} target="_blank" rel="noreferrer">
                      {RPC_URL}
                    </a>
                  </dd>
                </dl>
                <div className="source-links">
                  {[
                    "/status",
                    "/measurement/stats?range=7d",
                    "/settlements",
                    "/core",
                  ].map((p) => (
                    <a key={p} href={API + p} target="_blank" rel="noreferrer">
                      {p} <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
                {[status, stats, settlements, core].some((r) => r.error) && (
                  <p className="error">
                    Some sources are unavailable. Refresh to try again. No
                    missing values are counted as zero.
                  </p>
                )}
              </section>
            </>
          )}
          {page === "achievements" && (
            <>
              <section className="achievement-summary">
                <span className="round-icon">
                  <Award size={28} />
                </span>
                <div>
                  <h2>A shelf full of small wonders</h2>
                  <p>
                    {unlocked.length} of {BADGES.length} achievements unlocked
                  </p>
                </div>
                <button className="button" onClick={downloadProofs}>
                  <ArrowDownToLine size={16} />
                  Export record
                </button>
              </section>
              <div className="achievement-grid">
                {BADGES.map((b, i) => (
                  <section
                    key={b.id}
                    className={`achievement-card ${unlocked.includes(b.id) ? "unlocked" : ""}`}
                  >
                    <div className={`badge-art badge-${i % 4}`}>
                      {unlocked.includes(b.id) ? (
                        i % 3 === 0 ? (
                          <Sprout size={34} />
                        ) : i % 3 === 1 ? (
                          <Heart size={34} />
                        ) : (
                          <Trophy size={34} />
                        )
                      ) : (
                        <LockKeyhole size={27} />
                      )}
                    </div>
                    <h2>{b.title}</h2>
                    <p>{b.description}</p>
                    <span className="achievement-state">
                      {unlocked.includes(b.id) ? (
                        <>
                          <CheckCircle2 size={15} />
                          {b.chain ? "Confirmed" : "Unlocked"}
                        </>
                      ) : (
                        <>
                          <LockKeyhole size={14} />
                          Keep growing
                        </>
                      )}
                    </span>
                    <span className="subtle-label">
                      {b.chain
                        ? "Verified blockchain work"
                        : "Local care achievement"}
                    </span>
                  </section>
                ))}
              </div>
              <div className="info-note">
                <ShieldCheck size={19} />
                <p>
                  Achievement records include their verified proofs and wallet
                  link when available. NFT metadata export is ready; no NFT is
                  minted and no token contract is invented.
                </p>
              </div>
            </>
          )}
          {page === "leaderboard" && (
            <>
              <div className="leaderboard-toolbar">
                <div className="state-line">
                  <span
                    className={`status-dot ${serviceReady && board && !boardError ? "green" : "amber"}`}
                  />
                  {!serviceReady || boardError
                    ? "Shared rankings unavailable"
                    : boardLoading || !board
                      ? "Reading shared rankings…"
                      : "Shared persistent rankings"}
                </div>
                <button
                  className="button compact"
                  disabled={!serviceReady || boardLoading}
                  onClick={() => void loadBoard()}
                >
                  <RefreshCw size={15} />
                  {boardLoading
                    ? "Refreshing…"
                    : boardError
                      ? "Retry rankings"
                      : "Refresh rankings"}
                </button>
              </div>
              {profile && board && !boardError && !boardLoading && (
                <section className="personal-rank">
                  <Trophy size={28} />
                  <div>
                    <h2>Your place in this little world</h2>
                    <p>
                      {short(profile.address)} · {profile.stage} hamster
                    </p>
                  </div>
                  <div>
                    <b>#{profile.rank}</b>
                    <span>Your rank</span>
                  </div>
                  <div>
                    <b>{number(profile.energy)}</b>
                    <span>Verified energy</span>
                  </div>
                  <div>
                    <b>{profile.score.toLocaleString()}</b>
                    <span>Score</span>
                  </div>
                </section>
              )}
              {boardLoading ? (
                <section className="surface empty-state">
                  <RefreshCw size={30} />
                  <h2>Reading shared rankings…</h2>
                </section>
              ) : boardError ? (
                <section className="surface empty-state" role="status">
                  <CloudOff size={30} />
                  <h2>Rankings could not be loaded</h2>
                  <p>{boardError}</p>
                </section>
              ) : board && board.players.length ? (
                <section className="surface leaderboard-table">
                  <div role="table" aria-label="Global leaderboard">
                    <div className="leaderboard-columns" role="row">
                      <span role="columnheader">Rank</span>
                      <span role="columnheader">Player & hamster</span>
                      <span role="columnheader">Evolution</span>
                      <span role="columnheader">Energy</span>
                      <span role="columnheader">Score</span>
                    </div>
                    {board.players.map((p) => (
                      <div
                        className={`leaderboard-entry ${p.address.toLowerCase() === owned ? "you" : ""}`}
                        key={p.address}
                        role="row"
                      >
                        <b className="rank-position" role="cell">
                          {p.rank < 4 && <Trophy size={20} />}
                          <span>{p.rank}</span>
                          <span className="sr-only">Rank {p.rank}</span>
                        </b>
                        <div className="leaderboard-player" role="cell">
                          <Hamster appearance={p.appearance} />
                          <div>
                            <b>
                              {p.name}
                              {p.address.toLowerCase() === owned
                                ? " · You"
                                : ""}
                            </b>
                            <a
                              href={`${EXPLORER}/address/${p.address}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {short(p.address)}
                            </a>
                          </div>
                        </div>
                        <span role="cell">{p.stage}</span>
                        <b role="cell">{p.energy.toLocaleString()}</b>
                        <b role="cell">{p.score.toLocaleString()}</b>
                      </div>
                    ))}
                  </div>
                  <p className="subtle-label table-foot">
                    {board.totalPlayers} shared players ·{" "}
                    {new Date(board.generatedAt).toLocaleTimeString()} · Top 100
                    shown
                  </p>
                </section>
              ) : (
                <section className="surface empty-state">
                  <div className="empty-plant">
                    <Hamster />
                    <Trophy size={26} />
                  </div>
                  <h2>
                    {serviceReady && board
                      ? "The first little legend could be you."
                      : "This room is waiting for the world."}
                  </h2>
                  <p>
                    {serviceReady && board
                      ? "No profiles have joined this service yet. Connect your wallet and verify ownership to begin."
                      : serviceMessage ||
                        "A shared game service is needed to keep rankings consistent across players and devices."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setSettings(true)}
                  >
                    <Settings2 size={17} />
                    {serviceReady && board
                      ? "View service connection"
                      : "Connect a game service"}
                  </button>
                  <span className="subtle-label">
                    {serviceReady && board
                      ? "No example players. Only real wallet profiles."
                      : "Local play continues. No local scores are presented as global rankings."}
                  </span>
                </section>
              )}
              <div className="leaderboard-notes">
                <section>
                  <ShieldCheck size={21} />
                  <h2>Every point has a proof</h2>
                  <p>
                    Score = energy × 100 + blockchain achievements × 25 +
                    evolution stage × 500. Game XP never affects global rank.
                  </p>
                </section>
                <section>
                  <LockKeyhole size={21} />
                  <h2>One round, one reward</h2>
                  <p>
                    The service verifies Sepolia receipts and deduplicates
                    rounds per wallet. Only work settled after joining is
                    eligible.
                  </p>
                </section>
              </div>
            </>
          )}
          <div
            className="live-announcement sr-only"
            role="status"
            aria-live="polite"
          >
            {message}
          </div>
          <footer className="page-footer">
            <span>
              <Leaf size={14} />
              Made for little moments.
            </span>
            <div>
              <span>Sepolia testnet · No real-money rewards</span>
              <button className="text-button" onClick={() => setSettings(true)}>
                <Settings2 size={14} />
                Settings
              </button>
            </div>
          </footer>
        </main>
      </div>
      <Dialog
        open={mini}
        onClose={() => {
          setMini(false);
          setMode("idle");
          setMessage("Game left. No uncollected seeds were added.");
        }}
        title="A pocketful of seeds"
      >
        {mini && (
          <MiniGame
            bonus={bonus}
            onFinish={(caught) => {
              setGame((g) => finishPlay(g, caught, bonus));
              setMessage(
                `${caught} seeds collected. ${bonus ? caught * 5 : caught * 3} care XP earned.`,
              );
              setMini(false);
              setMode("reaction");
            }}
            onCancel={() => {
              setMini(false);
              setMode("idle");
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={rename}
        onClose={() => setRename(false)}
        title="A name for your little friend"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = nameDraft.trim();
            if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(clean)) {
              setNameError(
                "Use 1–24 letters, numbers, spaces, underscores or hyphens.",
              );
              return;
            }
            setNameError("");
            setRenameBusy(true);
            try {
              if (token && serviceUrl !== null) {
                const p = await serviceRequest<Profile>(
                  serviceUrl,
                  "/api/profile",
                  token,
                  "PATCH",
                  { name: clean },
                );
                setProfile(p);
              }
              setGame((g) => ({ ...g, name: clean }));
              setRename(false);
              setMessage(`Hello, ${clean}.`);
            } catch (e) {
              setNameError((e as Error).message);
            } finally {
              setRenameBusy(false);
            }
          }}
        >
          <label className="field">
            Hamster name
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              required
              autoComplete="off"
              name="hamster-name"
              aria-invalid={!!nameError}
              aria-describedby="name-error"
            />
          </label>
          {nameError && (
            <p className="error" id="name-error" role="status">
              {nameError}
            </p>
          )}
          <p className="muted">
            1–24 letters, numbers, spaces, underscores or hyphens.
          </p>
          <button
            className="button primary full"
            type="submit"
            disabled={renameBusy}
          >
            {renameBusy ? "Saving name…" : "Save name"}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={help}
        onClose={() => setHelp(false)}
        title="A little guide to tiny paws"
      >
        <div className="help-art">
          <Hamster />
        </div>
        <p>
          Feed, pet, clean and rest with {game.name}. Select the room’s bed,
          bowl or wheel to interact.
        </p>
        <ul className="help-list">
          <li>Feeding uses one seed. Catch more in the Play game.</li>
          <li>Care earns XP. Daily missions give extra seeds and XP.</li>
          <li>Real wheel activity boosts play XP and changes world events.</li>
          <li>
            Evolution needs verified work: 100 energy for Young, 1,000 for
            Legendary.
          </li>
          <li>
            Connect a wallet and sign in for a wallet-linked save. Shared
            rankings require the game service.
          </li>
        </ul>
        <p className="notice">
          No seed phrases, payments, token approvals or game transactions are
          needed.
        </p>
        <button className="button primary full" onClick={() => setHelp(false)}>
          Back to {game.name}
        </button>
      </Dialog>
      <Dialog
        open={settings}
        onClose={() => setSettings(false)}
        title="Your world, safely saved"
      >
        <section className="settings-section">
          <h3>Game service</h3>
          <p>
            Shared profiles, cloud saves and rankings live on this service. Use
            an address supplied by your game’s host.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              let u;
              try {
                u = new URL(serviceDraft);
                if (
                  u.protocol !== "https:" &&
                  !(
                    u.protocol === "http:" &&
                    ["localhost", "127.0.0.1"].includes(u.hostname)
                  )
                )
                  throw Error();
                if (
                  u.username ||
                  u.password ||
                  u.pathname !== "/" ||
                  u.search ||
                  u.hash
                )
                  throw Error();
              } catch {
                setServiceMessage(
                  "Enter an HTTPS origin, or an HTTP localhost origin, without a path.",
                );
                return;
              }
              disconnect();
              setBoard(null);
              if (await connectService(u.origin)) {
                try {
                  localStorage.setItem("squeek.service", u.origin);
                } catch {}
              }
            }}
          >
            <label className="field">
              Service address
              <input
                name="service-address"
                type="url"
                placeholder="https://your-game-service.example"
                value={serviceDraft}
                onChange={(e) => setServiceDraft(e.target.value)}
                required
              />
            </label>
            <button className="button full" type="submit">
              <Cloud size={16} />
              Connect service
            </button>
          </form>
          <p className={serviceReady ? "notice" : "muted"} role="status">
            {serviceMessage}
          </p>
        </section>
        <section className="settings-section">
          <h3>Progress</h3>
          <p>
            {saveError
              ? "Browser storage is unavailable. Keep this page open; progress may be lost on reload."
              : owned
                ? "This wallet’s care progress is saved on this device."
                : "Guest care progress is saved on this device."}
          </p>
          {profile && (
            <>
              <div className="settings-actions">
                <button
                  className="button"
                  disabled={cloudBusy}
                  onClick={() => void saveCloud()}
                >
                  <Cloud size={16} />
                  Save to cloud
                </button>
                <button
                  className="button"
                  disabled={cloudBusy}
                  onClick={() => void saveCloud(true)}
                >
                  <ArrowDownToLine size={16} />
                  Load cloud save
                </button>
              </div>
              <p className="subtle-label">
                Loading replaces local care progress with your shared save.
                Verified energy stays in the service ledger.
              </p>
            </>
          )}
          <button
            className="text-button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(game, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "mochi-save.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <ArrowDownToLine size={16} />
            Download local save
          </button>
        </section>
        <div className="settings-section">
          <h3>Comfort</h3>
          <button
            className="button full"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
            {paused ? "Resume animations" : "Pause animations"}
          </button>
          <p className="subtle-label">
            Reduced-motion preferences are always respected.
          </p>
        </div>
      </Dialog>
      <Dialog
        open={evolving}
        onClose={() => setEvolving(false)}
        title="A little legend is growing"
      >
        <div className="evolution-celebration">
          <Sparkles size={30} />
          <Hamster
            appearance={level === 2 ? "cosmic" : "cream"}
            mode="reaction"
          />
          <h2>
            Hello, {levelName} {game.name}.
          </h2>
          <p>
            Real, verified work helped you grow. A new appearance and{" "}
            {evolutionBonus} seeds are yours.
          </p>
          <button
            className="button primary"
            onClick={() => {
              setEvolving(false);
              navigate("evolution");
            }}
          >
            Meet your new little wonder
          </button>
        </div>
      </Dialog>
    </div>
  );
  function verificationPanel() {
    return (
      <section className="surface verification-panel">
        <div className="section-heading">
          <h2>
            <ShieldCheck size={21} />
            Verify a little real work
          </h2>
          {proofKind && <StatusTag kind={proofKind} />}
        </div>
        <p>
          Check an official settlement transaction on Sepolia. No transaction is
          sent and no gas is needed.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verifyHash();
          }}
        >
          <label className="field">
            Settlement transaction hash
            <input
              type="text"
              name="transaction-hash"
              placeholder="0x…"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={proofKind === "REJECTED"}
              aria-describedby="verification-note"
            />
          </label>
          <button className="button primary" type="submit" disabled={verifying}>
            {verifying ? <RefreshCw size={17} /> : <ShieldCheck size={17} />}{" "}
            {verifying ? "Checking Sepolia…" : "Verify settlement"}
          </button>
        </form>
        <div className="verify-latest">
          <button
            className="text-button"
            disabled={verifying || !recent.length}
            onClick={() => void verifyHash(recent[0].transactionHash)}
          >
            Use latest official settlement <ArrowRight size={14} />
          </button>
          <span className="subtle-label">12 confirmations required</span>
        </div>
        <p
          id="verification-note"
          className={
            proofKind === "UNAVAILABLE" || proofKind === "REJECTED"
              ? "error"
              : "muted"
          }
          role="status"
        >
          {proofStatus ||
            "Verifies the network, canonical receipt, pinned core identity, events, round ledger and completed blocks."}
        </p>
        {proofs.length > 0 && (
          <div className="verified-proofs">
            {proofs
              .slice(-3)
              .reverse()
              .map((p) => (
                <div key={p.hash}>
                  <CheckCircle2 size={16} />
                  <span>
                    Round {p.through} · {number(p.work)} work
                  </span>
                  <a
                    href={`${EXPLORER}/tx/${p.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View proof <ExternalLink size={12} />
                  </a>
                </div>
              ))}
          </div>
        )}
      </section>
    );
  }
}
function ArrowUpRightIcon() {
  return <ExternalLink size={13} />;
}
export default App;

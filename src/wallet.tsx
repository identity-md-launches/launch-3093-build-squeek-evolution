import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createConfig,
  http,
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { sepolia } from "viem/chains";
import { getAddress } from "viem";
import {
  Wallet,
  X,
  LogOut,
  ShieldCheck,
  ArrowUpRight,
  Globe,
} from "lucide-react";
import { RPC_URL } from "./chain";
export const walletConfig = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Squeek Evolution", preference: "all" }),
  ],
  transports: { [sepolia.id]: http(RPC_URL) },
});
export const short = (a: string) =>
  `${getAddress(a).slice(0, 6)}…${a.slice(-4)}`;
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (open && !el?.open) el?.showModal();
    if (!open && el?.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
const links = [
  {
    id: "metaMask",
    name: "MetaMask",
    href: (u: string) =>
      `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (u: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (u: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(u)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (u: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`,
  },
];
function Mark({ id, icon }: { id: string; icon?: string }) {
  return icon ? (
    <img src={icon} width="28" height="28" alt="" />
  ) : id === "coinbase" || id === "coinbaseWalletSDK" ? (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#2c5ff6" />
      <circle cx="14" cy="14" r="10" fill="white" />
      <rect x="10" y="10" width="8" height="8" fill="#2c5ff6" />
    </svg>
  ) : ["metaMask", "rabby", "phantom"].includes(id) ? (
    <img src={`./wallets/${id}.svg`} width="28" height="28" alt="" />
  ) : (
    <Globe size={28} />
  );
}
export function WalletControl({
  verified,
  onVerify,
  onDisconnect,
  serviceReady,
}: {
  verified: boolean;
  onVerify: () => Promise<void>;
  onDisconnect: () => void;
  serviceReady: boolean;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [signing, setSigning] = useState(false);
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as unknown as { ethereum?: unknown }).ethereum &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = connectors
    .filter((c) => !(c.id === "injected" && named))
    .filter((c) => !mobile || c.type !== "injected")
    .sort(
      (a, b) => Number(b.type === "injected") - Number(a.type === "injected"),
    );
  const close = () => {
    setOpen(false);
    setError("");
  };
  async function switchNetwork() {
    try {
      setError("");
      await switchChainAsync({ chainId: sepolia.id });
    } catch (e) {
      setOpen(true);
      setError(
        (e as Error).message?.split("\n")[0] ||
          "Network switch declined. Try again in your wallet.",
      );
    }
  }
  return (
    <>
      <button
        className={`wallet-button ${isConnected ? "connected" : ""}`}
        onClick={() => {
          if (isConnected && chainId !== sepolia.id) void switchNetwork();
          else setOpen(true);
        }}
      >
        <Wallet size={17} />
        <span>
          {switching
            ? "Switching…"
            : isConnected && address
              ? chainId !== sepolia.id
                ? "Switch to Sepolia"
                : short(address)
              : "Connect wallet"}
        </span>
        {verified && <ShieldCheck size={16} />}
      </button>
      <Dialog
        open={open}
        onClose={close}
        title={isConnected ? "Your wallet" : "Connect a wallet"}
        className="wallet-dialog"
      >
        {isConnected && address ? (
          <>
            <p className="wallet-address">{getAddress(address)}</p>
            <div className="state-line">
              <span
                className={`status-dot ${chainId === sepolia.id ? "green" : "amber"}`}
              />
              {chainId === sepolia.id
                ? "Ethereum Sepolia"
                : "Different network"}
            </div>
            <p className="muted">
              {verified
                ? "Wallet ownership verified for this session."
                : serviceReady
                  ? "Sign a message to link your profile and global achievements."
                  : "Sign a message to open this wallet’s local profile. Shared profiles need a connected game service."}
            </p>
            {chainId !== sepolia.id ? (
              <button
                className="button primary full"
                onClick={() => void switchNetwork()}
              >
                Switch to Ethereum Sepolia
              </button>
            ) : (
              !verified && (
                <button
                  className="button primary full"
                  disabled={signing}
                  onClick={async () => {
                    setSigning(true);
                    setError("");
                    try {
                      await onVerify();
                      close();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSigning(false);
                    }
                  }}
                >
                  <ShieldCheck size={18} />
                  {signing ? "Check your wallet…" : "Verify wallet ownership"}
                </button>
              )
            )}
            <button
              className="button full"
              onClick={() => {
                disconnect();
                onDisconnect();
                close();
              }}
            >
              <LogOut size={18} />
              Disconnect wallet
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Open your wallet profile, or keep playing as a guest.
            </p>
            {mobile &&
              links.map((w) => (
                <a
                  className="wallet-row"
                  key={w.id}
                  href={w.href(location.href)}
                >
                  <Mark id={w.id} />
                  <span>Open in {w.name}</span>
                  <ArrowUpRight size={16} />
                </a>
              ))}
            {listed.map((c) => (
              <button
                className="wallet-row"
                key={c.uid}
                disabled={isPending}
                onClick={async () => {
                  setError("");
                  try {
                    await connectAsync({ connector: c });
                    close();
                  } catch {
                    setError(
                      "Wallet connection declined or unavailable. Open your wallet and try again.",
                    );
                  }
                }}
              >
                <Mark id={c.id} icon={c.icon} />
                <span>
                  {c.id === "injected"
                    ? "Browser wallet"
                    : c.id === "coinbaseWalletSDK" && mobile
                      ? "Coinbase Smart Wallet"
                      : c.name}
                  {isPending && variables?.connector === c ? " · opening…" : ""}
                </span>
              </button>
            ))}
          </>
        )}
        {error && (
          <p className="error" role="status">
            {error}
          </p>
        )}
        <p className="wallet-footnote">
          <ShieldCheck size={15} />
          Only you approve signatures. No seed phrases. No game transactions.
        </p>
      </Dialog>
    </>
  );
}

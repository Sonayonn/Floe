"use client";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useWallets, useConnectWallet } from "@mysten/dapp-kit";
import { isEnokiWallet, isGoogleWallet, type EnokiWallet } from "@mysten/enoki";
import { X } from "lucide-react";
import { ENOKI_ENABLED } from "@/lib/enoki";

// Login modal: "Sign in with Google" (Enoki zkLogin, sponsored gas) up top as the no-wallet path,
// then any detected browser wallets below. Connecting the Google wallet opens the OAuth popup;
// connecting a standard wallet prompts that extension. Closes itself on a successful connect.
export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();

  // Split the registry: Enoki zkLogin wallets vs. real browser wallets.
  const google = useMemo(() => wallets.find(isGoogleWallet) as EnokiWallet | undefined, [wallets]);
  const standard = useMemo(() => wallets.filter((w) => !isEnokiWallet(w)), [wallets]);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const doConnect = (wallet: (typeof wallets)[number]) =>
    connect({ wallet }, { onSuccess: () => onClose() });

  return createPortal(
    <div className="auth-overlay" onClick={onClose} role="presentation">
      <div
        className="auth-modal floe-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Floe"
      >
        <button className="auth-modal__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="auth-modal__head">
          <h2 className="auth-modal__title">Sign in to Floe</h2>
          <p className="auth-modal__sub">
            Connect a Sui wallet, or sign in with Google — gas is sponsored, so you can transact with no SUI.
          </p>
        </div>

        {ENOKI_ENABLED && google && (
          <>
            <button
              className="auth-google"
              disabled={isPending}
              onClick={() => doConnect(google)}
            >
              <img src={google.icon} alt="" width={18} height={18} />
              Sign in with Google
            </button>
            <div className="auth-divider"><span>or connect a wallet</span></div>
          </>
        )}

        <div className="auth-wallets">
          {standard.length === 0 ? (
            <div className="auth-empty">
              No Sui wallet detected. Install{" "}
              <a href="https://chromewebstore.google.com/detail/slush-%E2%80%94-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil" target="_blank" rel="noreferrer">Slush</a>{" "}
              {ENOKI_ENABLED ? "— or use Google above." : "to continue."}
            </div>
          ) : (
            standard.map((w) => (
              <button key={w.name} className="auth-wallet" disabled={isPending} onClick={() => doConnect(w)}>
                {w.icon && <img src={w.icon} alt="" width={22} height={22} />}
                <span>{w.name}</span>
              </button>
            ))
          )}
        </div>

        <p className="auth-modal__foot">
          By continuing you agree that Floe is non-custodial software on Sui testnet. Your keys, your assets.
        </p>
      </div>
    </div>,
    document.body,
  );
}

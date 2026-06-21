"use client";
import { useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentWallet, useDisconnectWallet } from "@mysten/dapp-kit";
import { isGoogleWallet } from "@mysten/enoki";
import { ChevronDown, Copy, LogOut, ExternalLink, Check } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { suiAccount } from "@/lib/explorer";
import { AuthModal } from "./AuthModal";

// The nav auth control. Disconnected → "Connect wallet" opens the AuthModal. Connected → a glass
// chip showing the address (and a Google badge for zkLogin sessions) with a small disconnect menu.
export function AuthButton() {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!account) {
    return (
      <>
        <button className="auth-cta" onClick={() => setModalOpen(true)}>Connect wallet</button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  const isGoogle = currentWallet ? isGoogleWallet(currentWallet) : false;
  const copy = () => {
    navigator.clipboard?.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="auth-chip-wrap" ref={ref}>
      <button className="auth-chip" data-google={isGoogle ? "1" : undefined} onClick={() => setMenuOpen((v) => !v)}>
        {isGoogle && currentWallet?.icon && <img src={currentWallet.icon} alt="" width={15} height={15} />}
        <span className="auth-chip__addr">{shortAddr(account.address)}</span>
        <ChevronDown size={13} />
      </button>

      {menuOpen && (
        <div className="auth-menu floe-panel" role="menu">
          <div className="auth-menu__head">
            {isGoogle ? "Signed in with Google" : currentWallet?.name ?? "Wallet"}
          </div>
          <button className="auth-menu__item" onClick={copy} role="menuitem">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy address"}
          </button>
          <a className="auth-menu__item" href={suiAccount(account.address)} target="_blank" rel="noreferrer" role="menuitem">
            <ExternalLink size={14} /> View on explorer
          </a>
          <button className="auth-menu__item auth-menu__item--danger" onClick={() => { disconnect(); setMenuOpen(false); }} role="menuitem">
            <LogOut size={14} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

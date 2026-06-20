"use client";

import * as React from "react";
import { cn } from "./cn";

interface WalletButtonProps {
  address?: string;
  ensName?: string;
  chainName?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton({ address, ensName, chainName, onConnect, onDisconnect, className }: WalletButtonProps) {
  const [open, setOpen] = React.useState(false);

  if (!address) {
    return (
      <button onClick={onConnect} className={cn("o-btn-primary text-xs", className)}>
        Connect
      </button>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-sm border border-accent bg-accent/10 px-3 py-1.5 text-xs text-accent",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {ensName ?? shortAddress(address)}
        {chainName && <span className="text-cream3">· {chainName}</span>}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-64 rounded-md border border-ink3 bg-ink2 p-3 shadow-2xl animate-fade-in"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-xs text-cream3">Connected</p>
          <p className="mt-1 font-mono text-xs text-cream">{shortAddress(address)}</p>
          {ensName && <p className="mt-0.5 text-xs text-accent">{ensName}</p>}
          <button
            onClick={() => { onDisconnect?.(); setOpen(false); }}
            className="mt-3 w-full o-btn-ghost text-xs"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

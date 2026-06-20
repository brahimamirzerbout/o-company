"use client";

import * as React from "react";
import { cn } from "./cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  // Close on ESC
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn(
        "relative w-full o-card animate-slide-up",
        sizeClasses[size],
      )}>
        {(title || description) && (
          <div className="mb-4">
            {title && <h3 className="font-serif text-xl text-cream">{title}</h3>}
            {description && <p className="mt-1 text-sm text-cream3">{description}</p>}
          </div>
        )}
        {children}
        {footer && <div className="mt-6 flex items-center justify-end gap-2 border-t border-ink3 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

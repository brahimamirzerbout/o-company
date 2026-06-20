"use client";

import * as React from "react";
import { cn } from "./cn";

type Variant = "primary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "o-btn-primary",
  ghost:   "o-btn-ghost",
  danger:  "o-btn-danger",
  link:    "text-accent hover:text-accent-soft underline-offset-4 hover:underline",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          variant === "link" ? variantClasses.link : cn(variantClasses[variant], sizeClasses[size]),
          (disabled || loading) && "opacity-50 pointer-events-none",
          className,
        )}
        {...rest}
      >
        {loading ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

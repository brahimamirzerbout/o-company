"use client";

import * as React from "react";
import { cn } from "./cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional title for the card header. */
  title?: React.ReactNode;
  /** Optional description under the title. */
  description?: React.ReactNode;
  /** Action shown on the right of the header. */
  action?: React.ReactNode;
}

export function Card({ className, title, description, action, children, ...rest }: CardProps) {
  return (
    <div className={cn("o-card", className)} {...rest}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="font-serif text-xl text-cream">{title}</h3>}
            {description && <p className="mt-1 text-sm text-cream3">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function CardRow({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-ink3 py-3 last:border-0", className)} {...rest}>
      {children}
    </div>
  );
}

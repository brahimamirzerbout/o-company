"use client";

import * as React from "react";
import { cn } from "./cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn("o-card flex flex-col items-center justify-center text-center py-12", className)}>
      {icon && <div className="mb-3 text-cream3">{icon}</div>}
      <h3 className="font-serif text-lg text-cream">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-cream3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

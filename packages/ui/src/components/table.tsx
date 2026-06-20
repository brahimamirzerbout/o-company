"use client";

import * as React from "react";
import { cn } from "./cn";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {}
export function Table({ className, ...rest }: TableProps) {
  return (
    <div className="o-card overflow-x-auto p-0">
      <table className={cn("w-full text-sm", className)} {...rest} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3" />;
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className="border-b border-ink3 last:border-0 hover:bg-ink3/30" />;
}

export function TH(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className="px-4 py-3 text-left font-semibold" />;
}

export function TD(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className="px-4 py-3" />;
}

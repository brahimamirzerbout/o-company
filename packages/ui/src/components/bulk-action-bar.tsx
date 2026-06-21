"use client";

import * as React from "react";
import { Card, Pill, Button } from "@o/ui";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// BulkActionBar
// =============================================================================
// A floating action bar that appears at the bottom of a list view when
// the user has selected 1+ rows. The bar shows the count, the available
// bulk actions, and the result of the last action.
//
// Usage:
//   <BulkActionBar
//     selectedIds={selectedIds}
//     onClearSelection={() => setSelectedIds([])}
//     actions={[
//       { label: "Mark as active", endpoint: "/api/crm/contacts/bulk-update",
//         body: { ids, updates: { status: "active" } } },
//       { label: "Delete", endpoint: "/api/crm/contacts/bulk-delete",
//         body: { ids }, tone: "danger", confirm: true },
//     ]}
//   />
//
// The bar is fixed at the bottom-center of the viewport. It animates
// in when the count goes from 0 to 1, animates out when it goes back
// to 0. Action buttons are disabled while a request is in flight.
// Results (success/failure counts) appear in a toast above the bar.

export interface BulkAction {
  label: string;
  endpoint: string;
  body: Record<string, unknown>;
  tone?: "default" | "danger";
  confirm?: boolean;       // require a confirm step
  confirmMessage?: string; // shown in the confirm dialog
}

interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  actions: BulkAction[];
}

interface Result {
  action: string;
  status: "ok" | "err";
  message: string;
}

export function BulkActionBar({ selectedIds, onClearSelection, actions }: BulkActionBarProps) {
  const [busy, setBusy] = React.useState(false);
  const [confirmingAction, setConfirmingAction] = React.useState<BulkAction | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);

  if (selectedIds.length === 0) return null;

  async function runAction(action: BulkAction) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(action.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...action.body,
          ids: action.body.ids ?? selectedIds,
        }),
      });
      if (!res.ok && res.status !== 207) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.updated ?? data.deleted ?? 0;
      const failed = data.failed ?? 0;
      setResult({
        action: action.label,
        status: failed > 0 ? "err" : "ok",
        message: failed > 0
          ? `${updated} updated, ${failed} failed`
          : `${updated} ${action.label.toLowerCase()}`,
      });
      if (failed === 0) {
        // Clear the selection on full success; keep it if there were
        // partial failures so the user can retry.
        setTimeout(() => onClearSelection(), 1000);
      }
    } catch (err) {
      setResult({
        action: action.label,
        status: "err",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      setConfirmingAction(null);
    }
  }

  return (
    <>
      {confirmingAction && (
        <ConfirmDialog
          message={confirmingAction.confirmMessage ?? `Apply "${confirmingAction.label}" to ${selectedIds.length} contact(s)?`}
          onConfirm={() => runAction(confirmingAction)}
          onCancel={() => setConfirmingAction(null)}
          busy={busy}
          tone={confirmingAction.tone ?? "default"}
        />
      )}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-ink2 border border-ink3 rounded-md shadow-2xl px-4 py-3 flex items-center gap-4 min-w-[400px]">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">
              {selectedIds.length}
            </span>
            <span className="text-sm text-cream2">
              {selectedIds.length === 1 ? "contact" : "contacts"} selected
            </span>
          </div>

          {result && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm",
              result.status === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
            )}>
              {result.status === "ok" ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {result.message}
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                disabled={busy}
                onClick={() => action.confirm ? setConfirmingAction(action) : runAction(action)}
                className={cn(
                  action.tone === "danger" && "text-red-400 hover:text-red-300",
                )}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={onClearSelection} disabled={busy}>
              Clear
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, busy, tone }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  tone: "default" | "danger";
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <Card className="max-w-md w-full mx-4">
        <div className="text-sm text-cream">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className={cn(tone === "danger" && "bg-red-500/15 text-red-400 hover:bg-red-500/25")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

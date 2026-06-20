"use client";

import { PageHeader, Card, Button, Switch, Input } from "@o/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Workspace · Billing · Security" />
      <div className="space-y-6">
        <Card title="Workspace" description="The basics">
          <Field label="Company name" defaultValue="o.company" />
          <Field label="Subdomain" defaultValue="o.company" suffix=".o.company" />
          <Field label="Default currency" defaultValue="USD" />
          <Field label="Default timezone" defaultValue="America/Chicago" />
        </Card>
        <Card title="Billing" description="Plan, payment method, invoices">
          <Row label="Plan" value="Team · $19/user/mo" />
          <Row label="Seats" value="1 of 25 used" />
          <Row label="Payment method" value="Visa ending 4242" />
          <Row label="Next invoice" value="Jul 1, 2026" />
          <div className="pt-3"><Button variant="ghost">Manage billing</Button></div>
        </Card>
        <Card title="Security" description="2FA, sessions, audit log">
          <Toggle label="Two-factor authentication" value />
          <Toggle label="Require 2FA for staff" />
          <Toggle label="Auto-revoke sessions after 30 days" value />
          <Toggle label="Email me on new device sign-in" value />
          <div className="pt-3"><Button variant="ghost">View audit log</Button></div>
        </Card>
        <Card title="Privacy" description="What we collect, what we don't, what you can opt out of">
          <Toggle label="Crash reports" sub="Helps us fix bugs. No PII." value />
          <Toggle label="Product analytics" sub="Aggregate usage data, never individual." />
          <Toggle label="Marketing emails from us" value />
        </Card>
        <Card title="Danger zone">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-cream">Delete account</p>
              <p className="text-xs text-cream3">Permanently delete this workspace and all its data. Cannot be undone.</p>
            </div>
            <Button variant="danger">Delete workspace</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Field({ label, defaultValue, suffix }: { label: string; defaultValue: string; suffix?: string }) {
  return (
    <div className="mb-4">
      <label className="o-label">{label}</label>
      <div className="flex">
        <input className="o-input flex-1" defaultValue={defaultValue} />
        {suffix && (
          <span className="ml-2 inline-flex items-center rounded-sm border border-l-0 border-ink3 bg-ink2 px-3 text-sm text-cream3">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-ink3 py-3 first:border-0">
      <span className="text-sm text-cream3">{label}</span>
      <span className="text-sm text-cream">{value}</span>
    </div>
  );
}

function Toggle({ label, sub, value }: { label: string; sub?: string; value?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-ink3 py-3 first:border-0">
      <div>
        <p className="text-sm text-cream">{label}</p>
        {sub && <p className="text-xs text-cream3">{sub}</p>}
      </div>
      <Switch defaultChecked={value} />
    </div>
  );
}

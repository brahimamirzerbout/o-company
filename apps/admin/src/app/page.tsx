import Link from "next/link";
import { Shield, ArrowRight } from "lucide-react";
import { Card, Button, Logo, Wordmark } from "@o/ui";

export default function AdminLanding() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-2 mb-8">
          <Logo size="lg" variant="cream" />
          <Wordmark variant="cream" />
        </div>
        <Card>
          <div className="text-center">
            <Shield className="h-8 w-8 text-accent mx-auto" />
            <h1 className="mt-3 font-serif text-2xl text-cream">Owner console</h1>
            <p className="mt-2 text-sm text-cream3">
              Sign in to access owner-only operations: ownership transfer, billing, audit log, dangerous actions.
            </p>
          </div>
          <div className="mt-6 space-y-3">
            <Link href="/login" className="block o-btn-primary text-center">Sign in as owner</Link>
            <Link href="/" className="block text-center text-xs text-cream3 hover:text-cream">← Back to operator console</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

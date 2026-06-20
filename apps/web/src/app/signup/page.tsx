import Link from "next/link";

export const metadata = { title: "Start a brief" };

export default function SignupPage() {
  return (
    <section className="container mx-auto px-6 py-20 md:py-32 max-w-md">
      <h1 className="font-serif text-4xl text-cream text-center">Start a brief.</h1>
      <p className="mt-2 text-center text-sm text-cream3">Free for 1 user. No credit card.</p>
      <form className="mt-10 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="o-label">First name</label>
            <input type="text" required className="o-input" />
          </div>
          <div>
            <label className="o-label">Last name</label>
            <input type="text" required className="o-input" />
          </div>
        </div>
        <div>
          <label className="o-label">Work email</label>
          <input type="email" required className="o-input" />
        </div>
        <div>
          <label className="o-label">Company name</label>
          <input type="text" required className="o-input" />
        </div>
        <div>
          <label className="o-label">Password</label>
          <input type="password" required minLength={8} className="o-input" />
          <p className="mt-1 text-xs text-cream3">At least 8 characters.</p>
        </div>
        <button type="submit" className="o-btn-primary w-full justify-center">Create account</button>
        <p className="text-center text-xs text-cream3">
          By creating an account, you agree to our{" "}
          <Link href="/legal/terms" className="text-accent">Terms</Link> and{" "}
          <Link href="/legal/privacy" className="text-accent">Privacy</Link>.
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-cream3">
        Already have an account? <Link href="/login" className="text-accent">Sign in</Link>
      </p>
    </section>
  );
}

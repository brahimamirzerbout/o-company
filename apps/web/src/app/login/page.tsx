import Link from "next/link";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="container mx-auto px-6 py-20 md:py-32 max-w-md">
      <h1 className="font-serif text-4xl text-cream text-center">Sign in</h1>
      <p className="mt-2 text-center text-sm text-cream3">Welcome back.</p>
      <form className="mt-10 space-y-4">
        <div>
          <label className="o-label">Email</label>
          <input type="email" name="email" required className="o-input" placeholder="you@company.com" />
        </div>
        <div>
          <label className="o-label">Password</label>
          <input type="password" name="password" required className="o-input" />
        </div>
        <button type="submit" className="o-btn-primary w-full justify-center">Sign in</button>
      </form>
      <p className="mt-6 text-center text-sm text-cream3">
        New here? <Link href="/signup" className="text-accent">Create an account</Link>
      </p>
    </section>
  );
}

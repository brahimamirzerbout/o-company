export default function NotFound() {
  return (
    <div className="container mx-auto px-6 py-32 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-accent">404</p>
      <h1 className="mt-3 font-serif text-5xl text-cream">Not found.</h1>
      <p className="mt-4 text-cream2">The page you're looking for doesn't exist or has been moved.</p>
      <a href="/" className="mt-8 inline-block o-btn-primary">Back to home</a>
    </div>
  );
}

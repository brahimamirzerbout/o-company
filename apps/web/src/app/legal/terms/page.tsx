import { renderContract, MSA } from "@o/legal";
import { marked } from "marked";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const html = marked.parse(renderContract(MSA)) as string;
  return (
    <article className="container mx-auto px-6 py-20 md:py-28 max-w-3xl">
      <h1 className="font-serif text-4xl md:text-5xl text-cream">Master Services Agreement</h1>
      <p className="mt-2 text-sm text-cream3">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <div className="mt-10 prose prose-invert max-w-none text-cream2 [&>h2]:text-cream [&>h2]:font-serif [&>h2]:text-2xl [&>h2]:mt-12 [&>h2]:mb-3 [&>p]:leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

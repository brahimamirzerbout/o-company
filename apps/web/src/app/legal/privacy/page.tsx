import { renderContract, DPA } from "@o/legal";
import { marked } from "marked";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  // Privacy policy is its own document, not the MSA. Inline here for the
  // MVP. Will move to its own contract module when we have legal review.
  const md = `
# Privacy Policy

Last updated: ${new Date().toISOString().slice(0, 10)}.

## Summary

We don't sell your data. We don't share it with advertisers. We don't track you across the web. Your customer data is yours and our absence from it is the feature.

## What we collect

- **Account info**: email, name, and password (hashed with Argon2id)
- **Billing info**: handled by Stripe — we never see your card number
- **Your data**: contacts, deals, projects, notes, tasks — anything you store in o.company
- **Device sync metadata**: timestamps, last-seen, conflict-resolution data — never the content
- **Crash reports**: only if you opt in via Settings → Privacy

## What we don't collect

- Browsing history on other sites
- Device advertising IDs (IDFA, GAID)
- Location data unless you grant it for the map view
- Contact list, photos, files — anything you haven't stored in o.company
- Voice note audio — we never receive it. STT runs on-device.

## Where your data is stored

On every device you sign in on, in a local SQLite database. For sync, on our infrastructure in AWS, encrypted at rest with AES-256, in transit with TLS 1.3. EU customers can opt for eu-central-1 at signup.

## Cookies and tracking

We use a single first-party session cookie. No third-party analytics. No Meta, Google, or LinkedIn pixels. No session-replay tools. No A/B testing scripts.

## Your rights

- **Access**: Export your full data archive from Settings → Data
- **Rectification**: Edit anything in the app; changes are local-first and sync
- **Deletion**: Delete your account; data is purged within 30 days
- **Portability**: Standard JSON + SQLite archive, importable into any system

## Contact

Data Protection Officer · privacy@o.company
`;
  const html = marked.parse(md) as string;
  return (
    <article className="container mx-auto px-6 py-20 md:py-28 max-w-3xl">
      <h1 className="font-serif text-4xl md:text-5xl text-cream">Privacy Policy</h1>
      <div className="mt-10 prose prose-invert max-w-none text-cream2 [&>h2]:text-cream [&>h2]:font-serif [&>h2]:text-2xl [&>h2]:mt-12 [&>h2]:mb-3 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-1.5" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

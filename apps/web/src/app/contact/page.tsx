import { Mail, Phone, MapPin } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Contact</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream max-w-3xl">Let's talk.</h1>
          <p className="mt-6 text-xl text-cream2 max-w-2xl">Email, call, or fill out the form. We reply within 1 business hour, every time.</p>
        </div>
      </section>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-16 grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl text-cream">Channels</h2>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-accent mt-1" />
                <div>
                  <p className="text-xs uppercase tracking-widest text-cream3">Sales</p>
                  <a href="mailto:sales@o.company" className="text-cream hover:text-accent">sales@o.company</a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-accent mt-1" />
                <div>
                  <p className="text-xs uppercase tracking-widest text-cream3">Support</p>
                  <a href="mailto:support@o.company" className="text-cream hover:text-accent">support@o.company</a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-accent mt-1" />
                <div>
                  <p className="text-xs uppercase tracking-widest text-cream3">Security</p>
                  <a href="mailto:security@o.company" className="text-cream hover:text-accent">security@o.company</a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-accent mt-1" />
                <div>
                  <p className="text-xs uppercase tracking-widest text-cream3">Phone</p>
                  <a href="tel:+14176934630" className="text-cream hover:text-accent">(417) 693-4630</a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-accent mt-1" />
                <div>
                  <p className="text-xs uppercase tracking-widest text-cream3">HQ</p>
                  <p className="text-cream">Bolivar, Missouri · Operating worldwide</p>
                </div>
              </li>
            </ul>
          </div>
          <form className="space-y-4">
            <h2 className="font-serif text-3xl text-cream">Or send a brief</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <input name="name" type="text" placeholder="Your name" required className="o-input" />
              <input name="email" type="email" placeholder="Email" required className="o-input" />
            </div>
            <input name="company" type="text" placeholder="Company (optional)" className="o-input" />
            <select name="topic" className="o-input cursor-pointer">
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="partnership">Partnership</option>
              <option value="other">Other</option>
            </select>
            <textarea name="message" placeholder="What can we help with?" rows={5} required className="o-input min-h-[120px] resize-y" />
            <button type="submit" className="o-btn-primary w-full justify-center">Send</button>
          </form>
        </div>
      </section>
    </article>
  );
}

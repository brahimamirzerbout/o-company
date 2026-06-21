// =============================================================================
// o.company · email
// =============================================================================
// All transactional email flows through here. The actual templates are React
// Email components in templates.tsx — they're rendered to HTML, inlined for
// email-client compatibility, then sent via Resend.
//
// We never BCC ourselves. We never add tracking pixels. Every link in every
// email is a plain text link, no UTM tracking.
//
// MODES:
//   - "real"   sends via Resend (production, or any env that has RESEND_API_KEY)
//   - "log"    writes the rendered HTML to the logger (dev, no Resend key set)
//   - "capture" also writes to a file in /tmp (useful for E2E tests)
//
// The mode is auto-detected from env:
//   If RESEND_API_KEY is set: real
//   Else if NODE_ENV === "production": error (no fallback in prod)
//   Else: log

import { Resend } from "resend";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { renderTemplate, type TemplateProps, type TemplateName } from "./templates";
import { logger } from "@o/logger";

type EmailMode = "real" | "log" | "capture";

let _resend: Resend | null = null;
function resend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  _resend = new Resend(key);
  return _resend;
}

function detectMode(): EmailMode {
  if (process.env.RESEND_API_KEY) return "real";
  if (process.env.NODE_ENV === "production") return "real"; // Will fail loudly below
  if (process.env.EMAIL_CAPTURE_DIR) return "capture";
  return "log";
}

export interface SendEmailInput<T extends TemplateName> {
  to: string | string[];
  /** Override the template default subject. */
  subject?: string;
  /** Override the From address. Must be on a verified domain. */
  from?: string;
  /** Reply-To header. */
  replyTo?: string;
  /** Template name. */
  template: T;
  /** Template props. */
  props: TemplateProps<T>;
  /** Attachments. */
  attachments?: Array<{ filename: string; content: Buffer }>;
  /** Tags for filtering in the Resend dashboard. */
  tags?: Array<{ name: string; value: string }>;
}

export async function sendEmail<T extends TemplateName>(input: SendEmailInput<T>) {
  const html = await renderTemplate(input.template, input.props);
  const subject = input.subject ?? defaultSubject(input.template, input.props);
  const from = input.from ?? `${process.env.EMAIL_FROM ?? "hello@o.company"}`;
  const to = Array.isArray(input.to) ? input.to : [input.to];

  const mode = detectMode();

  if (mode === "log") {
    // Dev mode without Resend. Log the email so you can see what would
    // have been sent. The HTML is included so you can render it in your
    // terminal (or pipe to a file for inspection).
    logger.info("email.send.log_mode", {
      mode,
      to,
      from,
      subject,
      template: input.template,
      htmlLength: html.length,
      preview: html.slice(0, 200),
    });
    return { id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }

  if (mode === "capture") {
    // E2E test mode. Writes the rendered HTML to a file so the test
    // can assert against it.
    const dir = process.env.EMAIL_CAPTURE_DIR!;
    mkdirSync(dir, { recursive: true });
    const filename = `${input.template}_${Date.now()}.html`;
    writeFileSync(join(dir, filename), html, "utf-8");
    logger.info("email.send.capture_mode", { mode, to, from, subject, template: input.template, file: filename });
    return { id: `capture_${filename}` };
  }

  // mode === "real"
  const result = await resend().emails.send({
    from,
    to,
    subject,
    html,
    replyTo: input.replyTo ?? process.env.EMAIL_REPLY_TO,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
    tags: input.tags,
    // Hardening — never allow click tracking
    tracking: { opens: "disabled", clicks: "disabled" },
  });

  if (result.error) {
    throw new Error(`Email send failed: ${result.error.message}`);
  }
  return { id: result.data!.id };
}

function defaultSubject<T extends TemplateName>(template: T, props: TemplateProps<T>): string {
  // Switch on template name to provide sensible defaults
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = props as any;
  switch (template) {
    case "invite":              return `You've been invited to ${p.orgName ?? "o.company"}`;
    case "invoice":             return `Invoice ${p.invoiceNumber} from ${p.orgName}`;
    case "invoice_reminder":    return `Reminder: Invoice ${p.invoiceNumber} is due ${p.dueDate}`;
    case "ticket_reply":        return `[${p.ticketSubject}] New reply`;
    case "ticket_resolved":     return `[${p.ticketSubject}] Your ticket is resolved`;
    case "morning_briefing":    return `Your morning brief — ${p.date}`;
    case "weekly_digest":       return `Your week at ${p.orgName}`;
    case "password_reset":      return `Reset your password`;
    case "email_verification":  return `Verify your email`;
    case "payment_received":    return `Payment received — $${p.amountUsd}`;
    case "welcome":             return `Welcome to ${p.orgName}`;
  }
  return "Message from o.company";
}

// Re-export templates so consumers can compose with the email package
export { renderTemplate, type TemplateName, type TemplateProps } from "./templates";

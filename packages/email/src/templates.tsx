// =============================================================================
// o.company · email templates (React Email)
// =============================================================================
// Every email the company sends is a typed React component. The `<Email>`
// wrapper in `components.tsx` enforces the brand. Add a new template by:
//   1. Defining its props type here
//   2. Building a React component
//   3. Adding to the TemplateName union
//   4. Adding a default subject in index.ts (defaultSubject switch)

import { render } from "@react-email/render";
import {
  Body, Container, Head, Heading, Hr, Html, Img, Link, Preview,
  Section, Tailwind, Text,
} from "@react-email/components";

/* eslint-disable @next/next/no-img-element */

// =============================================================================
// Brand chrome
// =============================================================================

const COLORS = {
  ink:    "#0E0E0F",
  ink2:   "#16161A",
  cream:  "#E8E0D0",
  cream2: "#BFB6A2",
  accent: "#D4A853",
};

function Email({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Preview>{preview}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                ink:    COLORS.ink,
                cream:  COLORS.cream,
                accent: COLORS.accent,
              },
              fontFamily: {
                serif: ["'Instrument Serif'", "Georgia", "serif"],
                sans:  ["Inter", "system-ui", "sans-serif"],
              },
            },
          },
        }}
      >
        <Body
          className="bg-ink font-sans text-cream"
          style={{ backgroundColor: COLORS.ink, color: COLORS.cream, fontFamily: "Inter, system-ui, sans-serif", margin: 0, padding: 0 }}
        >
          <Container className="mx-auto my-0" style={{ maxWidth: "560px", padding: "48px 24px" }}>
            <Section style={{ marginBottom: "32px" }}>
              <Text style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", color: COLORS.cream, margin: 0, lineHeight: "1" }}>
                o.<span style={{ color: COLORS.accent }}>.</span>
              </Text>
            </Section>
            {children}
            <Hr style={{ borderColor: "#2A2A33", margin: "40px 0 24px" }} />
            <Section>
              <Text style={{ color: COLORS.cream2, fontSize: "12px", margin: 0 }}>
                Sent by o.company · {new Date().getFullYear()}
              </Text>
              <Text style={{ color: COLORS.cream2, fontSize: "12px", margin: "8px 0 0" }}>
                You received this because you have an account on o.company.
                <br />
                <Link href="{{unsubscribe_url}}" style={{ color: COLORS.cream2 }}>Manage notifications</Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

// =============================================================================
// Templates
// =============================================================================

export interface InviteProps {
  orgName: string;
  inviterName: string;
  inviteUrl: string;
  expiresInDays: number;
  role: string;
}
export function InviteTemplate({ orgName, inviterName, inviteUrl, expiresInDays, role }: InviteProps) {
  return (
    <Email preview={`${inviterName} invited you to ${orgName}`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 16px" }}>
        You're invited to {orgName}
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        {inviterName} has invited you to join <strong style={{ color: COLORS.cream }}>{orgName}</strong> as a <strong style={{ color: COLORS.cream }}>{role}</strong>.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link
          href={inviteUrl}
          style={{
            backgroundColor: COLORS.accent,
            color: COLORS.ink,
            padding: "12px 32px",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: "2px",
            display: "inline-block",
          }}
        >
          Accept invitation
        </Link>
      </Section>
      <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: "0" }}>
        This link expires in {expiresInDays} days. If you don't want to join, you can safely ignore this email.
      </Text>
    </Email>
  );
}

export interface InvoiceProps {
  orgName: string;
  invoiceNumber: string;
  amountFormatted: string;
  currency: string;
  dueDate: string;
  lineItems: Array<{ description: string; amount: string }>;
  portalUrl: string;
}
export function InvoiceTemplate({ orgName, invoiceNumber, amountFormatted, currency, dueDate, lineItems, portalUrl }: InvoiceProps) {
  return (
    <Email preview={`Invoice ${invoiceNumber} — ${amountFormatted}`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 16px" }}>
        Invoice {invoiceNumber}
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Here's your invoice from <strong style={{ color: COLORS.cream }}>{orgName}</strong>. Total due: <strong style={{ color: COLORS.cream, fontSize: "20px" }}>{amountFormatted} {currency}</strong> by {dueDate}.
      </Text>
      <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #2A2A33", padding: "20px", borderRadius: "4px", margin: "24px 0" }}>
        {lineItems.map((line, i) => (
          <Section key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < lineItems.length - 1 ? "12px" : 0 }}>
            <Text style={{ color: COLORS.cream, fontSize: "14px", margin: 0 }}>{line.description}</Text>
            <Text style={{ color: COLORS.cream, fontSize: "14px", margin: 0, fontFamily: "monospace" }}>{line.amount}</Text>
          </Section>
        ))}
      </Section>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link
          href={portalUrl}
          style={{
            backgroundColor: COLORS.accent,
            color: COLORS.ink,
            padding: "12px 32px",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: "2px",
            display: "inline-block",
          }}
        >
          View & pay invoice
        </Link>
      </Section>
      <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: 0 }}>
        Pay by card, bank transfer, or crypto. Need help? Reply to this email.
      </Text>
    </Email>
  );
}

export interface InvoiceReminderProps {
  orgName: string;
  invoiceNumber: string;
  amountFormatted: string;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  portalUrl: string;
}
export function InvoiceReminderTemplate({ orgName, invoiceNumber, amountFormatted, currency, dueDate, daysOverdue, portalUrl }: InvoiceReminderProps) {
  return (
    <Email preview={`Invoice ${invoiceNumber} is ${daysOverdue} days overdue`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 16px" }}>
        Invoice {invoiceNumber} is overdue
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Just a reminder that invoice {invoiceNumber} from {orgName} for <strong style={{ color: COLORS.cream }}>{amountFormatted} {currency}</strong> was due {dueDate} and is now {daysOverdue} {daysOverdue === 1 ? "day" : "days"} past due.
      </Text>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        If you've already paid, please ignore this — the payment may not have synced yet.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={portalUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Pay now
        </Link>
      </Section>
    </Email>
  );
}

export interface TicketReplyProps {
  orgName: string;
  ticketSubject: string;
  ticketId: string;
  responderName: string;
  replyBody: string;
  ticketUrl: string;
}
export function TicketReplyTemplate({ orgName, ticketSubject, ticketId, responderName, replyBody, ticketUrl }: TicketReplyProps) {
  return (
    <Email preview={`New reply on ${ticketSubject}`}>
      <Text style={{ color: COLORS.accent, fontSize: "12px", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 16px" }}>
        Ticket #{ticketId.slice(0, 8)}
      </Text>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "28px", margin: "0 0 16px" }}>
        {ticketSubject}
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "14px", margin: "0 0 16px" }}>
        {responderName} from {orgName} replied:
      </Text>
      <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #2A2A33", padding: "20px", borderRadius: "4px", margin: "0 0 24px" }}>
        <Text style={{ color: COLORS.cream, fontSize: "14px", lineHeight: "22px", margin: 0, whiteSpace: "pre-wrap" }}>
          {replyBody}
        </Text>
      </Section>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={ticketUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          View ticket
        </Link>
      </Section>
    </Email>
  );
}

export interface TicketResolvedProps {
  ticketSubject: string;
  ticketId: string;
  ticketUrl: string;
}
export function TicketResolvedTemplate({ ticketSubject, ticketId, ticketUrl }: TicketResolvedProps) {
  return (
    <Email preview={`Your ticket was resolved`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "28px", margin: "0 0 16px" }}>
        Resolved
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Your ticket <strong style={{ color: COLORS.cream }}>#{ticketId.slice(0, 8)}</strong> — "{ticketSubject}" — has been marked resolved. If you need more help, just reply and we'll reopen it.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={ticketUrl} style={{ backgroundColor: COLORS.ink2, color: COLORS.cream, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block", border: "1px solid #2A2A33" }}>
          View ticket
        </Link>
      </Section>
    </Email>
  );
}

export interface MorningBriefingProps {
  date: string;
  orgName: string;
  pipelineOpen: number;
  pipelineOpenFormatted: string;
  overdueInvoicesCount: number;
  overdueInvoicesTotal: string;
  followUpsDue: number;
  todayMeetings: Array<{ time: string; title: string; with: string }>;
  yesterdayWon: number;
  yesterdayWonFormatted: string;
  portalUrl: string;
}
export function MorningBriefingTemplate({ date, orgName, pipelineOpen, pipelineOpenFormatted, overdueInvoicesCount, overdueInvoicesTotal, followUpsDue, todayMeetings, yesterdayWon, yesterdayWonFormatted, portalUrl }: MorningBriefingProps) {
  return (
    <Email preview={`Your morning brief — ${date}`}>
      <Text style={{ color: COLORS.accent, fontSize: "12px", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 8px" }}>
        {date}
      </Text>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 24px" }}>
        Good morning.
      </Heading>

      <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #2A2A33", padding: "20px", borderRadius: "4px", margin: "0 0 16px" }}>
        <Text style={{ color: COLORS.accent, fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 8px" }}>
          Pipeline (open)
        </Text>
        <Text style={{ color: COLORS.cream, fontSize: "28px", fontFamily: "'Instrument Serif', Georgia, serif", margin: "0 0 4px" }}>
          {pipelineOpenFormatted}
        </Text>
        <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: 0 }}>
          across {pipelineOpen} {pipelineOpen === 1 ? "deal" : "deals"}
        </Text>
      </Section>

      {overdueInvoicesCount > 0 && (
        <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #C75F5F40", padding: "20px", borderRadius: "4px", margin: "0 0 16px" }}>
          <Text style={{ color: "#C75F5F", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 8px" }}>
            Overdue
          </Text>
          <Text style={{ color: COLORS.cream, fontSize: "20px", margin: 0 }}>
            {overdueInvoicesCount} {overdueInvoicesCount === 1 ? "invoice" : "invoices"} · {overdueInvoicesTotal}
          </Text>
        </Section>
      )}

      {followUpsDue > 0 && (
        <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #D4A85340", padding: "20px", borderRadius: "4px", margin: "0 0 16px" }}>
          <Text style={{ color: COLORS.accent, fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 8px" }}>
            Follow-ups due
          </Text>
          <Text style={{ color: COLORS.cream, fontSize: "20px", margin: 0 }}>
            {followUpsDue} {followUpsDue === 1 ? "person" : "people"} waiting
          </Text>
        </Section>
      )}

      {todayMeetings.length > 0 && (
        <Section style={{ margin: "0 0 16px" }}>
          <Text style={{ color: COLORS.accent, fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Today
          </Text>
          {todayMeetings.map((m, i) => (
            <Section key={i} style={{ display: "flex", marginBottom: "12px" }}>
              <Text style={{ color: COLORS.cream2, fontSize: "12px", fontFamily: "monospace", margin: 0, minWidth: "60px" }}>
                {m.time}
              </Text>
              <Text style={{ color: COLORS.cream, fontSize: "14px", margin: 0 }}>
                {m.title} <span style={{ color: COLORS.cream2 }}>· with {m.with}</span>
              </Text>
            </Section>
          ))}
        </Section>
      )}

      {yesterdayWon > 0 && (
        <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #7AB87A40", padding: "20px", borderRadius: "4px", margin: "0 0 24px" }}>
          <Text style={{ color: "#7AB87A", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 8px" }}>
            Yesterday
          </Text>
          <Text style={{ color: COLORS.cream, fontSize: "20px", margin: 0 }}>
            {yesterdayWon} {yesterdayWon === 1 ? "win" : "wins"} · {yesterdayWonFormatted}
          </Text>
        </Section>
      )}

      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={portalUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Open dashboard
        </Link>
      </Section>
    </Email>
  );
}

export interface WeeklyDigestProps {
  orgName: string;
  weekOf: string;
  revenueFormatted: string;
  wonCount: number;
  newLeads: number;
  meetingsHeld: number;
  hoursLogged: number;
  invoicesSent: number;
  invoicesPaid: number;
  topContact: { name: string; value: string } | null;
  portalUrl: string;
}
export function WeeklyDigestTemplate(props: WeeklyDigestProps) {
  return (
    <Email preview={`Your week at ${props.orgName}`}>
      <Text style={{ color: COLORS.accent, fontSize: "12px", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 8px" }}>
        Week of {props.weekOf}
      </Text>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 24px" }}>
        Your week.
      </Heading>
      <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #2A2A33", padding: "20px", borderRadius: "4px", margin: "0 0 16px" }}>
        <Text style={{ color: COLORS.cream, fontSize: "36px", fontFamily: "'Instrument Serif', Georgia, serif", margin: 0 }}>
          {props.revenueFormatted}
        </Text>
        <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: "8px 0 0" }}>
          revenue closed · {props.wonCount} {props.wonCount === 1 ? "win" : "wins"}
        </Text>
      </Section>
      <Section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {[
          ["New leads", props.newLeads],
          ["Meetings", props.meetingsHeld],
          ["Hours logged", props.hoursLogged],
          ["Invoices", `${props.invoicesPaid} / ${props.invoicesSent} paid`],
        ].map(([label, value], i) => (
          <Section key={i} style={{ backgroundColor: COLORS.ink2, border: "1px solid #2A2A33", padding: "16px", borderRadius: "4px" }}>
            <Text style={{ color: COLORS.accent, fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 4px" }}>{label}</Text>
            <Text style={{ color: COLORS.cream, fontSize: "20px", margin: 0 }}>{value}</Text>
          </Section>
        ))}
      </Section>
      {props.topContact && (
        <Section style={{ backgroundColor: COLORS.ink2, border: "1px solid #D4A85340", padding: "20px", borderRadius: "4px", margin: "16px 0" }}>
          <Text style={{ color: COLORS.accent, fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 8px" }}>
            Top contact
          </Text>
          <Text style={{ color: COLORS.cream, fontSize: "18px", margin: 0 }}>
            {props.topContact.name} · {props.topContact.value}
          </Text>
        </Section>
      )}
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={props.portalUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Full report
        </Link>
      </Section>
    </Email>
  );
}

export interface PasswordResetProps {
  resetUrl: string;
  expiresInMinutes: number;
}
export function PasswordResetTemplate({ resetUrl, expiresInMinutes }: PasswordResetProps) {
  return (
    <Email preview="Reset your password">
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "28px", margin: "0 0 16px" }}>
        Reset your password
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        We received a request to reset the password for your account. Click the button below to choose a new one. This link expires in {expiresInMinutes} minutes.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={resetUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Reset password
        </Link>
      </Section>
      <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: 0 }}>
        If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
      </Text>
    </Email>
  );
}

export interface EmailVerificationProps {
  verificationUrl: string;
  expiresInMinutes: number;
}
export function EmailVerificationTemplate({ verificationUrl, expiresInMinutes }: EmailVerificationProps) {
  return (
    <Email preview="Verify your email">
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "28px", margin: "0 0 16px" }}>
        Verify your email
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Click the button below to verify this email address and finish setting up your account. The link expires in {expiresInMinutes} minutes.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={verificationUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Verify email
        </Link>
      </Section>
    </Email>
  );
}

export interface PaymentReceivedProps {
  amountUsd: number;
  invoiceNumber: string;
  receiptUrl: string;
  method: "card" | "crypto" | "bank";
}
export function PaymentReceivedTemplate({ amountUsd, invoiceNumber, receiptUrl, method }: PaymentReceivedProps) {
  return (
    <Email preview={`Payment received — $${amountUsd.toFixed(2)}`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 16px" }}>
        Payment received.
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Thank you. We've received your payment of <strong style={{ color: COLORS.cream }}>${amountUsd.toFixed(2)}</strong> for invoice {invoiceNumber}, via {method}.
      </Text>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={receiptUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Download receipt
        </Link>
      </Section>
      <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: 0 }}>
        Need a refund or have a question? Reply to this email and we'll sort it out.
      </Text>
    </Email>
  );
}

export interface WelcomeProps {
  orgName: string;
  firstName: string;
  portalUrl: string;
  tourUrl: string;
}
export function WelcomeTemplate({ orgName, firstName, portalUrl, tourUrl }: WelcomeProps) {
  return (
    <Email preview={`Welcome to ${orgName}`}>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", margin: "0 0 16px" }}>
        Welcome, {firstName}.
      </Heading>
      <Text style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" }}>
        Your {orgName} account is ready. A few things to do first:
      </Text>
      <Section style={{ margin: "0 0 16px" }}>
        {[
          ["1", "Take the 4-minute tour",     "Get oriented.", tourUrl],
          ["2", "Add your first contact",     "Then create a deal.", portalUrl + "/contacts/new"],
          ["3", "Send your first invoice",    "Or schedule a call.", portalUrl + "/invoices/new"],
        ].map(([n, title, body, href], i) => (
          <Section key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: "16px" }}>
            <Text style={{ color: COLORS.accent, fontSize: "14px", fontWeight: 600, margin: "0 12px 0 0", minWidth: "20px" }}>{n}</Text>
            <Section>
              <Text style={{ color: COLORS.cream, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>{title}</Text>
              <Text style={{ color: COLORS.cream2, fontSize: "13px", margin: 0 }}>
                {body} <Link href={href} style={{ color: COLORS.accent }}>Go →</Link>
              </Text>
            </Section>
          </Section>
        ))}
      </Section>
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={portalUrl} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          Open dashboard
        </Link>
      </Section>
    </Email>
  );
}

// =============================================================================
// Operator-drafted email wrappers
// =============================================================================
// These are used for the operator's drafts. They wrap the AI's drafted
// body in a brand-consistent email frame. The "drafted by the operator"
// line tells the recipient the email was AI-assisted (transparency) and
// gives them a way to opt out.

import { marked } from "marked";

export interface OperatorDraftedEmailProps {
  subject: string;
  body: string;             // markdown
  preview: string;          // preheader / preview text (the AI's reasoning)
  draftId: string;          // for tracking
  recipientName?: string;
  senderName?: string;
  optOutUrl?: string;
}

function baseDraftedEmail(props: OperatorDraftedEmailProps, accent: string, ctaLabel: string, ctaHref: string) {
  const html = marked.parse(props.body) as string;
  return (
    <Email preview={props.preview}>
      <Text style={{ color: COLORS.accent, fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 8px" }}>
        Drafted by the operator · {accent}
      </Text>
      <Heading style={{ color: COLORS.cream, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "26px", margin: "0 0 16px" }}>
        {props.subject}
      </Heading>
      <div
        style={{ color: COLORS.cream2, fontSize: "15px", lineHeight: "24px" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Link href={ctaHref} style={{ backgroundColor: COLORS.accent, color: COLORS.ink, padding: "12px 32px", fontSize: "14px", fontWeight: 600, textDecoration: "none", borderRadius: "2px", display: "inline-block" }}>
          {ctaLabel}
        </Link>
      </Section>
      {props.optOutUrl && (
        <Text style={{ color: COLORS.cream3, fontSize: "11px", textAlign: "center", margin: "16px 0 0" }}>
          This message was drafted by an AI operator. <Link href={props.optOutUrl} style={{ color: COLORS.cream3, textDecoration: "underline" }}>Opt out of AI-drafted messages</Link>.
        </Text>
      )}
    </Email>
  );
}

export interface MorningBriefingEmailProps extends OperatorDraftedEmailProps {}
export function MorningBriefingEmail(props: MorningBriefingEmailProps) {
  return baseDraftedEmail(props, "morning brief", "Open dashboard", props.optOutUrl ?? "https://app.o.company");
}

export interface DealFollowupEmailProps extends OperatorDraftedEmailProps {}
export function DealFollowupEmail(props: DealFollowupEmailProps) {
  return baseDraftedEmail(props, "follow-up draft", "View in CRM", props.optOutUrl ?? "https://app.o.company/deals");
}

export interface InvoiceReminderEmailProps extends OperatorDraftedEmailProps {}
export function InvoiceReminderEmail(props: InvoiceReminderEmailProps) {
  return baseDraftedEmail(props, "invoice reminder", "Pay invoice", props.optOutUrl ?? "https://app.o.company/invoices");
}

export interface PhotoReadyEmailProps extends OperatorDraftedEmailProps {}
export function PhotoReadyEmail(props: PhotoReadyEmailProps) {
  return baseDraftedEmail(props, "photos ready", "View variations", props.optOutUrl ?? "https://app.o.company/photos");
}

export interface LeadReengagementEmailProps extends OperatorDraftedEmailProps {}
export function LeadReengagementEmail(props: LeadReengagementEmailProps) {
  return baseDraftedEmail(props, "check-in", "Reply", props.optOutUrl ?? "https://app.o.company/contacts");
}

export interface ProjectKickoffEmailProps extends OperatorDraftedEmailProps {}
export function ProjectKickoffEmail(props: ProjectKickoffEmailProps) {
  return baseDraftedEmail(props, "project kickoff", "View project", props.optOutUrl ?? "https://app.o.company/projects");
}

export interface ProjectCloseoutEmailProps extends OperatorDraftedEmailProps {}
export function ProjectCloseoutEmail(props: ProjectCloseoutEmailProps) {
  return baseDraftedEmail(props, "project wrap-up", "View project", props.optOutUrl ?? "https://app.o.company/projects");
}

export interface WeeklyClientDigestEmailProps extends OperatorDraftedEmailProps {}
export function WeeklyClientDigestEmail(props: WeeklyClientDigestEmailProps) {
  return baseDraftedEmail(props, "weekly digest", "View portal", props.optOutUrl ?? "https://app.o.company");
}

// =============================================================================
// Template registry
// =============================================================================

export const TEMPLATES = {
  invite:            InviteTemplate,
  invoice:           InvoiceTemplate,
  invoice_reminder:  InvoiceReminderTemplate,
  ticket_reply:      TicketReplyTemplate,
  ticket_resolved:   TicketResolvedTemplate,
  morning_briefing:  MorningBriefingTemplate,
  weekly_digest:     WeeklyDigestTemplate,
  password_reset:    PasswordResetTemplate,
  email_verification: EmailVerificationTemplate,
  payment_received:  PaymentReceivedTemplate,
  welcome:           WelcomeTemplate,
  // Operator-drafted wrappers
  operator_morning_briefing: MorningBriefingEmail,
  operator_deal_followup:     DealFollowupEmail,
  operator_invoice_reminder:  InvoiceReminderEmail,
  operator_photo_ready:       PhotoReadyEmail,
  operator_lead_reengagement: LeadReengagementEmail,
  operator_project_kickoff:   ProjectKickoffEmail,
  operator_project_closeout:  ProjectCloseoutEmail,
  operator_weekly_digest:     WeeklyClientDigestEmail,
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateProps<T extends TemplateName> = Parameters<(typeof TEMPLATES)[T]>[0];

/** Render a template to HTML. */
export async function renderTemplate<T extends TemplateName>(
  name: T,
  props: TemplateProps<T>,
): Promise<string> {
  const Component = TEMPLATES[name] as React.ComponentType<TemplateProps<T>>;
  return render(<Component {...props} />);
}

// =============================================================================
// o.company · API catch-all
// =============================================================================
// Every API route is a Next.js Route Handler. The withAuth middleware wraps
// each one to handle auth, errors, and metrics. This catch-all makes it
// easy to add a new route: drop a file in `routes/`, add a `export const X`
// here, done.

export { POST_register, POST_login, POST_refresh, POST_logout, GET_me, POST_forgot, POST_reset, POST_verify_email } from "./auth";
export { GET_org, PATCH_org, POST_transfer_ownership, GET_people, POST_invite, GET_person, PATCH_person, POST_role, DELETE_person } from "./people";
export { GET_companies, POST_companies, GET_company, PATCH_company, DELETE_company, GET_contacts, POST_contacts, GET_contact, PATCH_contact, DELETE_contact, GET_deals, POST_deals, GET_deal, PATCH_deal, DELETE_deal } from "./crm";
export { GET_projects, POST_projects, GET_project, PATCH_project, DELETE_project, POST_milestone, PATCH_milestone, GET_time, POST_time, DELETE_time } from "./projects";
export { GET_invoices, POST_invoices, GET_invoice, POST_invoice_send, POST_invoice_pay_stripe, POST_invoice_pay_crypto, POST_stripe_webhook } from "./invoices";
export { GET_tickets, POST_tickets, GET_ticket, POST_ticket_reply, POST_ticket_resolve } from "./tickets";
export { uploadUrl, createJob, listJobs, getJob, updateStatus, listPresets } from "./photos";
export { listOperatorDrafts, getOperatorDraft, approveOperatorDraft, rejectOperatorDraft, skipOperatorDraft, operatorStats, tickOperator } from "./operator";
export { getBrief, getUnread, markRead, archiveEntry, markAllRead, testFire } from "./brief";
export { POST_checkout } from "./checkout";
export { POST_refund, POST_portal } from "./payments";
export { DELETE_gdpr, GET_export } from "./gdpr";
export { GET_audit_log, GET_audit_event } from "./audit";
export { POST_lead_form_submit } from "./lead-forms";

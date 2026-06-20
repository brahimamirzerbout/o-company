// Catch-all that dispatches any /api/* route to the corresponding handler.
// We use a single file so route registration is grep-able. Every route
// method is in routes/index.ts; we re-export by path here.

import { type NextRequest } from "next/server";
import * as routes from "./routes";

// Whitelist of (path, method) → handler
const TABLE: Record<string, keyof typeof routes> = {
  "POST /api/auth/register":         "POST_register",
  "POST /api/auth/login":            "POST_login",
  "POST /api/auth/refresh":          "POST_refresh",
  "POST /api/auth/logout":           "POST_logout",
  "POST /api/auth/forgot":           "POST_forgot",
  "POST /api/auth/reset":            "POST_reset",
  "POST /api/auth/verify-email":     "POST_verify_email",
  "GET  /api/auth/me":               "GET_me",
  "GET  /api/org":                   "GET_org",
  "PATCH /api/org":                  "PATCH_org",
  "POST /api/org/transfer-ownership":"POST_transfer_ownership",
  "GET  /api/people":                "GET_people",
  "POST /api/people/invite":         "POST_invite",
  "GET  /api/companies":             "GET_companies",
  "POST /api/companies":             "POST_companies",
  "GET  /api/contacts":              "GET_contacts",
  "POST /api/contacts":              "POST_contacts",
  "GET  /api/deals":                 "GET_deals",
  "POST /api/deals":                 "POST_deals",
  "GET  /api/projects":              "GET_projects",
  "POST /api/projects":              "POST_projects",
  "GET  /api/time":                  "GET_time",
  "POST /api/time":                  "POST_time",
  "GET  /api/invoices":              "GET_invoices",
  "POST /api/invoices":              "POST_invoices",
  "GET  /api/tickets":               "GET_tickets",
  "POST /api/tickets":               "POST_tickets",
};

const ID_TAIL: Record<string, { method: string; handler: keyof typeof routes }> = {
  "GET  /api/people":          { method: "GET",    handler: "GET_person" },
  "PATCH /api/people":         { method: "PATCH",  handler: "PATCH_person" },
  "DELETE /api/people":        { method: "DELETE", handler: "DELETE_person" },
  "POST /api/people/role":     { method: "POST",   handler: "POST_role" },
  "GET  /api/companies":       { method: "GET",    handler: "GET_company" },
  "PATCH /api/companies":      { method: "PATCH",  handler: "PATCH_company" },
  "DELETE /api/companies":     { method: "DELETE", handler: "DELETE_company" },
  "GET  /api/contacts":        { method: "GET",    handler: "GET_contact" },
  "PATCH /api/contacts":       { method: "PATCH",  handler: "PATCH_contact" },
  "DELETE /api/contacts":      { method: "DELETE", handler: "DELETE_contact" },
  "GET  /api/deals":           { method: "GET",    handler: "GET_deal" },
  "PATCH /api/deals":          { method: "PATCH",  handler: "PATCH_deal" },
  "DELETE /api/deals":         { method: "DELETE", handler: "DELETE_deal" },
  "GET  /api/projects":        { method: "GET",    handler: "GET_project" },
  "PATCH /api/projects":       { method: "PATCH",  handler: "PATCH_project" },
  "DELETE /api/projects":      { method: "DELETE", handler: "DELETE_project" },
  "POST /api/projects/milestone": { method: "POST", handler: "POST_milestone" },
  "PATCH /api/milestones":     { method: "PATCH",  handler: "PATCH_milestone" },
  "DELETE /api/time":          { method: "DELETE", handler: "DELETE_time" },
  "GET  /api/invoices":        { method: "GET",    handler: "GET_invoice" },
  "POST /api/invoices/send":   { method: "POST",   handler: "POST_invoice_send" },
  "POST /api/invoices/pay/stripe": { method: "POST", handler: "POST_invoice_pay_stripe" },
  "POST /api/invoices/pay/crypto": { method: "POST", handler: "POST_invoice_pay_crypto" },
  "POST /api/webhooks/stripe":  { method: "POST",   handler: "POST_stripe_webhook" },
  "GET  /api/tickets":         { method: "GET",    handler: "GET_ticket" },
  "POST /api/tickets/reply":   { method: "POST",   handler: "POST_ticket_reply" },
  "POST /api/tickets/resolve": { method: "POST",   handler: "POST_ticket_resolve" },
};

export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return dispatch("GET", req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return dispatch("POST", req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return dispatch("PUT", req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return dispatch("PATCH", req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  return dispatch("DELETE", req, ctx);
}

async function dispatch(method: string, req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const params = await ctx.params;
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  // Health check
  if (segments.length === 2 && segments[0] === "api" && segments[1] === "health") {
    return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), { headers: { "content-type": "application/json" } });
  }
  // Try exact match
  const key = `${method} ${req.nextUrl.pathname}`;
  const exact = TABLE[key] ?? ID_TAIL[key];
  if (exact) {
    const fn = routes[exact] as unknown;
    return (fn as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(req, { params: Promise.resolve(params) });
  }
  // Try ID-tail match — /api/<resource>/:id or /api/<resource>/:id/<sub>
  // We need to find a table key where the static segments match and any
  // segment that looks like an id is replaced by :id.
  // For simplicity, scan the table and match by removing the id segment.
  for (const [k, handler] of Object.entries({ ...TABLE, ...ID_TAIL })) {
    const [kMethod, kPath] = k.split(" ");
    if (kMethod !== method) continue;
    const kSegs = kPath.split("/").filter(Boolean);
    if (kSegs.length !== segments.length) continue;
    let matches = true;
    for (let i = 0; i < kSegs.length; i++) {
      if (kSegs[i].startsWith(":")) continue;
      if (kSegs[i] !== segments[i]) { matches = false; break; }
    }
    if (matches) {
      const fn = routes[handler] as unknown;
      return (fn as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(req, { params: Promise.resolve(params) });
    }
  }
  return new Response(JSON.stringify({ error: { code: "RES_001", message: "Not found" } }), { status: 404, headers: { "content-type": "application/json" } });
}

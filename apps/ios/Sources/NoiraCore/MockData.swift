import Foundation

// =============================================================================
// Mock data (dev mode)
// =============================================================================
// Used when there's no authenticated session. Mirrors the structure of the
// real API responses so the UI looks and behaves the same.
//
// PRODUCTION GUARD: this file is only compiled into DEBUG builds. The
// `LoginView` wraps the "use mock session" button in `#if DEBUG` so the
// entry point is gone. To be doubly safe, the call sites in `MockData.*`
// functions are not exposed; the view models decide whether to call them
// based on `APIClient.shared.isAuthenticated`.
//
// If you find yourself importing `MockData` outside of a view model's
// "if !isAuthenticated" branch, you're shipping dev data to production.
// Don't.

public enum MockData {
    public static func briefFeed() -> [BriefGroup] {
        [
            BriefGroup(
                day: "2026-06-20",
                label: "Today",
                entries: [
                    BriefEntry(id: "brf_001", contactId: "c1", kind: "photo_ready", priority: .normal,
                               title: "Photos ready: brand-shoot-04.jpg",
                               summary: "Your 8 variations are ready. Cropped, color-graded, and upscaled. View and download the ones you want — they'll stay in your gallery for 90 days.",
                               actionLabel: "View variations", actionHref: "/photos", readAt: nil,
                               createdAt: "2026-06-20T14:32:00Z"),
                    BriefEntry(id: "brf_002", contactId: "c1", kind: "invoice_sent", priority: .normal,
                               title: "Invoice INV-2026-022 · $31,000",
                               summary: "Invoice for the Brightline analytics engagement was sent. Net 30, due July 12. Pay from your portal or reply if anything's off.",
                               actionLabel: "View invoice", actionHref: "/invoices", readAt: nil,
                               createdAt: "2026-06-20T11:15:00Z"),
                    BriefEntry(id: "brf_003", contactId: "c1", kind: "milestone_complete", priority: .high,
                               title: "Done: Helios lead-form v1",
                               summary: "The first version of the lead-form is live in staging. Next: review and approve, then we move it to production.",
                               actionLabel: "Review", actionHref: "/projects", readAt: nil,
                               createdAt: "2026-06-20T09:48:00Z"),
                ]
            ),
            BriefGroup(
                day: "2026-06-19",
                label: "Yesterday",
                entries: [
                    BriefEntry(id: "brf_004", contactId: "c1", kind: "time_logged", priority: .low,
                               title: "Work on Northwind website refresh",
                               summary: "2.5 hours on the hero section. Wireframes ready, design pass starting tomorrow.",
                               actionLabel: "View project", actionHref: "/projects", readAt: "2026-06-19T18:00:00Z",
                               createdAt: "2026-06-19T17:20:00Z"),
                    BriefEntry(id: "brf_005", contactId: "c1", kind: "message_received", priority: .normal,
                               title: "Reply from Priya (Helios)",
                               summary: "Priya confirmed the SOW for Phase 2. She wants to start next Monday. Reply with any questions or approve to lock the timeline.",
                               actionLabel: "Open thread", actionHref: "/messages", readAt: "2026-06-19T15:42:00Z",
                               createdAt: "2026-06-19T15:30:00Z"),
                ]
            ),
            BriefGroup(
                day: "2026-06-18",
                label: "Wednesday",
                entries: [
                    BriefEntry(id: "brf_006", contactId: "c1", kind: "file_shared", priority: .normal,
                               title: "New file: brand-kit-final.zip",
                               summary: "Updated brand kit with the new wordmark and color tokens. 12 MB.",
                               actionLabel: "Download", actionHref: "/files", readAt: "2026-06-18T16:00:00Z",
                               createdAt: "2026-06-18T15:45:00Z"),
                ]
            ),
            BriefGroup(
                day: "2026-06-17",
                label: "Tuesday",
                entries: [
                    BriefEntry(id: "brf_007", contactId: "c1", kind: "invoice_paid", priority: .low,
                               title: "Paid · INV-2026-020 · $12,000",
                               summary: "Payment received. Receipt is in your portal. Thanks.",
                               actionLabel: "Download receipt", actionHref: "/invoices", readAt: "2026-06-17T10:00:00Z",
                               createdAt: "2026-06-17T09:18:00Z"),
                ]
            ),
        ]
    }

    public static func photoJobs() -> [PhotoJob] {
        [
            PhotoJob(id: "phj_001", orgId: "org1", originalUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
                     filename: "portrait-04.jpg", contentType: "image/jpeg", sizeBytes: 2400000,
                     requestedVariations: ["crop-square", "color-noira"], status: .ready, totalCostUsd: 0.12,
                     caption: "Quanta brand photos", createdAt: "2026-06-20T14:30:00Z", finishedAt: "2026-06-20T14:30:25Z"),
            PhotoJob(id: "phj_002", orgId: "org1", originalUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
                     filename: "headshot-12.jpg", contentType: "image/jpeg", sizeBytes: 3200000,
                     requestedVariations: ["crop-square", "crop-portrait", "color-noira", "no-bg"], status: .ready, totalCostUsd: 0.22,
                     caption: "Team headshots", createdAt: "2026-06-19T11:00:00Z", finishedAt: "2026-06-19T11:00:18Z"),
            PhotoJob(id: "phj_003", orgId: "org1", originalUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
                     filename: "headshot-11.jpg", contentType: "image/jpeg", sizeBytes: 2900000,
                     requestedVariations: ["crop-portrait", "color-noira"], status: .ready, totalCostUsd: 0.12,
                     caption: nil, createdAt: "2026-06-19T10:30:00Z", finishedAt: "2026-06-19T10:30:15Z"),
            PhotoJob(id: "phj_004", orgId: "org1", originalUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400",
                     filename: "headshot-10.jpg", contentType: "image/jpeg", sizeBytes: 3100000,
                     requestedVariations: ["no-bg", "upscaled-2x", "color-noira"], status: .ready, totalCostUsd: 0.22,
                     caption: "Product shots", createdAt: "2026-06-18T16:00:00Z", finishedAt: "2026-06-18T16:00:30Z"),
        ]
    }

    public static func operatorDrafts() -> [OperatorDraft] {
        [
            OperatorDraft(id: "opd_001", orgId: "org1", kind: .morningBriefing, channel: .email, status: .pending,
                          subjectType: "org", subjectId: "org1", title: "Morning brief · Thursday, June 20",
                          body: "**3 things need your attention today.**\n\n1. Polaris proposal — 4 days stale. No reply since last Friday.\n2. Helios SOW — awaiting your signature.\n3. Northwind renewal — Marcus said 'let's get this over the line' on Tuesday.",
                          reasoning: "Daily 6am briefing. Always runs unless explicitly disabled.",
                          modelUsed: "gpt-4o", costUsd: 0.014, createdAt: "2026-06-20T06:00:00Z"),
            OperatorDraft(id: "opd_002", orgId: "org1", kind: .dealFollowupDraft, channel: .email, status: .pending,
                          subjectType: "deal", subjectId: "dl_15", title: "Follow-up: Northwind renewal",
                          body: "Hi Marcus,\n\nWanted to follow up on the renewal paperwork before it slips through the cracks. The SOW hasn't changed since Tuesday — are we good to sign?\n\nO'Shay",
                          reasoning: "Deal has been in 'negotiation' for 4 days with no activity. Tone: gentle.",
                          modelUsed: "gpt-4o-mini", costUsd: 0.002, createdAt: "2026-06-20T08:00:00Z"),
            OperatorDraft(id: "opd_003", orgId: "org1", kind: .invoiceReminder, channel: .email, status: .pending,
                          subjectType: "invoice", subjectId: "inv_018", title: "Reminder: INV-2026-018",
                          body: "Hi Jonas,\n\nFriendly reminder that invoice INV-2026-018 ($4,200, due June 13) is now a week past due.\n\nO'Shay",
                          reasoning: "Invoice 7 days overdue. First reminder — friendly tone.",
                          modelUsed: "gpt-4o-mini", costUsd: 0.001, createdAt: "2026-06-20T10:00:00Z"),
        ]
    }
}

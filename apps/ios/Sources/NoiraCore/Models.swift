import Foundation

// =============================================================================
// Domain models
// =============================================================================
// These mirror the @o/types TypeScript definitions. The shapes are kept
// identical so the iOS app can deserialize any /api/* response without
// translation. Codable is used throughout; the iOS app never constructs
// these from scratch except in mock-data dev mode.

public struct Person: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let email: String
    public let name: String
    public let role: Role
    public let department: String?
    public let status: Status

    public enum Role: String, Codable, Sendable {
        case owner, admin, manager, `operator`, client, guest
    }

    public enum Status: String, Codable, Sendable {
        case active, invited, suspended, onLeave = "on_leave", deactivated
    }

    enum CodingKeys: String, CodingKey {
        case id, orgId = "org_id", email, name, role, department, status
    }
}

public struct Org: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let subdomain: String
    public let defaultCurrency: String
    public let defaultTimezone: String

    enum CodingKeys: String, CodingKey {
        case id, name, subdomain
        case defaultCurrency = "default_currency"
        case defaultTimezone = "default_timezone"
    }
}

public struct Contact: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let firstName: String
    public let lastName: String
    public let email: String
    public let phone: String?
    public let companyId: String?
    public let companyName: String?
    public let title: String?
    public let status: String
    public let lifecycle: String
    public let leadScore: Int?
    public let leadTier: String?
    public let lastContactedAt: String?

    public var fullName: String { "\(firstName) \(lastName)" }
    public var initials: String {
        let f = firstName.first.map(String.init) ?? ""
        let l = lastName.first.map(String.init) ?? ""
        return f + l
    }

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case email, phone
        case companyId = "company_id"
        case companyName = "company_name"
        case title, status, lifecycle
        case leadScore = "lead_score"
        case leadTier = "lead_tier"
        case lastContactedAt = "last_contacted_at"
    }
}

public struct Deal: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let name: String
    public let contactId: String?
    public let companyId: String?
    public let ownerId: String?
    public let stage: Stage
    public let amount: Double
    public let currency: String
    public let probability: Double
    public let status: String
    public let lastActivityAt: String?
    public let createdAt: String

    public enum Stage: String, Codable, Sendable {
        case lead, qualified, proposal, negotiation, won, lost
    }

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case name
        case contactId = "contact_id"
        case companyId = "company_id"
        case ownerId = "owner_id"
        case stage, amount, currency, probability, status
        case lastActivityAt = "last_activity_at"
        case createdAt = "created_at"
    }
}

public struct Invoice: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let number: String
    public let contactId: String?
    public let contactName: String?
    public let projectId: String?
    public let amount: Double
    public let currency: String
    public let status: Status
    public let dueDate: String
    public let sentAt: String?
    public let paidAt: String?

    public enum Status: String, Codable, Sendable {
        case draft, sent, viewed, partial, paid, overdue, void, uncollectible
    }

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case number
        case contactId = "contact_id"
        case contactName = "contact_name"
        case projectId = "project_id"
        case amount, currency, status
        case dueDate = "due_date"
        case sentAt = "sent_at"
        case paidAt = "paid_at"
    }
}

public struct Project: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let name: String
    public let clientId: String?
    public let clientName: String?
    public let status: String
    public let value: Double
    public let currency: String
    public let dueDate: String?

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case name
        case clientId = "client_id"
        case clientName = "client_name"
        case status, value, currency
        case dueDate = "due_date"
    }
}

// MARK: - Photo pipeline

public struct PhotoJob: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let originalUrl: String
    public let filename: String
    public let contentType: String
    public let sizeBytes: Int
    public let requestedVariations: [String]
    public let status: Status
    public let totalCostUsd: Double
    public let caption: String?
    public let createdAt: String
    public let finishedAt: String?

    public enum Status: String, Codable, Sendable {
        case queued, processing, ready, failed, canceled
    }

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case originalUrl = "original_url"
        case filename
        case contentType = "content_type"
        case sizeBytes = "size_bytes"
        case requestedVariations = "requested_variations"
        case status
        case totalCostUsd = "total_cost_usd"
        case caption
        case createdAt = "created_at"
        case finishedAt = "finished_at"
    }
}

public struct PhotoVariation: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let jobId: String
    public let kind: String
    public let url: String?
    public let sizeBytes: Int?
    public let width: Int?
    public let height: Int?
    public let costUsd: Double?
    public let error: String?

    enum CodingKeys: String, CodingKey {
        case id
        case jobId = "job_id"
        case kind, url
        case sizeBytes = "size_bytes"
        case width, height
        case costUsd = "cost_usd"
        case error
    }
}

// MARK: - Operator drafts

public struct OperatorDraft: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let orgId: String
    public let kind: Kind
    public let channel: Channel
    public let status: Status
    public let subjectType: String
    public let subjectId: String
    public let title: String
    public let body: String
    public let reasoning: String
    public let modelUsed: String
    public let costUsd: Double
    public let createdAt: String

    public enum Kind: String, Codable, Sendable {
        case morningBriefing = "morning_briefing"
        case dealFollowupDraft = "deal_followup_draft"
        case leadScore = "lead_score"
        case invoiceReminder = "invoice_reminder"
        case photoProgressPing = "photo_progress_ping"
    }

    public enum Channel: String, Codable, Sendable {
        case email, sms, inApp = "in_app", task, score, route
    }

    public enum Status: String, Codable, Sendable {
        case pending, approved, edited, rejected, sent, skipped, failed
    }

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case kind, channel, status
        case subjectType = "subject_type"
        case subjectId = "subject_id"
        case title, body, reasoning
        case modelUsed = "model_used"
        case costUsd = "cost_usd"
        case createdAt = "created_at"
    }
}

// MARK: - Brief inbox

public struct BriefEntry: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let contactId: String
    public let kind: String
    public let priority: Priority
    public let title: String
    public let summary: String
    public let actionLabel: String?
    public let actionHref: String?
    public let readAt: String?
    public let createdAt: String

    public enum Priority: String, Codable, Sendable {
        case low, normal, high, urgent
    }

    enum CodingKeys: String, CodingKey {
        case id
        case contactId = "contact_id"
        case kind, priority, title, summary
        case actionLabel = "action_label"
        case actionHref = "action_href"
        case readAt = "read_at"
        case createdAt = "created_at"
    }
}

public struct BriefFeed: Codable, Sendable {
    public let feed: [BriefGroup]
    public let unreadCount: Int

    enum CodingKeys: String, CodingKey {
        case feed
        case unreadCount = "unread_count"
    }
}

public struct BriefGroup: Codable, Identifiable, Hashable, Sendable {
    public var id: String { day }
    public let day: String
    public let label: String
    public let entries: [BriefEntry]
}

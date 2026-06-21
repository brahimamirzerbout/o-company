import SwiftUI

// =============================================================================
// Brief inbox (client-facing)
// =============================================================================
// Day-grouped feed. Today, Yesterday, weekday, date. Each entry has a
// summary, a CTA, an unread dot. The "Message us" button is always at
// the bottom.

public struct BriefInboxView: View {
    @StateObject private var viewModel = BriefInboxViewModel()

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                content
            }
            .navigationTitle("Your brief")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.markAllRead() }
                    } label: {
                        Image(systemName: "checkmark.circle")
                            .foregroundColor(Tokens.gold)
                    }
                    .disabled(viewModel.unreadCount == 0)
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.feed.isEmpty {
            VStack { ProgressView().tint(Tokens.gold) }
        } else if viewModel.feed.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: "tray")
                    .font(.system(size: 32))
                    .foregroundColor(Tokens.cream3)
                Text("Inbox zero.")
                    .font(Type.serif(20))
                    .foregroundColor(Tokens.cream)
                Text("New updates will appear here as they happen.")
                    .font(Type.sans(13))
                    .foregroundColor(Tokens.cream3)
            }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if viewModel.unreadCount > 0 {
                        Text("\(viewModel.unreadCount) new \(viewModel.unreadCount == 1 ? "update" : "updates")")
                            .font(Type.sans(13))
                            .foregroundColor(Tokens.cream2)
                    }
                    ForEach(viewModel.feed) { group in
                        DayGroupView(group: group) { entry in
                            Task { await viewModel.markRead(entry) }
                        }
                    }
                    TalkToUsCard()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
            }
        }
    }
}

struct DayGroupView: View {
    let group: BriefGroup
    let onTap: (BriefEntry) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(group.label.uppercased())
                    .font(Type.sans(11, weight: .medium))
                    .tracking(2)
                    .foregroundColor(Tokens.gold)
                Text(group.day)
                    .font(Type.mono(11))
                    .foregroundColor(Tokens.cream3)
                Rectangle()
                    .fill(Tokens.ink3)
                    .frame(height: 1)
            }
            ForEach(group.entries) { entry in
                BriefEntryCard(entry: entry, onTap: { onTap(entry) })
            }
        }
    }
}

struct BriefEntryCard: View {
    let entry: BriefEntry
    let onTap: () -> Void
    private var isUnread: Bool { entry.readAt == nil }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Pill(entry.kind.replacingOccurrences(of: "_", with: " ").capitalized,
                         tone: toneFor(kind: entry.kind),
                         icon: iconFor(kind: entry.kind))
                    if entry.priority == .urgent {
                        Pill("Urgent", tone: .danger)
                    } else if entry.priority == .high {
                        Pill("High", tone: .warning)
                    }
                    if isUnread { Spacer(); Circle().fill(Tokens.gold).frame(width: 6, height: 6) }
                }
                Text(entry.title)
                    .font(Type.serif(17))
                    .foregroundColor(isUnread ? Tokens.cream : Tokens.cream2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(entry.summary)
                    .font(Type.sans(13))
                    .foregroundColor(Tokens.cream3)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let label = entry.actionLabel, let href = entry.actionHref {
                    NavigationLink(destination: ActionDestination(href: href)) {
                        HStack(spacing: 4) {
                            Text(label)
                            Image(systemName: "arrow.right")
                        }
                        .font(Type.sans(13, weight: .medium))
                        .foregroundColor(Tokens.gold)
                    }
                }
            }
            .padding(14)
            .background(isUnread ? Tokens.goldSoft : Tokens.ink2)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(isUnread ? Tokens.gold.opacity(0.3) : Tokens.ink3, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func toneFor(kind: String) -> Pill.Tone {
        switch kind {
        case "photo_ready", "invoice_paid", "milestone_complete", "project_completed":
            return .success
        case "invoice_sent", "milestone_started", "message_received":
            return .info
        case "invoice_overdue":
            return .danger
        case "project_started":
            return .accent
        default:
            return .neutral
        }
    }

    private func iconFor(kind: String) -> String {
        switch kind {
        case "photo_ready":        return "photo"
        case "invoice_sent":       return "doc.text"
        case "invoice_paid":       return "checkmark.seal"
        case "invoice_overdue":    return "exclamationmark.triangle"
        case "milestone_complete": return "checkmark.circle"
        case "milestone_started":  return "play.circle"
        case "file_shared":        return "paperclip"
        case "time_logged":        return "clock"
        case "message_received":   return "envelope"
        case "project_started":    return "sparkles"
        case "project_completed":  return "flag.checkered"
        default:                   return "bell"
        }
    }
}

struct TalkToUsCard: View {
    var body: some View {
        Card {
            HStack(spacing: 12) {
                Image(systemName: "envelope")
                    .foregroundColor(Tokens.gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Need something else?")
                        .font(Type.sans(14, weight: .medium))
                        .foregroundColor(Tokens.cream)
                    Text("The operator replies within 1 business hour.")
                        .font(Type.sans(11))
                        .foregroundColor(Tokens.cream3)
                }
                Spacer()
            }
        }
    }
}

struct ActionDestination: View {
    let href: String
    var body: some View {
        ZStack {
            Tokens.ink.ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 32))
                    .foregroundColor(Tokens.gold)
                Text(href)
                    .font(Type.mono(13))
                    .foregroundColor(Tokens.cream2)
                Text("Deep links open in the web app for now.")
                    .font(Type.sans(12))
                    .foregroundColor(Tokens.cream3)
            }
        }
        .navigationTitle("Open")
    }
}

// =============================================================================
// View model
// =============================================================================
// Loads the brief from the API, falls back to mock data in dev mode.
// Tracks read state and exposes a method to mark entries read.

@MainActor
public final class BriefInboxViewModel: ObservableObject {
    @Published public var feed: [BriefGroup] = []
    @Published public var unreadCount: Int = 0
    @Published public var isLoading: Bool = false

    public init() {}

    public func load() async {
        isLoading = true
        defer { isLoading = false }

        // If we have an authenticated session, hit the real API.
        if await APIClient.shared.isAuthenticated {
            do {
                let res = try await APIClient.shared.getBrief()
                self.feed = res.feed
                self.unreadCount = res.unreadCount
                return
            } catch {
                // Fall through to mock on error
            }
        }

        // Mock data (dev mode)
        try? await Task.sleep(nanoseconds: 300_000_000)
        self.feed = MockData.briefFeed()
        self.unreadCount = self.feed.flatMap(\.entries).filter { $0.readAt == nil }.count
    }

    public func markRead(_ entry: BriefEntry) async {
        if await APIClient.shared.isAuthenticated {
            try? await APIClient.shared.markBriefEntryRead(id: entry.id)
        }
        // Update local state
        let now = ISO8601DateFormatter().string(from: Date())
        self.feed = self.feed.map { group in
            BriefGroup(
                day: group.day,
                label: group.label,
                entries: group.entries.map { e in
                    e.id == entry.id ? BriefEntry(
                        id: e.id, contactId: e.contactId, kind: e.kind, priority: e.priority,
                        title: e.title, summary: e.summary, actionLabel: e.actionLabel,
                        actionHref: e.actionHref, readAt: e.readAt ?? now, createdAt: e.createdAt
                    ) : e
                }
            )
        }
        self.unreadCount = self.feed.flatMap(\.entries).filter { $0.readAt == nil }.count
    }

    public func markAllRead() async {
        if await APIClient.shared.isAuthenticated {
            try? await APIClient.shared.markAllBriefRead()
        }
        let now = ISO8601DateFormatter().string(from: Date())
        self.feed = self.feed.map { group in
            BriefGroup(
                day: group.day,
                label: group.label,
                entries: group.entries.map { e in
                    BriefEntry(
                        id: e.id, contactId: e.contactId, kind: e.kind, priority: e.priority,
                        title: e.title, summary: e.summary, actionLabel: e.actionLabel,
                        actionHref: e.actionHref, readAt: e.readAt ?? now, createdAt: e.createdAt
                    )
                }
            )
        }
        self.unreadCount = 0
    }
}

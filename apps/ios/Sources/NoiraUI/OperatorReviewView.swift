import SwiftUI

// =============================================================================
// Operator review (staff-facing)
// =============================================================================
// The drafts the AI has produced, awaiting O'Shay's review. Each card
// shows the AI's reasoning and the drafted body. Approve / Edit / Reject.

public struct OperatorReviewView: View {
    @StateObject private var viewModel = OperatorReviewViewModel()
    @State private var selectedDraft: OperatorDraft?

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                content
            }
            .navigationTitle("Operator")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundColor(Tokens.gold)
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(item: $selectedDraft) { draft in
            DraftDetailView(draft: draft) { action in
                Task {
                    await viewModel.act(on: draft, action: action)
                    selectedDraft = nil
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            statsStrip
            if viewModel.pending.isEmpty {
                Spacer()
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 32))
                        .foregroundColor(Tokens.success)
                    Text("Inbox zero.")
                        .font(Type.serif(22))
                        .foregroundColor(Tokens.cream)
                    Text("No drafts waiting. New ones will appear here.")
                        .font(Type.sans(13))
                        .foregroundColor(Tokens.cream3)
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.pending) { draft in
                            DraftRowCard(draft: draft)
                                .onTapGesture { selectedDraft = draft }
                        }
                    }
                    .padding(16)
                }
            }
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 8) {
            StatTile(label: "Pending", value: "\(viewModel.stats.counts?.pending ?? viewModel.pending.count)")
            StatTile(label: "Sent (7d)", value: "\(viewModel.stats.thisWeek ?? 0)")
            StatTile(label: "AI cost", value: String(format: "$%.3f", viewModel.stats.totalCostUsd ?? 0))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

struct DraftRowCard: View {
    let draft: OperatorDraft

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Pill(kindLabel, tone: toneFor(kind: draft.kind), icon: iconFor(kind: draft.kind))
                    Spacer()
                    Text("$\(draft.costUsd, specifier: "%.4f")")
                        .font(Type.mono(10))
                        .foregroundColor(Tokens.cream3)
                }
                Text(draft.title)
                    .font(Type.serif(16))
                    .foregroundColor(Tokens.cream)
                Text(draft.reasoning)
                    .font(Type.sans(12))
                    .foregroundColor(Tokens.cream3)
                    .lineLimit(2)
                    .lineSpacing(2)
            }
        }
    }

    private var kindLabel: String {
        switch draft.kind {
        case .morningBriefing:    return "Morning brief"
        case .dealFollowupDraft:  return "Deal follow-up"
        case .leadScore:          return "Lead score"
        case .invoiceReminder:    return "Invoice reminder"
        case .photoProgressPing:  return "Photos ready"
        }
    }
    private func toneFor(kind: OperatorDraft.Kind) -> Pill.Tone {
        switch kind {
        case .morningBriefing:    return .accent
        case .dealFollowupDraft:  return .info
        case .leadScore:          return .neutral
        case .invoiceReminder:    return .warning
        case .photoProgressPing:  return .success
        }
    }
    private func iconFor(kind: OperatorDraft.Kind) -> String {
        switch kind {
        case .morningBriefing:    return "sun.horizon"
        case .dealFollowupDraft:  return "arrow.up.right"
        case .leadScore:          return "person.crop.circle"
        case .invoiceReminder:    return "doc.text"
        case .photoProgressPing:  return "photo"
        }
    }
}

struct DraftDetailView: View {
    let draft: OperatorDraft
    let onAct: (DraftAction) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var isRejecting = false
    @State private var rejectReason = ""

    enum DraftAction {
        case approve, reject(String)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Reasoning
                        VStack(alignment: .leading, spacing: 6) {
                            Text("WHY THE OPERATOR DRAFTED THIS")
                                .font(Type.sans(10, weight: .medium))
                                .tracking(1.5)
                                .foregroundColor(Tokens.gold)
                            Text(draft.reasoning)
                                .font(Type.sans(13))
                                .foregroundColor(Tokens.cream2)
                                .lineSpacing(3)
                        }
                        .padding(12)
                        .background(Tokens.ink3.opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 4))

                        // Body
                        VStack(alignment: .leading, spacing: 6) {
                            Text("DRAFTED BODY")
                                .font(Type.sans(10, weight: .medium))
                                .tracking(1.5)
                                .foregroundColor(Tokens.cream3)
                            Text(draft.body)
                                .font(Type.sans(14))
                                .foregroundColor(Tokens.cream)
                                .lineSpacing(4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(14)
                        .background(Tokens.ink2)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4).stroke(Tokens.ink3, lineWidth: 1)
                        )

                        if isRejecting {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("REASON")
                                    .font(Type.sans(10, weight: .medium))
                                    .tracking(1.5)
                                    .foregroundColor(Tokens.danger)
                                NoiraField(title: "", text: $rejectReason, placeholder: "Why reject? (the operator learns)")
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle(draft.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                        .foregroundColor(Tokens.cream3)
                }
            }
            .safeAreaInset(edge: .bottom) {
                if isRejecting {
                    HStack(spacing: 8) {
                        GhostButton("Cancel", icon: nil) { isRejecting = false }
                        PrimaryButton("Confirm reject", icon: "xmark", disabled: rejectReason.isEmpty) {
                            onAct(.reject(rejectReason))
                        }
                    }
                    .padding(16)
                    .background(Tokens.ink2)
                } else {
                    HStack(spacing: 8) {
                        GhostButton("Reject", icon: "xmark") { isRejecting = true }
                        PrimaryButton("Approve & send", icon: "paperplane") {
                            onAct(.approve)
                        }
                    }
                    .padding(16)
                    .background(Tokens.ink2)
                }
            }
        }
    }
}

@MainActor
public final class OperatorReviewViewModel: ObservableObject {
    @Published public var pending: [OperatorDraft] = []
    @Published public var stats: OperatorStats?
    @Published public var isLoading: Bool = false

    public init() {}

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        if await APIClient.shared.isAuthenticated {
            if let real = try? await APIClient.shared.listOperatorDrafts(status: "pending") {
                self.pending = real
            }
            if let s = try? await APIClient.shared.getOperatorStats() {
                self.stats = s
            }
            return
        }
        // Mock
        self.pending = MockData.operatorDrafts()
    }

    public func act(on draft: OperatorDraft, action: DraftDetailView.DraftAction) async {
        if await APIClient.shared.isAuthenticated {
            switch action {
            case .approve:
                _ = try? await APIClient.shared.approveOperatorDraft(id: draft.id)
            case .reject(let reason):
                _ = try? await APIClient.shared.rejectOperatorDraft(id: draft.id, reason: reason)
            }
        }
        self.pending.removeAll { $0.id == draft.id }
    }
}

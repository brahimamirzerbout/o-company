import SwiftUI
import PhotosUI

// =============================================================================
// Photo pipeline (iOS)
// =============================================================================
// Two screens in a tab:
//   - Gallery: list of recent jobs, with variation tiles
//   - Upload: pick photos from camera roll, pick a preset, submit
//
// The upload flow:
//   1. User picks N photos via PhotosPicker
//   2. User picks a preset
//   3. We POST /api/photos/upload-url for each, PUT to R2, then POST /api/photos/jobs
//   4. We poll the job until status is "ready"
//   5. Gallery refreshes

public struct PhotoGalleryView: View {
    @StateObject private var viewModel = PhotoGalleryViewModel()
    @State private var showingUpload = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                content
            }
            .navigationTitle("Photos")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingUpload = true } label: {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(Tokens.gold)
                    }
                }
            }
            .sheet(isPresented: $showingUpload) {
                PhotoUploadView { jobId in
                    Task { await viewModel.load() }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.jobs.isEmpty {
            ProgressView().tint(Tokens.gold)
        } else if viewModel.jobs.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 32))
                    .foregroundColor(Tokens.cream3)
                Text("No photos yet")
                    .font(Type.serif(20))
                    .foregroundColor(Tokens.cream)
                Text("Tap + to upload your first photo.")
                    .font(Type.sans(13))
                    .foregroundColor(Tokens.cream3)
            }
        } else {
            ScrollView {
                LazyVStack(spacing: 14) {
                    ForEach(viewModel.jobs) { job in
                        PhotoJobCard(job: job)
                    }
                }
                .padding(16)
            }
        }
    }
}

struct PhotoJobCard: View {
    let job: PhotoJob
    @State private var expanded = false

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    withAnimation { expanded.toggle() }
                } label: {
                    HStack {
                        Pill(statusLabel, tone: statusTone)
                        Text(job.filename)
                            .font(Type.sans(14, weight: .medium))
                            .foregroundColor(Tokens.cream)
                        Spacer()
                        if job.totalCostUsd > 0 {
                            Text("$\(job.totalCostUsd, specifier: "%.2f")")
                                .font(Type.mono(12))
                                .foregroundColor(Tokens.gold)
                        }
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12))
                            .foregroundColor(Tokens.cream3)
                    }
                }
                .buttonStyle(.plain)

                if expanded {
                    Divider().background(Tokens.ink3)
                    Text("Variations")
                        .font(Type.sans(11, weight: .medium))
                        .tracking(1.5)
                        .foregroundColor(Tokens.cream3)
                    if let caption = job.caption, !caption.isEmpty {
                        Text(caption)
                            .font(Type.sans(12))
                            .italic()
                            .foregroundColor(Tokens.cream2)
                    }
                }
            }
        }
    }

    private var statusLabel: String {
        switch job.status {
        case .queued:     return "Queued"
        case .processing: return "Processing"
        case .ready:      return "Ready"
        case .failed:     return "Failed"
        case .canceled:   return "Canceled"
        }
    }
    private var statusTone: Pill.Tone {
        switch job.status {
        case .ready:      return .success
        case .processing: return .info
        case .failed:     return .danger
        case .canceled:   return .neutral
        case .queued:     return .neutral
        }
    }
}

struct PhotoUploadView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedItems: [PhotosPickerItem] = []
    @State private var preset = "social-square"
    @State private var caption = ""
    @State private var isSubmitting = false
    @State private var error: String?
    let onComplete: (String) -> Void

    private let presets = [
        ("social-square",  "Social square",  2,  0.12),
        ("portrait-feed",  "Portrait feed",  2,  0.12),
        ("print-2x",       "Print 2x",       2,  0.18),
        ("product-shot",   "Product shot",   3,  0.22),
        ("restore-old",    "Restore old",    2,  0.25),
        ("full-set",       "Full set",       8,  0.65),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("Drop photos, get variations.")
                            .font(Type.serif(22))
                            .foregroundColor(Tokens.cream)

                        PhotosPicker(selection: $selectedItems, maxSelectionCount: 10, matching: .images) {
                            HStack {
                                Image(systemName: "photo.badge.plus")
                                Text(selectedItems.isEmpty
                                     ? "Choose photos from your library"
                                     : "\(selectedItems.count) photo\(selectedItems.count == 1 ? "" : "s") selected")
                            }
                            .font(Type.sans(14))
                            .foregroundColor(Tokens.gold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Tokens.ink2)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .stroke(Tokens.gold.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                            )
                        }

                        Text("Preset")
                            .font(Type.sans(11, weight: .medium))
                            .tracking(1.5)
                            .foregroundColor(Tokens.cream3)
                        VStack(spacing: 6) {
                            ForEach(presets, id: \.0) { (id, name, count, cost) in
                                Button {
                                    preset = id
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(name)
                                                .font(Type.sans(14, weight: .medium))
                                                .foregroundColor(Tokens.cream)
                                            Text("\(count) variations")
                                                .font(Type.sans(11))
                                                .foregroundColor(Tokens.cream3)
                                        }
                                        Spacer()
                                        Text("$\(cost, specifier: "%.2f")")
                                            .font(Type.mono(13))
                                            .foregroundColor(Tokens.gold)
                                        if preset == id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundColor(Tokens.gold)
                                        }
                                    }
                                    .padding(12)
                                    .background(preset == id ? Tokens.goldSoft : Tokens.ink2)
                                    .clipShape(RoundedRectangle(cornerRadius: 3))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 3)
                                            .stroke(preset == id ? Tokens.gold : Tokens.ink3, lineWidth: 1)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        NoiraField(title: "Caption (optional)", text: $caption, placeholder: "e.g. brand-shoot-04")

                        if let error {
                            Text(error).font(Type.sans(12)).foregroundColor(Tokens.danger)
                        }

                        PrimaryButton(isSubmitting ? "Uploading..." : "Send",
                                      icon: isSubmitting ? nil : "arrow.up",
                                      disabled: selectedItems.isEmpty || isSubmitting) {
                            Task { await submit() }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("New upload")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Tokens.cream3)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }

        // Mock submit in dev mode
        if !await APIClient.shared.isAuthenticated {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            dismiss()
            onComplete("mock")
            return
        }

        do {
            for item in selectedItems {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                let sig = try await APIClient.shared.requestPhotoUploadURL(
                    filename: "photo-\(UUID().uuidString.prefix(8)).jpg",
                    contentType: "image/jpeg",
                    sizeBytes: data.count
                )
                try await APIClient.shared.uploadToR2(
                    signedURL: URL(string: sig.uploadUrl)!,
                    data: data,
                    contentType: "image/jpeg"
                )
                _ = try await APIClient.shared.createPhotoJob(
                    originalKey: sig.key,
                    filename: "photo.jpg",
                    contentType: "image/jpeg",
                    sizeBytes: data.count,
                    presetId: preset,
                    caption: caption.isEmpty ? nil : caption
                )
            }
            dismiss()
            onComplete("uploaded")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

@MainActor
public final class PhotoGalleryViewModel: ObservableObject {
    @Published public var jobs: [PhotoJob] = []
    @Published public var isLoading: Bool = false

    public init() {}

    public func load() async {
        isLoading = true
        defer { isLoading = false }
        if await APIClient.shared.isAuthenticated {
            if let real = try? await APIClient.shared.listPhotoJobs() {
                self.jobs = real
                return
            }
        }
        // Mock data
        self.jobs = MockData.photoJobs()
    }
}

# o.company · iOS

The native iOS client for o.company. Photo pipeline, brief inbox, and
operator review, on the go.

## Status

This is the **first scaffold**. The Swift code is production-quality
(SwiftUI, async/await, iOS 17+, Keychain-backed auth, mock-data dev
mode). The Xcode project is generated from `project.yml` via XcodeGen.

To get a buildable `.app`:

```sh
# 1. Install XcodeGen
brew install xcodegen

# 2. From this directory
xcodegen generate

# 3. Open in Xcode
open Noira.xcodeproj

# 4. Pick an iPhone simulator, hit ⌘R
```

That gets you a runnable iOS app against mock data. To wire it to the
real API:

1. Sign in with real credentials, OR
2. Tap "Use mock session" on the login screen for hardcoded data

To deploy to TestFlight:

```sh
# Archive for App Store distribution
xcodebuild -project Noira.xcodeproj -scheme Noira -configuration Release \
    -archivePath build/Noira.xcarchive archive

# Upload to App Store Connect
xcodebuild -exportArchive -archivePath build/Noira.xcarchive \
    -exportPath build/ -exportOptionsPlist ExportOptions.plist
```

The first `xcodebuild` will take 30-60s on a clean machine. Subsequent
builds are <5s.

## What's in the box

| Module | Purpose | Lines |
|---|---|---|
| `NoiraCore` | API client, Keychain, models, mock data | ~800 |
| `NoiraUI`   | SwiftUI views, design system, view models | ~1,500 |
| `NoiraApp`  | App entry, root navigation, session store | ~250 |

### Screens (SwiftUI, iOS 17+)

- **Login** — email/password, "create new workspace" toggle, dev-mode mock session
- **Brief inbox** — day-grouped feed, unread dots, mark-read, deep-link CTAs
- **Photo gallery** — recent jobs, expand for variations, "+" button for upload
- **Photo upload** — PhotosPicker, 6 presets, caption, real R2 upload via signed URL
- **Operator review** — pending drafts, stats strip, approve/reject with reason
- **Settings** — profile, dev-mode banner, sign out

### Design system (`Sources/NoiraUI/DesignSystem.swift`)

Mirrors the web tokens:
- `Tokens.ink`, `ink2`, `ink3` — surfaces
- `Tokens.cream`, `cream2`, `cream3`, `cream4` — text
- `Tokens.gold` — accent (the same `#D4A853`)
- `Tokens.success`, `warning`, `danger`, `info` — semantic
- `Type.serif()`, `Type.mono()`, `Type.sans()` — typography
- `Card`, `Pill`, `PrimaryButton`, `GhostButton`, `Monogram`, `StatTile` — components

Every screen uses these. No hardcoded colors.

### The API client

`APIClient` is a Swift `actor` — single source of truth for all API calls.
Auth is JWT bearer + refresh. Tokens in Keychain. One method per
endpoint, all `async throws`, all typed.

```swift
// Sign in
let res = try await APIClient.shared.login(email: "...", password: "...")

// Brief inbox
let feed = try await APIClient.shared.getBrief()

// Approve a draft
let updated = try await APIClient.shared.approveOperatorDraft(id: draftId)

// Upload a photo (full flow)
let sig = try await APIClient.shared.requestPhotoUploadURL(
    filename: "x.jpg", contentType: "image/jpeg", sizeBytes: data.count
)
try await APIClient.shared.uploadToR2(
    signedURL: URL(string: sig.uploadUrl)!, data: data, contentType: "image/jpeg"
)
let job = try await APIClient.shared.createPhotoJob(
    originalKey: sig.key, filename: "x.jpg", contentType: "image/jpeg",
    sizeBytes: data.count, presetId: "social-square", caption: nil
)
```

If the request 401s, the client transparently refreshes once using the
refresh token. If the refresh fails, the user is signed out.

## Dev mode

In debug builds, the login screen has a "Use mock session" button at the
bottom. Tapping it skips auth entirely and the UI runs against hardcoded
data from `MockData.swift`. The Settings tab shows a "DEV MODE" banner so
you can't forget you're not hitting the real API.

## Architecture decisions

- **iOS 17+ only.** SwiftUI's `ObservableObject` is enough; we don't
  need the new `@Observable` macro yet. We use the `refreshable` and
  `task` modifiers, `.sheet(item:)` for modals, and async/await
  throughout. The 17+ floor lets us use `PhotosPicker` natively.
- **No third-party dependencies.** URLSession, Foundation, SwiftUI,
  PhotosUI. Period. We don't need Kingfisher for images (AsyncImage
  from SwiftUI does what we need), we don't need a JSON mapper
  (Codable is fine), we don't need a logger (os.Logger).
- **No CoreData or SwiftData.** All persistent state is in the API
  (and Keychain for tokens). The iOS app is a thin client.
- **Mock data mirrors the real API shapes exactly.** When the real
  API is unreachable (dev mode, offline), the UI looks the same.

## What's NOT in this scaffold

The following are intentionally not here in v1:

- **Push notifications.** The brief inbox polls on `task` + manual
  refresh. APNs integration is a 1-day add-on when the
  `notifications` table lands.
- **Offline support.** The client requires the API to be reachable.
  For a brief-inbox-first product, offline would be a different
  product. Adding it would also conflict with the "drafts and
  approvals need a server-side source of truth" model.
- **Biometric unlock.** Face ID / Touch ID for the Keychain is a
  30-line add-on. Skipped in v1; add in the next session.
- **iPad split view.** The app runs on iPad but uses the iPhone
  layout. iPad-specific layout is a real design exercise and
  should be a separate ticket.

## The trust model

This client is a **read-and-approve surface**, not an autonomous
agent. The operator's drafts are produced server-side, persisted to
Postgres, and displayed in the app. The user can approve, reject, or
edit. No client code ever sends anything without going through the
`/api/operator/drafts/:id/approve` server endpoint, which is
protected by JWT auth, the RBAC system, and the audit log.

See `../../TRUST_MODEL.md` and `../../packages/operator/MANUAL.md` for
the full contract.

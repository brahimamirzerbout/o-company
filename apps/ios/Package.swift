// swift-tools-version: 5.9
// =============================================================================
// o.company · iOS
// =============================================================================
// Native iOS client. SwiftUI, iOS 17+, async/await throughout. Uses the
// same /api/* endpoints as the web and Android clients.
//
// This Package.swift makes the project buildable from the command line via
// `swift build` (limited — UI doesn't run without an iOS simulator) and
// makes the modules re-usable in a full Xcode app target.
//
// For the full app, use the Xcode project at apps/ios/Noira.xcodeproj —
// which references this package and adds the iOS app target with its
// Info.plist, asset catalog, and launch screen.

import PackageDescription

let package = Package(
    name: "Noira",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "NoiraCore", targets: ["NoiraCore"]),
        .library(name: "NoiraUI", targets: ["NoiraUI"]),
        .library(name: "NoiraApp", targets: ["NoiraApp"]),
    ],
    targets: [
        // Core: API client, auth, models, persistence
        .target(
            name: "NoiraCore",
            dependencies: [],
            path: "Sources/NoiraCore"
        ),

        // UI: SwiftUI views, view models, navigation
        .target(
            name: "NoiraUI",
            dependencies: ["NoiraCore"],
            path: "Sources/NoiraUI"
        ),

        // App: the @main entry, app shell, root navigation
        .target(
            name: "NoiraApp",
            dependencies: ["NoiraCore", "NoiraUI"],
            path: "Sources/NoiraApp"
        ),

        // Tests
        .testTarget(
            name: "NoiraCoreTests",
            dependencies: ["NoiraCore"],
            path: "Tests/NoiraCoreTests"
        ),
    ]
)

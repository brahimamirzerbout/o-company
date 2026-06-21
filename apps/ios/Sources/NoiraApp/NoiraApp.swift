import SwiftUI

// =============================================================================
// o.company · iOS app entry
// =============================================================================
// @main App struct. Decides between the login flow and the main tabbed
// shell. The shell is the same for staff and clients in v1 — both see
// the same tabs. The "Operator" tab is staff-only and shows an empty
// state for clients (or could be hidden entirely in a future build).

@main
public struct NoiraApp: App {
    @StateObject private var session = SessionStore()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(.dark)
                .tint(Tokens.gold)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        if session.isAuthenticated {
            MainTabsView()
        } else {
            LoginView()
        }
    }
}

struct MainTabsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var selection = 0

    var body: some View {
        TabView(selection: $selection) {
            BriefInboxView()
                .tabItem {
                    Label("Brief", systemImage: "tray.full")
                }
                .badge(session.isMockMode ? 3 : 0)
                .tag(0)

            PhotoGalleryView()
                .tabItem {
                    Label("Photos", systemImage: "photo.on.rectangle")
                }
                .tag(1)

            if session.person?.role != .client {
                OperatorReviewView()
                    .tabItem {
                        Label("Operator", systemImage: "sparkles")
                    }
                    .badge(session.isMockMode ? 3 : 0)
                    .tag(2)
            }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        NavigationStack {
            ZStack {
                Tokens.ink.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let person = session.person {
                            Card {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 12) {
                                        Monogram(person.name, size: 48)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(person.name)
                                                .font(Type.serif(18))
                                                .foregroundColor(Tokens.cream)
                                            Text(person.email)
                                                .font(Type.sans(12))
                                                .foregroundColor(Tokens.cream3)
                                        }
                                    }
                                    Divider().background(Tokens.ink3)
                                    HStack {
                                        Text("Role")
                                            .font(Type.sans(12))
                                            .foregroundColor(Tokens.cream3)
                                        Spacer()
                                        Text(person.role.rawValue.capitalized)
                                            .font(Type.sans(12, weight: .medium))
                                            .foregroundColor(Tokens.gold)
                                    }
                                    if let org = session.org {
                                        HStack {
                                            Text("Workspace")
                                                .font(Type.sans(12))
                                                .foregroundColor(Tokens.cream3)
                                            Spacer()
                                            Text(org.name)
                                                .font(Type.sans(12, weight: .medium))
                                                .foregroundColor(Tokens.cream)
                                        }
                                    }
                                }
                            }
                        }

                        if session.isMockMode {
                            Card {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("DEV MODE")
                                        .font(Type.sans(10, weight: .bold))
                                        .tracking(1.5)
                                        .foregroundColor(Tokens.warning)
                                    Text("You're running against hardcoded data. No API calls are being made. Sign out and use real credentials to hit the backend.")
                                        .font(Type.sans(12))
                                        .foregroundColor(Tokens.cream2)
                                }
                            }
                        }

                        Card {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("App")
                                    .font(Type.sans(11, weight: .medium))
                                    .tracking(1.5)
                                    .foregroundColor(Tokens.cream3)
                                    .padding(.bottom, 8)
                                row("Version", "1.0.0 (1)")
                                row("Build", AppConfig.environment)
                                row("API", AppConfig.apiBaseURL.absoluteString)
                            }
                        }

                        PrimaryButton("Sign out", icon: "arrow.right.square", disabled: false) {
                            Task { await session.signOut() }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(Type.sans(12)).foregroundColor(Tokens.cream3)
            Spacer()
            Text(value).font(Type.mono(11)).foregroundColor(Tokens.cream2)
        }
        .padding(.vertical, 4)
    }
}

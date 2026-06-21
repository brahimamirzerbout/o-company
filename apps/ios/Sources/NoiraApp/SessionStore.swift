import SwiftUI

// =============================================================================
// Session store
// =============================================================================
// The single source of truth for "is the user signed in?" Drives the
// root view switch. In real mode, it holds the Person + Org. In mock
// mode, it holds nothing and the UI uses hardcoded data.

@MainActor
public final class SessionStore: ObservableObject {
    @Published public var isAuthenticated: Bool = false
    @Published public var person: Person?
    @Published public var org: Org?
    @Published public var isMockMode: Bool = false

    public init() {
        // Restore from Keychain on launch
        if KeychainStore.shared.get(.accessToken) != nil {
            self.isAuthenticated = true
        }
    }

    public func refresh() async {
        if await APIClient.shared.isAuthenticated {
            do {
                let me: AuthResponse = try await APIClient.shared.request("GET", "/api/auth/me")
                self.person = me.person
                self.org = me.org
                self.isAuthenticated = true
            } catch {
                // Token invalid; clear
                await APIClient.shared.logout()
                self.isAuthenticated = false
            }
        }
    }

    public func signOut() async {
        await APIClient.shared.logout()
        self.isAuthenticated = false
        self.isMockMode = false
        self.person = nil
        self.org = nil
    }

    /// Dev-mode entry. Skips auth entirely; the UI uses mock data.
    public func useMockSession() {
        self.isAuthenticated = true
        self.isMockMode = true
        self.person = Person(
            id: "person_1", orgId: "org_1",
            email: "oshay@o.company", name: "O'Shay Lighten",
            role: .owner, department: "Operations", status: .active
        )
        self.org = Org(
            id: "org_1", name: "o.company", subdomain: "o",
            defaultCurrency: "USD", defaultTimezone: "America/Chicago"
        )
    }
}

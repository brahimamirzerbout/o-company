import SwiftUI

// =============================================================================
// Login screen
// =============================================================================
// Sign-in. The first thing the user sees. Three fields (email, password,
// optional "create new org" toggle that adds org_name and name), one
// primary action, the brand mark at the top, dev-mode "use mock session"
// button at the bottom for when the API isn't reachable.

public struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var orgName = ""
    @State private var isCreatingOrg = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @EnvironmentObject private var session: SessionStore

    public init() {}

    public var body: some View {
        ZStack {
            Tokens.ink.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Spacer().frame(height: 60)

                    // Brand mark
                    HStack(spacing: 10) {
                        LogoMark(size: 36)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Noira")
                                .font(Type.serif(22, weight: .semibold))
                                .foregroundColor(Tokens.cream)
                            Text("o.company")
                                .font(Type.sans(10, weight: .medium))
                                .tracking(1.5)
                                .foregroundColor(Tokens.cream3)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(isCreatingOrg ? "Create your workspace" : "Sign in")
                            .font(Type.serif(28))
                            .foregroundColor(Tokens.cream)
                        Text(isCreatingOrg
                             ? "Start a 30-day trial. No card required."
                             : "Your business, operated.")
                            .font(Type.sans(14))
                            .foregroundColor(Tokens.cream2)
                    }

                    VStack(spacing: 12) {
                        if isCreatingOrg {
                            NoiraField(title: "Your name", text: $name, contentType: .name)
                            NoiraField(title: "Workspace name", text: $orgName, placeholder: "e.g. Lighten Co.")
                        }
                        NoiraField(title: "Email", text: $email, contentType: .emailAddress, keyboard: .emailAddress)
                        NoiraField(title: "Password", text: $password, contentType: .password, secure: true)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(Type.sans(12))
                            .foregroundColor(Tokens.danger)
                    }

                    PrimaryButton(isCreatingOrg ? "Create workspace" : "Sign in",
                                  icon: isCreatingOrg ? "arrow.right" : nil,
                                  disabled: !isValid || isSubmitting) {
                        Task { await submit() }
                    }

                    Button(isCreatingOrg ? "I already have a workspace" : "Create new workspace") {
                        withAnimation { isCreatingOrg.toggle() }
                    }
                    .font(Type.sans(13))
                    .foregroundColor(Tokens.gold)
                    .frame(maxWidth: .infinity)

                    #if DEBUG
                    Divider().background(Tokens.ink3).padding(.vertical, 8)
                    GhostButton("Use mock session (dev mode)", icon: "hammer") {
                        session.useMockSession()
                    }
                    Text("In dev mode, the app runs against hardcoded data. No backend required.")
                        .font(Type.sans(10))
                        .foregroundColor(Tokens.cream3)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    #endif
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
    }

    private var isValid: Bool {
        if isCreatingOrg {
            return !email.isEmpty && !password.isEmpty && !name.isEmpty && !orgName.isEmpty
        }
        return !email.isEmpty && !password.isEmpty
    }

    private func submit() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            if isCreatingOrg {
                _ = try await APIClient.shared.register(email: email, password: password, name: name, orgName: orgName)
            } else {
                _ = try await APIClient.shared.login(email: email, password: password)
            }
            await session.refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

public struct NoiraField: View {
    public let title: String
    @Binding public var text: String
    public var placeholder: String = ""
    public var contentType: UITextContentType?
    public var keyboard: UIKeyboardType = .default
    public var secure: Bool = false

    public init(title: String, text: Binding<String>, placeholder: String = "", contentType: UITextContentType? = nil, keyboard: UIKeyboardType = .default, secure: Bool = false) {
        self.title = title
        self._text = text
        self.placeholder = placeholder
        self.contentType = contentType
        self.keyboard = keyboard
        self.secure = secure
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(Type.sans(11, weight: .medium))
                .tracking(1.2)
                .foregroundColor(Tokens.cream3)
            Group {
                if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)
            .keyboardType(keyboard)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .font(Type.sans(15))
            .foregroundColor(Tokens.cream)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(Tokens.ink2)
            .overlay(
                RoundedRectangle(cornerRadius: 3).stroke(Tokens.ink3, lineWidth: 1)
            )
        }
    }
}

public struct LogoMark: View {
    public let size: CGFloat
    public init(size: CGFloat = 32) { self.size = size }
    public var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.18)
                .fill(Tokens.gold)
                .frame(width: size, height: size)
            Text("o.")
                .font(Type.serif(size * 0.45, weight: .semibold))
                .foregroundColor(Tokens.ink)
        }
    }
}

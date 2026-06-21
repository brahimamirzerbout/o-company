import Foundation

// =============================================================================
// Configuration
// =============================================================================
// Where the API lives. In dev, this is `http://localhost:4000`. In prod,
// it's the deployed API base URL (Vercel, Railway, Fly — wherever it lands).
//
// Override at launch with `--api https://api.o.company` for TestFlight builds
// pointing at staging, etc.

public enum AppConfig {
    public static let apiBaseURL: URL = {
        if let override = ProcessInfo.processInfo.environment["NOIRA_API_URL"],
           let url = URL(string: override) {
            return url
        }
        if let arg = CommandLine.arguments.dropFirst().first(where: { $0.hasPrefix("--api=") }) {
            let value = String(arg.dropFirst("--api=".count))
            if let url = URL(string: value) { return url }
        }
        // Default to localhost for development
        return URL(string: "http://localhost:4000")!
    }()

    public static let appName = "Noira"
    public static let appVersion: String = {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }()
    public static let buildNumber: String = {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }()

    /// The build environment. "debug" in dev, "release" in TestFlight/App Store.
    public static let environment: String = {
        #if DEBUG
        return "debug"
        #else
        return "release"
        #endif
    }()
}

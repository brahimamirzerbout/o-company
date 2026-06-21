import Foundation

// =============================================================================
// API client
// =============================================================================
// Thin async/await wrapper over the /api/* endpoints. One method per route.
// Auth is JWT bearer; tokens are stored in the Keychain. The client
// transparently refreshes expired access tokens using the refresh token.

public actor APIClient {
    public static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var accessToken: String?
    private var refreshToken: String?
    private var refreshTask: Task<String, Error>?

    public init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // MARK: - Auth

    public func login(email: String, password: String) async throws -> AuthResponse {
        let body = ["email": email, "password": password]
        let res: AuthResponse = try await request("POST", "/api/auth/login", body: body, authenticated: false)
        try await storeTokens(access: res.accessToken, refresh: res.refreshToken)
        return res
    }

    public func logout() async {
        if let _ = accessToken {
            _ = try? await requestVoid("POST", "/api/auth/logout", body: [:])
        }
        accessToken = nil
        refreshToken = nil
        try? KeychainStore.shared.deleteAll()
    }

    public func register(email: String, password: String, name: String, orgName: String) async throws -> AuthResponse {
        let body: [String: String] = [
            "email": email,
            "password": password,
            "name": name,
            "org_name": orgName,
        ]
        let res: AuthResponse = try await request("POST", "/api/auth/register", body: body, authenticated: false)
        try await storeTokens(access: res.accessToken, refresh: res.refreshToken)
        return res
    }

    public var isAuthenticated: Bool { accessToken != nil }

    // MARK: - Photos

    public func listPhotoJobs() async throws -> [PhotoJob] {
        let res: ListResponse<PhotoJob> = try await request("GET", "/api/photos/jobs")
        return res.items
    }

    public func getPhotoJob(id: String) async throws -> (PhotoJob, [PhotoVariation]) {
        struct R: Decodable { let job: PhotoJob; let variations: [PhotoVariation] }
        return try await request("GET", "/api/photos/jobs/\(id)")
    }

    public func requestPhotoUploadURL(filename: String, contentType: String, sizeBytes: Int) async throws -> UploadURLResponse {
        let body: [String: Any] = [
            "filename": filename,
            "contentType": contentType,
            "sizeBytes": sizeBytes,
        ]
        return try await request("POST", "/api/photos/upload-url", body: body)
    }

    public func createPhotoJob(originalKey: String, filename: String, contentType: String, sizeBytes: Int, presetId: String, caption: String?) async throws -> CreateJobResponse {
        var body: [String: Any] = [
            "originalKey": originalKey,
            "filename": filename,
            "contentType": contentType,
            "sizeBytes": sizeBytes,
            "presetId": presetId,
        ]
        if let caption { body["caption"] = caption }
        return try await request("POST", "/api/photos/jobs", body: body)
    }

    /// Direct upload to R2 via the signed URL.
    public func uploadToR2(signedURL: URL, data: Data, contentType: String) async throws {
        var req = URLRequest(url: signedURL)
        req.httpMethod = "PUT"
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.uploadFailed
        }
    }

    // MARK: - Brief inbox

    public func getBrief() async throws -> BriefFeed {
        try await request("GET", "/api/brief")
    }

    public func getUnreadCount() async throws -> Int {
        struct R: Decodable { let unread: Int }
        let r: R = try await request("GET", "/api/brief/unread")
        return r.unread
    }

    public func markBriefEntryRead(id: String) async throws {
        _ = try await requestVoid("POST", "/api/brief/entry/\(id)/read", body: [:])
    }

    public func markAllBriefRead() async throws {
        _ = try await requestVoid("POST", "/api/brief/mark-all-read", body: [:])
    }

    // MARK: - Operator (drafts)

    public func listOperatorDrafts(status: String? = nil) async throws -> [OperatorDraft] {
        var path = "/api/operator/drafts"
        if let status { path += "?status=\(status)" }
        let res: ListResponse<OperatorDraft> = try await request("GET", path)
        return res.items
    }

    public func approveOperatorDraft(id: String, editedBody: String? = nil) async throws -> OperatorDraft {
        var body: [String: Any] = [:]
        if let editedBody { body["editedBody"] = editedBody }
        struct R: Decodable { let draft: OperatorDraft }
        let r: R = try await request("POST", "/api/operator/drafts/\(id)/approve", body: body)
        return r.draft
    }

    public func rejectOperatorDraft(id: String, reason: String) async throws -> OperatorDraft {
        let body: [String: String] = ["reason": reason]
        struct R: Decodable { let draft: OperatorDraft }
        let r: R = try await request("POST", "/api/operator/drafts/\(id)/reject", body: body)
        return r.draft
    }

    public func getOperatorStats() async throws -> OperatorStats {
        try await request("GET", "/api/operator/stats")
    }

    // MARK: - Core request methods

    private func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: Any]? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        let data = try await performRequest(method, path, body: body, authenticated: authenticated)
        return try decoder.decode(T.self, from: data)
    }

    private func requestVoid(_ method: String, _ path: String, body: [String: Any]? = nil, authenticated: Bool = true) async throws {
        _ = try await performRequest(method, path, body: body, authenticated: authenticated)
    }

    private func performRequest(
        _ method: String,
        _ path: String,
        body: [String: Any]?,
        authenticated: Bool,
        isRetry: Bool = false
    ) async throws -> Data {
        var url = AppConfig.apiBaseURL
        url.append(path: path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("Noira-iOS/\(AppConfig.appVersion)", forHTTPHeaderField: "User-Agent")

        if authenticated, let token = accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        // 401: try to refresh once
        if http.statusCode == 401, authenticated, refreshToken != nil, !isRetry {
            do {
                _ = try await refreshAccessToken()
                return try await performRequest(method, path, body: body, authenticated: authenticated, isRetry: true)
            } catch {
                throw APIError.unauthorized
            }
        }

        guard 200..<300 ~= http.statusCode else {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error.message
                ?? "HTTP \(http.statusCode)"
            throw APIError.serverError(status: http.statusCode, message: message)
        }

        return data
    }

    private func refreshAccessToken() async throws -> String {
        if let task = refreshTask {
            return try await task.value
        }
        let task = Task<String, Error> {
            defer { self.refreshTask = nil }
            guard let refresh = self.refreshToken else { throw APIError.unauthorized }
            var req = URLRequest(url: AppConfig.apiBaseURL.appending(path: "/api/auth/refresh"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(refresh)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                throw APIError.unauthorized
            }
            let res = try JSONDecoder().decode(RefreshResponse.self, from: data)
            self.accessToken = res.accessToken
            try KeychainStore.shared.set(res.accessToken, for: .accessToken)
            return res.accessToken
        }
        self.refreshTask = task
        return try await task.value
    }

    private func storeTokens(access: String, refresh: String) async throws {
        accessToken = access
        refreshToken = refresh
        try KeychainStore.shared.set(access, for: .accessToken)
        try KeychainStore.shared.set(refresh, for: .refreshToken)
    }
}

// MARK: - Response types

public struct AuthResponse: Decodable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let person: Person
    public let org: Org

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case person, org
    }
}

public struct RefreshResponse: Decodable, Sendable {
    public let accessToken: String
    enum CodingKeys: String, CodingKey { case accessToken = "access_token" }
}

public struct ListResponse<T: Decodable>: Decodable {
    public let items: [T]?
    public let jobs: [T]?
    public let drafts: [T]?
    public let contacts: [T]?
    public let deals: [T]?
    public let invoices: [T]?
    public let projects: [T]?
    public let tickets: [T]?
    public let people: [T]?

    public var first: [T] {
        items ?? jobs ?? drafts ?? contacts ?? deals ?? invoices ?? projects ?? tickets ?? people ?? []
    }
}

public struct UploadURLResponse: Decodable, Sendable {
    public let uploadUrl: String
    public let key: String
    public let expiresInSeconds: Int
    enum CodingKeys: String, CodingKey {
        case uploadUrl = "uploadUrl"
        case key
        case expiresInSeconds
    }
}

public struct CreateJobResponse: Decodable, Sendable {
    public let jobId: String
    public let status: String
    public let variationCount: Int
    enum CodingKeys: String, CodingKey {
        case jobId, status, variationCount
    }
}

public struct OperatorStats: Decodable, Sendable {
    public let counts: Counts
    public let thisWeek: Int
    public let totalCostUsd: Double
    public let actions: [ActionMeta]

    public struct Counts: Decodable, Sendable {
        public let pending: Int
        public let approved: Int
        public let rejected: Int
        public let sent: Int
        public let failed: Int
    }

    public struct ActionMeta: Decodable, Sendable {
        public let kind: String
        public let label: String
        public let description: String
        public let channel: String
    }

    enum CodingKeys: String, CodingKey {
        case counts
        case thisWeek
        case totalCostUsd
        case actions
    }
}

public struct ErrorResponse: Decodable {
    public let error: ErrorDetail
    public struct ErrorDetail: Decodable { public let code: String; public let message: String }
}

// MARK: - Errors

public enum APIError: LocalizedError, Sendable {
    case invalidResponse
    case unauthorized
    case serverError(status: Int, message: String)
    case uploadFailed
    case decoding(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:         return "Invalid response from server"
        case .unauthorized:            return "Please sign in again"
        case .serverError(_, let m):   return m
        case .uploadFailed:            return "Upload failed"
        case .decoding(let e):         return "Could not decode response: \(e.localizedDescription)"
        }
    }
}

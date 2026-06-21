import Foundation
import Security

// =============================================================================
// Keychain wrapper
// =============================================================================
// Stores auth tokens in the iOS Keychain (encrypted, persisted, backed up
// to iCloud if the user has that enabled). Falls back to UserDefaults only
// in DEBUG for unit tests.

public final class KeychainStore: @unchecked Sendable {
    public static let shared = KeychainStore()

    private let service: String

    public init(service: String = "com.o.company.noira") {
        self.service = service
    }

    public enum Key: String {
        case accessToken
        case refreshToken
    }

    public func set(_ value: String, for key: Key) throws {
        let data = Data(value.utf8)
        try set(data, for: key.rawValue)
    }

    public func set(_ data: Data, for key: String) throws {
        // Delete any existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status: status)
        }
    }

    public func get(_ key: Key) -> String? {
        guard let data = getData(key.rawValue) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func getData(_ key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else { return nil }
        return item as? Data
    }

    public func delete(_ key: Key) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandled(status: status)
        }
    }

    public func deleteAll() throws {
        for key in [Key.accessToken, .refreshToken] {
            try? delete(key)
        }
    }
}

public enum KeychainError: LocalizedError {
    case unhandled(status: OSStatus)
    public var errorDescription: String? {
        switch self {
        case .unhandled(let s): return "Keychain error (status: \(s))"
        }
    }
}

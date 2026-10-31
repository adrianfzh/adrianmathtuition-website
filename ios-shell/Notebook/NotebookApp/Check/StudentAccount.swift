import Foundation
import Security
import os

/// The student's sign-in for checking pages: the same email + password as the website.
/// Two keys come back; they are kept in the iPad's keychain, never in the notebook files.
@MainActor
@Observable
final class StudentAccount {
    struct Session: Codable, Sendable {
        var accessToken: String
        var refreshToken: String
        var expiresAt: Double?
        var name: String
    }

    enum CheckError: LocalizedError {
        case signedOut, server(String), network
        var errorDescription: String? {
            switch self {
            case .signedOut: "Please sign in again."
            case .server(let m): m
            case .network: "No connection. Check the Wi-Fi and try again."
            }
        }
    }

    private(set) var session: Session?
    var isSignedIn: Bool { session != nil }
    var name: String { session?.name ?? "" }

    @ObservationIgnored private let log = Logger(subsystem: "com.adrianmath.notebook", category: "account")
    private static let keychainKey = "student-session"

    init() {
        session = Keychain.read(Self.keychainKey).flatMap { try? JSONDecoder().decode(Session.self, from: $0) }
        #if DEBUG
        // UI tests: `-appSession <json>` signs in without typing a password.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-appSession"), args.indices.contains(i + 1),
           let s = try? JSONDecoder().decode(Session.self, from: Data(args[i + 1].utf8)) {
            store(s)
        }
        if args.contains("-signedOut") { signOut() }
        #endif
    }

    func signIn(email: String, password: String) async throws {
        let s: Session = try await post("/api/app/session", ["email": email, "password": password], auth: false)
        store(s)
    }

    func signOut() {
        session = nil
        Keychain.delete(Self.keychainKey)
    }

    /// Sends one page; tries a fresh key once if the old one has run out.
    func checkPage(image: Data, lines: [HandwritingLine]) async throws -> CheckPageReply {
        let body: [String: Any] = [
            "image": image.base64EncodedString(),
            "lines": lines.map { ["n": $0.number, "box": [$0.rect.minX, $0.rect.minY, $0.rect.width, $0.rect.height]] },
        ]
        if let exp = session?.expiresAt, exp - 60 < Date().timeIntervalSince1970 { try await refresh() }
        do {
            return try await post("/api/app/check-page", body, auth: true)
        } catch CheckError.signedOut {
            try await refresh()
            return try await post("/api/app/check-page", body, auth: true)
        }
    }

    private func refresh() async throws {
        guard let old = session else { throw CheckError.signedOut }
        struct Fresh: Decodable { var accessToken: String; var refreshToken: String; var expiresAt: Double? }
        do {
            let f: Fresh = try await post("/api/app/session/refresh", ["refreshToken": old.refreshToken], auth: false)
            store(Session(accessToken: f.accessToken, refreshToken: f.refreshToken, expiresAt: f.expiresAt, name: old.name))
        } catch CheckError.signedOut {
            signOut()
            throw CheckError.signedOut
        }
    }

    private func store(_ s: Session) {
        session = s
        if let data = try? JSONEncoder().encode(s) { Keychain.write(Self.keychainKey, data) }
    }

    private func post<T: Decodable>(_ path: String, _ body: [String: Any], auth: Bool) async throws -> T {
        var req = URLRequest(url: AppBrand.apiBase.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.timeoutInterval = 120
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth {
            guard let token = session?.accessToken else { throw CheckError.signedOut }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data, response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: req) } catch {
            log.error("request failed: \(error.localizedDescription)")
            throw CheckError.network
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 && (auth || path.hasSuffix("/refresh")) { throw CheckError.signedOut }
        guard (200..<300).contains(status) else {
            let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Something went wrong. Try again."
            throw CheckError.server(msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct ServerError: Decodable { var error: String }

/// The few keychain calls the app needs: one item per key, this device only.
enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.adrianmath.notebook",
         kSecAttrAccount as String: key]
    }

    static func read(_ key: String) -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    static func write(_ key: String, _ data: Data) {
        delete(key)
        var q = query(key)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}

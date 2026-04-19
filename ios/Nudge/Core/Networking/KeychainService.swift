import Foundation
import Security

/// Secure storage wrapper for JWT and sensitive user data using iOS Keychain.
public class KeychainService {
    public static let shared = KeychainService()
    private init() {}
    
    private let tokenKey = "com.nudge.auth.jwt"
    
    public func saveToken(_ token: String) throws {
        let tag = tokenKey.data(using: .utf8)!
        let data = token.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: "KeychainServiceError", code: Int(status), userInfo: nil)
        }
    }
    
    public func getToken() -> String? {
        let tag = tokenKey.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess, let data = dataTypeRef as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }
    
    public func deleteToken() {
        let tag = tokenKey.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}

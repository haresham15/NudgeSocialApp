import Foundation

// MARK: - Location Models
public struct LocationCheckRequest: Codable {
    public let lat: Double
    public let lng: Double
}

public struct LocationMatch: Codable, Equatable, Identifiable {
    public let id = UUID()
    public let friendId: String
    public let friendName: String
    public let distanceMeters: Double
}

public struct LocationCheckResponse: Codable {
    public let matches: [LocationMatch]
    public let checkedAt: Date
}

// MARK: - Auth Models
public struct AppleSignInRequest: Codable {
    public let identityToken: String
    public let givenName: String?
    public let familyName: String?
}

public struct AuthResponse: Codable {
    public let token: String
    public let user: UserProfile
}

public struct UserProfile: Codable, Equatable {
    public let id: String
    public let displayName: String
    public let statusEmoji: String?
    public let statusText: String?
}

// MARK: - Friends Models
public struct FriendItem: Codable, Equatable, Identifiable {
    public let id: String // Friendship ID or User ID based on context
    public let displayName: String
    public let statusEmoji: String?
    public let statusText: String?
}

public struct FriendsListResponse: Codable {
    public let friends: [FriendItem]
    public let total: Int
}

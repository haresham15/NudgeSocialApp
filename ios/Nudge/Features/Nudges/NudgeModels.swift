import Foundation

// MARK: - Core Nudge Models
public struct NudgeEvent: Codable, Equatable, Identifiable {
    public let id: String
    public let friendId: String
    public let friendName: String
    public let direction: String // "sent" or "received"
    public let proximityMeters: Double?
    public let createdAt: Date
    public let vibeResponse: String?
    
    // Simplification for the feed
    public var title: String {
        return direction == "sent" ? "You crossed paths with \(friendName)!" : "\(friendName) spotted you nearby!"
    }
    
    public var humanReadableVibe: String? {
        guard let vibe = vibeResponse else { return nil }
        switch vibe {
        case "yes": return "Yes!"
        case "maybe_later": return "Maybe Later"
        case "not_today": return "Not Today"
        default: return vibe
        }
    }
}

public struct NudgeFeedResponse: Codable {
    public let nudges: [NudgeEvent]
    public let total: Int
}

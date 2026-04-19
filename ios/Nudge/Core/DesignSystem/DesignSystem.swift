import SwiftUI

/// Core Design System enforcing a cohesive, modern app aesthetic.
/// Highly focused on vibrant but accessible visual elements.
public enum DesignSystem {
    
    public enum Colors {
        /// Brand Primary - A vibrant dynamic purple/pink
        public static let primary = Color("BrandPrimary", bundle: nil) // To be added to asset catalog, falling back to dynamic color
        public static let secondary = Color.indigo
        
        /// Backgrounds
        public static let background = Color(uiColor: .systemBackground)
        public static let secondaryBackground = Color(uiColor: .secondarySystemBackground)
        public static let tertiaryBackground = Color(uiColor: .tertiarySystemGroupedBackground)
        
        /// Text
        public static let textPrimary = Color(uiColor: .label)
        public static let textSecondary = Color(uiColor: .secondaryLabel)
        
        /// Accents/Semantic
        public static let success = Color.green
        public static let warning = Color.orange
        public static let error = Color.red
        
        /// Gradient for "Wow" elements (Buttons, special tags)
        public static let brandGradient = LinearGradient(
            colors: [.purple, .pink],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    
    public enum Fonts {
        // We fall back to system fonts with custom rounding/design for a premium feel
        // If "Inter" or "Outfit" were imported, they would be declared here.
        public static let title = Font.system(.largeTitle, design: .rounded).weight(.bold)
        public static let headline = Font.system(.headline, design: .rounded).weight(.semibold)
        public static let body = Font.system(.body, design: .default)
        public static let caption = Font.system(.caption, design: .default).weight(.medium)
    }
}

// MARK: - Shared Views

public struct StandardButton: View {
    let title: String
    let action: () -> Void
    
    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(DesignSystem.Fonts.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(DesignSystem.Colors.brandGradient)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: DesignSystem.Colors.secondary.opacity(0.3), radius: 8, x: 0, y: 4)
        }
    }
}

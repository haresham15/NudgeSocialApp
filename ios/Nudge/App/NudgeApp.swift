import SwiftUI
import ComposableArchitecture

@main
struct NudgeApp: App {
    var body: some Scene {
        WindowGroup {
            RootView(
                store: Store(initialState: RootFeature.State()) {
                    RootFeature()
                }
            )
            .tint(DesignSystem.Colors.primary)
        }
    }
}

import SwiftUI
import ComposableArchitecture

struct RootView: View {
    let store: StoreOf<RootFeature>

    var body: some View {
        WithViewStore(self.store, observe: { $0 }) { viewStore in
            Group {
                if viewStore.isAuthenticated {
                    MainTabView()
                } else {
                    AuthView(
                        store: Store(initialState: AuthFeature.State()) {
                            AuthFeature()
                        }
                    )
                }
            }
            .onAppear {
                viewStore.send(.onAppear)
            }
        }
    }
}

// MARK: - Main Tab Bar View
struct MainTabView: View {
    var body: some View {
        TabView {
            NudgeFeedView(
                store: Store(initialState: NudgeFeedFeature.State()) { NudgeFeedFeature() }
            )
            .tabItem { Label("Nudges", systemImage: "sparkles") }
            
            FriendsView(
                store: Store(initialState: FriendsFeature.State()) { FriendsFeature() }
            )
            .tabItem { Label("Friends", systemImage: "person.2") }
            
            Text("Map View Coming Soon")
                .tabItem { Label("Map", systemImage: "map") }
            
            Text("Settings")
                .tabItem { Label("Settings", systemImage: "gear") }
        }
        .tint(DesignSystem.Colors.primary)
    }
}

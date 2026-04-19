import SwiftUI
import ComposableArchitecture

@Reducer
struct RootFeature {
    @ObservableState
    struct State: Equatable {
        var isAuthenticated: Bool = false
        // Placeholder for sub-states: User, Auth, MainTab
    }

    enum Action: Equatable {
        case onAppear
        case setAuthenticated(Bool)
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                // Check keychain for saved JWT token
                // Update state.isAuthenticated
                return .none
            case let .setAuthenticated(authStatus):
                state.isAuthenticated = authStatus
                return .none
            }
        }
    }
}

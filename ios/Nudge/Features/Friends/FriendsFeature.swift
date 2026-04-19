import SwiftUI
import ComposableArchitecture

@Reducer
public struct FriendsFeature {
    @ObservableState
    public struct State: Equatable {
        var friends: [FriendItem] = []
        var isLoading: Bool = false
        var errorMessage: String? = nil
    }

    public enum Action: Equatable {
        case onAppear
        case friendsLoaded(Result<FriendsListResponse, Error>)
        case addFriend(phoneOrUsername: String)
        case requestSent(Result<Void, Error>)
    }

    public var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.isLoading = true
                state.errorMessage = nil
                return .run { send in
                    do {
                        let response: FriendsListResponse = try await APIClient.shared.request(
                            path: "/friends",
                            method: "GET"
                        )
                        await send(.friendsLoaded(.success(response)))
                    } catch {
                        await send(.friendsLoaded(.failure(error)))
                    }
                }
                
            case let .friendsLoaded(.success(response)):
                state.isLoading = false
                state.friends = response.friends
                return .none
                
            case let .friendsLoaded(.failure(error)):
                state.isLoading = false
                state.errorMessage = error.localizedDescription
                return .none
                
            case let .addFriend(identifier):
                // Placeholder for sending a friend request
                // In reality, this would hit /friends/request
                return .none
            
            case .requestSent:
                return .none
            }
        }
    }
}

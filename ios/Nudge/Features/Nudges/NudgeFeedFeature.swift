import SwiftUI
import ComposableArchitecture

@Reducer
public struct NudgeFeedFeature {
    @ObservableState
    public struct State: Equatable {
        var nudges: [NudgeEvent] = []
        var isLoading: Bool = false
    }

    public enum Action: Equatable {
        case fetchNudges
        case nudgesLoaded(Result<NudgeFeedResponse, Error>)
        case vibeCheckTapped(nudgeId: String, response: String)
    }

    public var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .fetchNudges:
                state.isLoading = true
                return .run { send in
                    do {
                        let res: NudgeFeedResponse = try await APIClient.shared.request(path: "/nudges", method: "GET")
                        await send(.nudgesLoaded(.success(res)))
                    } catch {
                        await send(.nudgesLoaded(.failure(error)))
                    }
                }
                
            case let .nudgesLoaded(.success(response)):
                state.isLoading = false
                state.nudges = response.nudges
                return .none
                
            case .nudgesLoaded(.failure(_)):
                state.isLoading = false
                return .none
                
            case let .vibeCheckTapped(nudgeId, responseValue):
                // Send vibe response via POST /nudges/:id/vibe
                return .run { _ in
                    let bodyJson = ["response": responseValue]
                    let data = try? JSONSerialization.data(withJSONObject: bodyJson)
                    let _: EmptyResponse? = try? await APIClient.shared.request(
                        path: "/nudges/\(nudgeId)/vibe",
                        method: "POST",
                        body: data
                    )
                }
            }
        }
    }
}

public struct EmptyResponse: Codable {}

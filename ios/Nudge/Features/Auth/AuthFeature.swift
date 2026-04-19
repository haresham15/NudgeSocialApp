import SwiftUI
import ComposableArchitecture
import AuthenticationServices

@Reducer
public struct AuthFeature {
    @ObservableState
    public struct State: Equatable {
        var isLoggingIn: Bool = false
        var errorMessage: String? = nil
    }

    public enum Action: Equatable {
        case appleSignInButtonTapped
        case appleSignInResult(Result<ASAuthorization, Error>)
        case loginCompleted(AuthResponse)
        case loginFailed(String)
    }

    public var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .appleSignInButtonTapped:
                state.isLoggingIn = true
                state.errorMessage = nil
                return .none // UI triggers ASAuthorizationController
                
            case let .appleSignInResult(.success(auth)):
                guard let appleIDCredential = auth.credential as? ASAuthorizationAppleIDCredential,
                      let identityTokenData = appleIDCredential.identityToken,
                      let identityToken = String(data: identityTokenData, encoding: .utf8) else {
                    return .send(.loginFailed("Invalid Apple ID Credential"))
                }
                
                let givenName = appleIDCredential.fullName?.givenName
                let familyName = appleIDCredential.fullName?.familyName
                let requestParams = AppleSignInRequest(
                    identityToken: identityToken,
                    givenName: givenName,
                    familyName: familyName
                )
                
                return .run { send in
                    do {
                        let encoder = JSONEncoder()
                        let body = try encoder.encode(requestParams)
                        let response: AuthResponse = try await APIClient.shared.request(
                            path: "/auth/apple",
                            method: "POST",
                            body: body,
                            requiresAuth: false
                        )
                        // Save token securely
                        try KeychainService.shared.saveToken(response.token)
                        
                        await send(.loginCompleted(response))
                    } catch {
                        await send(.loginFailed(error.localizedDescription))
                    }
                }
                
            case let .appleSignInResult(.failure(error)):
                state.isLoggingIn = false
                state.errorMessage = "Sign in failed or was canceled."
                return .none
                
            case .loginCompleted:
                state.isLoggingIn = false
                // Parent reducer (RootFeature) will observe this or we can delegate
                return .none
                
            case let .loginFailed(message):
                state.isLoggingIn = false
                state.errorMessage = message
                return .none
            }
        }
    }
}

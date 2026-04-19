import SwiftUI
import ComposableArchitecture
import AuthenticationServices

public struct AuthView: View {
    let store: StoreOf<AuthFeature>
    
    public init(store: StoreOf<AuthFeature>) {
        self.store = store
    }
    
    public var body: some View {
        WithViewStore(self.store, observe: { $0 }) { viewStore in
            VStack(spacing: 32) {
                Spacer()
                
                VStack(spacing: 16) {
                    Text("NUDGE")
                        .font(DesignSystem.Fonts.title)
                        .foregroundStyle(DesignSystem.Colors.brandGradient)
                    
                    Text("Spontaneous meetups. Real-world connections. Zero coordinates tracked.")
                        .font(DesignSystem.Fonts.body)
                        .multilineTextAlignment(.center)
                        .foregroundColor(DesignSystem.Colors.textSecondary)
                        .padding(.horizontal, 40)
                }
                
                Spacer()
                
                if let error = viewStore.errorMessage {
                    Text(error)
                        .font(DesignSystem.Fonts.caption)
                        .foregroundColor(DesignSystem.Colors.error)
                }
                
                if viewStore.isLoggingIn {
                    ProgressView()
                        .padding()
                } else {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName]
                    } onCompletion: { result in
                        viewStore.send(.appleSignInResult(result))
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .padding(.horizontal, 40)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                
                Spacer().frame(height: 40)
            }
            .background(DesignSystem.Colors.background.ignoresSafeArea())
        }
    }
}

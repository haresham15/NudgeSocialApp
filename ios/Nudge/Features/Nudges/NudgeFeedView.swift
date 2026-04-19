import SwiftUI
import ComposableArchitecture

public struct NudgeFeedView: View {
    let store: StoreOf<NudgeFeedFeature>
    
    public init(store: StoreOf<NudgeFeedFeature>) {
        self.store = store
    }
    
    public var body: some View {
        WithViewStore(self.store, observe: { $0 }) { viewStore in
            NavigationStack {
                ZStack {
                    DesignSystem.Colors.background.ignoresSafeArea()
                    
                    if viewStore.isLoading && viewStore.nudges.isEmpty {
                        ProgressView()
                    } else if viewStore.nudges.isEmpty {
                        VStack(spacing: 16) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 64))
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                            Text("No serendipity yet.")
                                .font(DesignSystem.Fonts.headline)
                            Text("Keep Nudge in your pocket. We'll let you know when friends are nearby.")
                                .font(DesignSystem.Fonts.body)
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                    } else {
                        List {
                            ForEach(viewStore.nudges) { nudge in
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text(nudge.title)
                                            .font(DesignSystem.Fonts.headline)
                                        Spacer()
                                        Text(nudge.createdAt, style: .time)
                                            .font(DesignSystem.Fonts.caption)
                                            .foregroundColor(DesignSystem.Colors.textSecondary)
                                    }
                                    
                                    if let distance = nudge.proximityMeters {
                                        Text("Approximately \(Int(distance))m away")
                                            .font(DesignSystem.Fonts.caption)
                                            .foregroundColor(DesignSystem.Colors.primary)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(DesignSystem.Colors.primary.opacity(0.1))
                                            .cornerRadius(8)
                                    }
                                    
                                    if nudge.vibeResponse == nil {
                                        HStack(spacing: 12) {
                                            ActionButton(title: "Yes!", color: DesignSystem.Colors.success) {
                                                viewStore.send(.vibeCheckTapped(nudgeId: nudge.id, response: "yes"))
                                            }
                                            ActionButton(title: "Maybe Later", color: DesignSystem.Colors.warning) {
                                                viewStore.send(.vibeCheckTapped(nudgeId: nudge.id, response: "maybe_later"))
                                            }
                                            ActionButton(title: "Not Today", color: DesignSystem.Colors.textSecondary) {
                                                viewStore.send(.vibeCheckTapped(nudgeId: nudge.id, response: "not_today"))
                                            }
                                        }
                                        .padding(.top, 8)
                                    } else {
                                        Text("You responded: \(nudge.humanReadableVibe ?? "")")
                                            .font(DesignSystem.Fonts.caption)
                                            .foregroundColor(DesignSystem.Colors.textSecondary)
                                            .padding(.top, 4)
                                    }
                                }
                                .padding(.vertical, 8)
                            }
                        }
                        .listStyle(.plain)
                        .refreshable {
                            viewStore.send(.fetchNudges)
                        }
                    }
                }
                .navigationTitle("Nudges")
            }
            .onAppear {
                viewStore.send(.fetchNudges)
            }
        }
    }
}

struct ActionButton: View {
    let title: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(color)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

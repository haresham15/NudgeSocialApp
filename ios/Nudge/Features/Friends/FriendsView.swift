import SwiftUI
import ComposableArchitecture

public struct FriendsView: View {
    let store: StoreOf<FriendsFeature>
    @State private var showingAddFriend = false
    @State private var friendIdToAdd = ""
    
    public init(store: StoreOf<FriendsFeature>) {
        self.store = store
    }
    
    public var body: some View {
        WithViewStore(self.store, observe: { $0 }) { viewStore in
            NavigationStack {
                ZStack {
                    DesignSystem.Colors.background.ignoresSafeArea()
                    
                    if viewStore.isLoading && viewStore.friends.isEmpty {
                        ProgressView()
                    } else if viewStore.friends.isEmpty {
                        VStack(spacing: 16) {
                            Image(systemName: "person.2.slash")
                                .font(.system(size: 64))
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                            Text("No friends yet.")
                                .font(DesignSystem.Fonts.headline)
                            Text("Add some mutuals so the engine can spot you!")
                                .font(DesignSystem.Fonts.body)
                                .foregroundColor(DesignSystem.Colors.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                    } else {
                        List {
                            ForEach(viewStore.friends) { friend in
                                HStack(spacing: 12) {
                                    Circle()
                                        .fill(DesignSystem.Colors.secondaryBackground)
                                        .frame(width: 48, height: 48)
                                        .overlay(
                                            Text(String(friend.displayName.prefix(1)))
                                                .font(.headline)
                                        )
                                    
                                    VStack(alignment: .leading) {
                                        Text(friend.displayName)
                                            .font(DesignSystem.Fonts.headline)
                                        
                                        if let emoji = friend.statusEmoji, let text = friend.statusText {
                                            Text("\(emoji) \(text)")
                                                .font(DesignSystem.Fonts.caption)
                                                .foregroundColor(DesignSystem.Colors.textSecondary)
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .listStyle(.plain)
                    }
                }
                .navigationTitle("Friends")
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showingAddFriend = true }) {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(DesignSystem.Colors.primary)
                        }
                    }
                }
                .sheet(isPresented: $showingAddFriend) {
                    NavigationStack {
                        Form {
                            Section(header: Text("Friend's User ID (or Phone)")) {
                                TextField("Enter ID", text: $friendIdToAdd)
                            }
                            Button("Send Request") {
                                viewStore.send(.addFriend(phoneOrUsername: friendIdToAdd))
                                showingAddFriend = false
                            }
                            .foregroundColor(DesignSystem.Colors.primary)
                        }
                        .navigationTitle("Add Friend")
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Cancel") {
                                    showingAddFriend = false
                                }
                            }
                        }
                    }
                }
            }
            .onAppear {
                viewStore.send(.onAppear)
            }
        }
    }
}

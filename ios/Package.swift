// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "Nudge",
    platforms: [
        .iOS(.v17) // Assuming modern iOS capabilities for Nudge
    ],
    products: [
        .library(
            name: "NudgeCore",
            targets: ["NudgeCore"]),
    ],
    dependencies: [
        // Composable Architecture for predictable state management
        .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.9.0"),
    ],
    targets: [
        .target(
            name: "NudgeCore",
            dependencies: [
                .product(name: "ComposableArchitecture", package: "swift-composable-architecture")
            ],
            path: "Nudge"
        )
    ]
)

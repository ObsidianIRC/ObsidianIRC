// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "tauri-plugin-share-sheet",
    platforms: [.iOS(.v13)],
    products: [
        .library(
            name: "tauri-plugin-share-sheet",
            type: .static,
            targets: ["tauri-plugin-share-sheet"]
        )
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-share-sheet",
            dependencies: [
                .product(name: "Tauri", package: "Tauri")
            ],
            path: "Sources/ShareSheet"
        )
    ]
)

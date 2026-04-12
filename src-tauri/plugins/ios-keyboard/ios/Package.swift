// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "tauri-plugin-ios-keyboard",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(
            name: "tauri-plugin-ios-keyboard",
            type: .static,
            targets: ["tauri-plugin-ios-keyboard"])
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-ios-keyboard",
            dependencies: [
                .product(name: "Tauri", package: "Tauri")
            ],
            path: "Sources")
    ]
)

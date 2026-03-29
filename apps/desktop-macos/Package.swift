// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SisuDesktopMacOS",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "SisuDesktopMacOS",
            targets: ["SisuDesktopMacOS"]
        )
    ],
    targets: [
        .executableTarget(
            name: "SisuDesktopMacOS",
            path: "Sources/SisuDesktopMacOS"
        )
    ]
)

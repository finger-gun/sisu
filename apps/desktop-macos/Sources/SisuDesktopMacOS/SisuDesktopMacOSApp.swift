import SwiftUI

@main
struct SisuDesktopMacOSApp: App {
    @StateObject private var state = AppState(
        client: RuntimeClient(baseURL: URL(string: "http://127.0.0.1:8787")!)
    )

    var body: some Scene {
        WindowGroup("Sisu Desktop") {
            ContentView()
                .environmentObject(state)
                .task {
                    await state.bootstrap()
                }
        }
    }
}

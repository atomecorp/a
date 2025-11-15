import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    // Inbox disabled
        _ = scene as? UIWindowScene
        // App-only: optionally observe external display events (no-op in AUv3)
        if FeatureFlags.externalDisplayObservation {
            ExternalDisplayGuards.shared.startObservingIfApp(observer: DummyExternalDisplayObserver.shared)
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
    print("🟢 Scene became active (inbox disabled)")
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard !URLContexts.isEmpty else { return }
    // Inbox disabled: ignore URL contexts
    }
}

// Lightweight observer to hook ExternalDisplayGuards without altering app architecture
final class DummyExternalDisplayObserver: ExternalDisplayObserver {
    static let shared = DummyExternalDisplayObserver()
    private init() {}
    func externalDisplayChanged(_ state: ExternalDisplayState) {
        print("[ExternalDisplay] state=\(state.rawValue)")
    }
}

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Start Darwin listener and try to recover any pending payloads
        DarwinNotificationListener.shared.start()
        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
        AppGroupOpenURLInbox.shared.flushIfPossible()
        _ = scene as? UIWindowScene
        // App-only: optionally observe external display events (no-op in AUv3)
        if FeatureFlags.externalDisplayObservation {
            ExternalDisplayGuards.shared.startObservingIfApp(observer: DummyExternalDisplayObserver.shared)
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        print("🟢 Scene became active → flush inbox")
        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
        AppGroupOpenURLInbox.shared.flushIfPossible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard !URLContexts.isEmpty else { return }
        for ctx in URLContexts {
            let url = ctx.url
            print("🔗 SceneDelegate.openURLContexts url=\(url.absoluteString)")
        if url.scheme == SharedBus.activationScheme {
                AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                AppGroupOpenURLInbox.shared.flushIfPossible()
        } else if (url.scheme == "http" || url.scheme == "https") &&
            (url.host?.lowercased().hasSuffix("atome.one") == true) &&
            url.path.lowercased().hasPrefix("/activate") {
        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
        AppGroupOpenURLInbox.shared.flushIfPossible()
            }
        }
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

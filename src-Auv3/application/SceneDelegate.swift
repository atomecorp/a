import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Start Darwin listener and try to recover any pending payloads
        DarwinNotificationListener.shared.start()
        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
        AppGroupOpenURLInbox.shared.flushIfPossible()
        _ = scene as? UIWindowScene
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

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        _ = scene as? UIWindowScene
        receiveAuthenticationLinks(from: connectionOptions.userActivities)
        receiveAuthenticationLinks(from: connectionOptions.urlContexts)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        print("🟢 Scene became active")
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        receiveAuthenticationLinks(from: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        receiveAuthenticationLink(from: userActivity)
    }

    private func receiveAuthenticationLinks(from activities: Set<NSUserActivity>) {
        activities.forEach(receiveAuthenticationLink)
    }

    private func receiveAuthenticationLink(from activity: NSUserActivity) {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = activity.webpageURL else { return }
        _ = AuthLinkInbox.receive(url)
    }

    private func receiveAuthenticationLinks(from contexts: Set<UIOpenURLContext>) {
        contexts.forEach { if !SharedFileInbox.receive($0.url) { _ = AuthLinkInbox.receive($0.url) } }
    }
}

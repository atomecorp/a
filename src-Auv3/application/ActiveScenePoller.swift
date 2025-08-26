import UIKit

final class ActiveScenePoller {
    static let shared = ActiveScenePoller()
    private var timer: Timer?

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { _ in
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let active = scenes.contains(where: { $0.activationState == .foregroundActive })
            if active {
                AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                AppGroupOpenURLInbox.shared.flushIfPossible()
            }
        }
    }

    func stop() { timer?.invalidate(); timer = nil }
}

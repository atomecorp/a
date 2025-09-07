import UIKit

/// Previously polled every 750ms to opportunistically drain/flush the AppGroup inbox.
/// Now disabled because a periodic reaction is no longer desired. The Darwin notification
/// listener + scene/activity callbacks already trigger drain/flush when something real happens.
/// Keeping the type (no-op) avoids touching other call sites beyond removing explicit start().
final class ActiveScenePoller {
    static let shared = ActiveScenePoller()
    private init() {}
    /// No-op: timer removed.
    func start() { /* intentionally disabled */ }
    func stop() { /* no timer to stop */ }
}

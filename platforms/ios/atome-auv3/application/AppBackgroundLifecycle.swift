import UIKit

// The app's passage to and from the background. iOS suspends a backgrounded app
// and kills it if it is suspended while holding a lock on the shared database
// (0xDEAD10CC); it may also reclaim the page's web content. This owner keeps the
// suspension safe and boots a reclaimed page again once the user is back.
final class AppBackgroundLifecycle {
    static let shared = AppBackgroundLifecycle()

    // One system activity assertion, ended exactly once: by its holder or by expiration.
    private final class Assertion {
        private let lock = NSLock()
        private var identifier = UIBackgroundTaskIdentifier.invalid
        private var expired = false

        // False when no background time is left, including an expiration reported
        // before the identifier was even returned.
        func begin() -> Bool {
            let task = UIApplication.shared.beginBackgroundTask(withName: "atome.database") { [weak self] in
                atome_ios_local_server_interrupt()
                self?.expire()
            }
            guard task != .invalid else { return false }
            lock.lock()
            identifier = task
            let expiredEarly = expired
            lock.unlock()
            if expiredEarly { end() }
            return !expiredEarly
        }

        private func expire() {
            lock.lock()
            expired = true
            lock.unlock()
            end()
        }

        func end() {
            lock.lock()
            let task = identifier
            identifier = .invalid
            lock.unlock()
            if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
        }
    }

    // A page that dies again this soon after an automatic reload cannot hold rather
    // than being reclaimed: it stays on the failure surface instead of reloading in a loop.
    private static let reloadLoopWindow: TimeInterval = 120

    private let stateLock = NSLock()
    private var backgrounded = false
    // Main thread: a presented page terminated while the app was in the background.
    private var pageReloadPending = false
    private var lastAutomaticReload: Date?

    private init() {}

    func install() {
        dispatchPrecondition(condition: .onQueue(.main))
        // A launch for a push, a call or a location update starts in the background.
        if UIApplication.shared.applicationState == .background { enterBackground() }
        WebViewManager.presentedPageTerminationHandler = { [unowned self] in self.reloadTerminatedPage() }
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [unowned self] _ in
            self.enterBackground()
        }
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [unowned self] _ in
            self.enterForeground()
        }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            LocalServer.shared.resumeFromBackground()
            AppNativeCommunication.shared.resume()
        }
    }

    private var isBackgrounded: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return backgrounded
    }

    private func setBackgrounded(_ value: Bool) {
        stateLock.lock()
        backgrounded = value
        stateLock.unlock()
    }

    private func enterBackground() {
        setBackgrounded(true)
        // The vault's units under way end under background time, never suspended holding the
        // app group's lock; a later one starts only under its own (`beginUnitTime`), and past
        // that time it is interrupted (rolled back).
        let assertion = Assertion()
        _ = assertion.begin()
        LocalServer.shared.enterBackground(begin: beginVaultUnitTime, end: endVaultUnitTime) {
            assertion.end()
        }
    }

    // The background time of one unit of work on the vault, asked by the local server.
    private let unitLock = NSLock()
    private var nextUnit: Int64 = 0
    private var unitTimes: [Int64: Assertion] = [:]

    fileprivate func beginUnitTime() -> Int64 {
        let assertion = Assertion()
        guard assertion.begin() else { return -1 }
        unitLock.lock()
        defer { unitLock.unlock() }
        nextUnit += 1
        unitTimes[nextUnit] = assertion
        return nextUnit
    }

    fileprivate func endUnitTime(_ identifier: Int64) {
        unitLock.lock()
        let assertion = unitTimes.removeValue(forKey: identifier)
        unitLock.unlock()
        assertion?.end()
    }

    private func enterForeground() {
        setBackgrounded(false)
        guard pageReloadPending else { return }
        pageReloadPending = false
        reloadReclaimedPage()
    }

    // A page is booted in the foreground only: booting it in background time would
    // compete with the suspension it is about to undergo.
    private func reloadTerminatedPage() {
        dispatchPrecondition(condition: .onQueue(.main))
        if let last = lastAutomaticReload, Date().timeIntervalSince(last) < Self.reloadLoopWindow {
            WebViewManager.reportBootFailure(reason: "web_content_terminated")
        } else if isBackgrounded {
            pageReloadPending = true
        } else {
            reloadReclaimedPage()
        }
    }

    private func reloadReclaimedPage() {
        lastAutomaticReload = Date()
        WebViewManager.reloadMainPage(reason: "reclaimed_page_reload")
    }
}

// The local server's C callbacks for a vault unit's background time (no context: the shared owner).
private func beginVaultUnitTime() -> Int64 { AppBackgroundLifecycle.shared.beginUnitTime() }
private func endVaultUnitTime(_ identifier: Int64) { AppBackgroundLifecycle.shared.endUnitTime(identifier) }

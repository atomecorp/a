import Foundation
import SQLite3

// The single handle on `adole.db`. Every unit of database work runs on the
// serial `AiSRuntime.queue` and starts by opening this handle.
//
// The database lives in the App Group container shared with the AUv3, and iOS
// kills (0xDEAD10CC) a suspended app that holds a lock on such a file. SQLite
// holds one for the whole of a statement or transaction. A host that can be
// suspended therefore installs `activityAssertion`: in the background, database
// work starts under a system activity assertion held until the queue drains.
extension AiSRuntime {
    enum ActivityAssertion {
        // The process cannot be suspended under the work (foreground).
        case notNeeded
        case held(release: () -> Void)
        // No background time is left: work started now would be suspended with its lock.
        case refused
    }

    // Injected by the app target: UIApplication is unavailable in the AUv3
    // extension, whose lifecycle belongs to its host.
    static var activityAssertion: (() -> ActivityAssertion)?

    private static var db: OpaquePointer?
    // Queue-confined: the assertion covering the work queued so far.
    private static var activityRelease: (() -> Void)?
    // `interruptActiveWork` runs off the queue; the handle it interrupts is published under this lock.
    private static let interruptLock = NSLock()
    private static var interruptibleHandle: OpaquePointer?

    static func openDatabase() throws -> OpaquePointer? {
        try holdActivityAssertionUntilIdle()
        if let existing = db {
            return existing
        }
        guard let root = SandboxPathValidator.primaryRoot() ?? SandboxPathValidator.pluginContainerRoot() else {
            throw AiSError("AiS storage root unavailable")
        }
        let databaseURL = root.appendingPathComponent("adole.db", isDirectory: false)
        var handle: OpaquePointer?
        let rc = sqlite3_open_v2(databaseURL.path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
        guard rc == SQLITE_OK, let opened = handle else {
            throw AiSError("Unable to open AiS database")
        }
        sqlite3_busy_timeout(opened, 2000)
        guard sqlite3_exec(opened, schemaSQL, nil, nil, nil) == SQLITE_OK else {
            let message = String(cString: sqlite3_errmsg(opened))
            sqlite3_close(opened)
            throw AiSError(message)
        }
        try ensureSyncSchema(opened)
        try ensureLocalAuthSchema(opened)
        db = opened
        interruptLock.lock()
        interruptibleHandle = opened
        interruptLock.unlock()
        return opened
    }

    // Entering the background: the work already running or queued was started
    // without an assertion. One assertion now covers it until the queue drains.
    static func coverQueuedWork() {
        guard case .held(let release)? = activityAssertion?() else { return }
        queue.async(execute: release)
    }

    // The background time expired: the running statement stops now, SQLite rolls
    // its transaction back and releases the lock, instead of being suspended with it.
    static func interruptActiveWork() {
        interruptLock.lock()
        defer { interruptLock.unlock() }
        if let handle = interruptibleHandle { sqlite3_interrupt(handle) }
    }

    private static func holdActivityAssertionUntilIdle() throws {
        guard activityRelease == nil, let acquire = activityAssertion else { return }
        switch acquire() {
        case .notNeeded:
            return
        case .refused:
            throw AiSError("ais_background_time_exhausted")
        case .held(let release):
            activityRelease = release
            // Runs after every unit of work queued so far; later work takes a new assertion.
            queue.async {
                activityRelease = nil
                release()
            }
        }
    }
}

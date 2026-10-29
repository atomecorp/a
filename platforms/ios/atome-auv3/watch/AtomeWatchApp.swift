import SwiftUI
import WatchKit
import HealthKit

// The Apple Watch app of eVe. Zen: it shows nothing; it records the wrist's raw motion while an eVe
// session runs on the iPhone (WatchSensorSession.swift), started by the iPhone itself.
@main
struct AtomeWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup { Color.black.ignoresSafeArea() }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        WatchSensorSession.shared.activate()
    }

    // The iPhone started this app for its session (HKHealthStore.startWatchApp).
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WatchSensorSession.shared.workoutRequested(workoutConfiguration)
    }
}

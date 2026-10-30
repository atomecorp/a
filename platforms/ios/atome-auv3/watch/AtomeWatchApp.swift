import SwiftUI
import WatchKit
import HealthKit

// The Apple Watch app of eVe: the companion of the iPhone's Activité (WatchLink.swift, its screens WatchScreens.swift), and
// the wrist's raw motion and heart rate while an eVe session runs on the iPhone (WatchSensorSession.swift).
@main
struct AtomeWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup { WatchRootView(link: WatchLink.shared) }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        WatchSensorSession.shared.activate()
    }

    // Each time it shows, the iPhone's page says what to show.
    func applicationDidBecomeActive() {
        Task { @MainActor in WatchLink.shared.hello() }
    }

    // The iPhone started this app for its session (HKHealthStore.startWatchApp).
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        WatchSensorSession.shared.workoutRequested(workoutConfiguration)
    }
}

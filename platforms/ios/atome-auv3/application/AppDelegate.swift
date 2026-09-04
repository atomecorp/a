//
//  AppDelegate.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI
import UIKit

@main
struct atomeApp: App {
    @StateObject private var fileManager: iCloudFileManager
    @Environment(\.scenePhase) private var scenePhase

    init() {
        WebViewManager.resetBootTelemetry()
        _fileManager = StateObject(wrappedValue: iCloudFileManager.shared)
        WebViewManager.markBootMilestone("app_initialized")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    if !fileManager.isInitialized {
                        fileManager.initializeFileStructure()
                    }
                    // Inbox disabled: no initial flush
                }
                // Handle custom activation scheme (e.g., atomeapp://activate) from AUv3 nudge
                .onOpenURL { _ in /* inbox disabled */ }
                // Handle NSUserActivity-based activation (fallback path)
                .onContinueUserActivity(SharedBus.userActivityType) { _ in /* inbox disabled */ }
                // Also handle general web-browsing user activities (universal links)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { _ in /* inbox disabled */ }
        }
        // React to scene lifecycle to flush inbox only when foregroundActive
        .onChange(of: scenePhase) { newPhase in
            switch newPhase {
            case .active:
                break
            case .background, .inactive:
                ActiveScenePoller.shared.stop()
            @unknown default:
                break
            }
        }
    }
}

struct ContentView: View {
    var body: some View {
    WebViewContainer()
    }
}

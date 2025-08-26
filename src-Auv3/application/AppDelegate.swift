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
    @StateObject private var fileManager = iCloudFileManager.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Initialiser les fichiers au démarrage avec iCloudFileManager
        iCloudFileManager.shared.initializeFileStructure()
        // Start Darwin listener early so we can react to AUv3 relays even before UI appears
        DarwinNotificationListener.shared.start()
        // Try to recover any pending relayed URLs (if app launched after AUv3 posted)
        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    // Réinitialiser si nécessaire
                    if !fileManager.isInitialized {
                        fileManager.initializeFileStructure()
                    }
                    // Attempt an initial flush if we're already active
                    AppGroupOpenURLInbox.shared.flushIfPossible()
                }
                // Handle custom activation scheme (e.g., atomeapp://activate) from AUv3 nudge
                .onOpenURL { url in
                    if url.scheme == SharedBus.activationScheme {
                        print("🔗 SwiftUI.onOpenURL activation → drain + flush")
                        AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                        AppGroupOpenURLInbox.shared.flushIfPossible()
                    }
                }
                // Handle NSUserActivity-based activation (fallback path)
                .onContinueUserActivity(SharedBus.userActivityType) { _ in
                    print("🧭 SwiftUI.onContinueUserActivity → drain + flush")
                    AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                    AppGroupOpenURLInbox.shared.flushIfPossible()
                }
        }
        // React to scene lifecycle to flush inbox only when foregroundActive
        .onChange(of: scenePhase) { newPhase in
            switch newPhase {
            case .active:
                print("🟢 SwiftUI scenePhase active → start Darwin + drain + flush")
                DarwinNotificationListener.shared.start()
                ActiveScenePoller.shared.start()
                AppGroupOpenURLInbox.shared.drainPersistentIndexIfAny()
                AppGroupOpenURLInbox.shared.flushIfPossible()
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
            .ignoresSafeArea()
    }
}

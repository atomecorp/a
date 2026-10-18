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
    @UIApplicationDelegateAdaptor(AtomeApplicationDelegate.self) private var applicationDelegate
    @StateObject private var fileManager: iCloudFileManager

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
                    // The bundled page pulls pending authentication links when ready.
                }
                // Handle custom activation scheme (e.g., atomeapp://activate) from AUv3 nudge
                .onOpenURL { url in AuthLinkInbox.receive(url) }
                // Handle NSUserActivity-based activation (fallback path)
                .onContinueUserActivity(SharedBus.userActivityType) { _ in /* inbox disabled */ }
                // Also handle general web-browsing user activities (universal links)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { AuthLinkInbox.receive(url) }
                }
        }
    }
}

struct ContentView: View {
    // Restoration state of this window scene: see AppWorkspaceResume.
    @SceneStorage("atome.workspace.resume") private var workspaceResume = ""
    @ObservedObject private var resume = AppWorkspaceResume.shared

    var body: some View {
        WebViewContainer()
            .ignoresSafeArea(.container, edges: .all)
            .onAppear { resume.restore(workspaceResume) }
            .onChange(of: resume.stored) { _, value in workspaceResume = value }
    }
}

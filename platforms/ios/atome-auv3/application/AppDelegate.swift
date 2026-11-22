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
                // A file handed to atome (Ouvrir dans, Copier vers) goes to the shared files' inbox; any other URL to the links' inbox
                .onOpenURL { url in if !SharedFileInbox.receive(url) { AuthLinkInbox.receive(url) } }
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
    // The app's own window or a Follow window (ExternalDisplayFollowWindow.swift, an iPad with Stage Manager).
    @SceneStorage("atome.window.role") private var storedRole = ""
    @State private var role: AppWindowRole?
    @ObservedObject private var resume = AppWorkspaceResume.shared

    var body: some View {
        Group {
            switch role {
            case .app:
                WebViewContainer()
                    .onAppear { resume.restore(workspaceResume) }
                    .onChange(of: resume.stored) { _, value in workspaceResume = value }
            case .follow:
                ExternalDisplayFollowWindow()
            case nil:
                // The launch's own ground for the instant the role takes: no flash before the boot overlay.
                Color("LaunchBackground")
            }
        }
        .ignoresSafeArea(.container, edges: .all)
        .task {
            guard role == nil else { return }
            let claimed = await AppWindowRoles.shared.claim(stored: storedRole)
            storedRole = claimed.rawValue
            role = claimed
        }
        .onDisappear { AppWindowRoles.shared.release(role) }
    }
}

//
//  AppDelegate.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI

@main
struct atomeApp: App {
    @StateObject private var fileManager = MainAppFileManager.shared
    
    init() {
        // Initialiser les fichiers au démarrage
        MainAppFileManager.shared.initializeFileStructure()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    // Réinitialiser si nécessaire
                    if !fileManager.isInitialized {
                        fileManager.initializeFileStructure()
                    }
                }
        }
    }
}

struct ContentView: View {
    var body: some View {
        WebViewContainer()
            .edgesIgnoringSafeArea(.all)
    }
}

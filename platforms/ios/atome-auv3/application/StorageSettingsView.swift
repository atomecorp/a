//
//  StorageSettingsView.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import SwiftUI

struct StorageSettingsView: View {
    @StateObject private var fileManager = iCloudFileManager.shared
    @State private var showingMigrationAlert = false
    @State private var pendingMigrationToICloud = false
    @State private var migrationInProgress = false
    
    private var currentStorageType: String {
        UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? "iCloud" : "Local"
    }
    
    var body: some View {
        NavigationView {
            List {
                // Section status actuel
                Section("Stockage actuel") {
                    HStack {
                        Image(systemName: UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? "icloud" : "folder")
                            .foregroundColor(UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? .blue : .gray)
                        
                        VStack(alignment: .leading) {
                            Text(currentStorageType)
                                .font(.headline)
                            Text(UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? "Synchronisé entre vos appareils" : "Seulement sur cet appareil")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        if fileManager.syncEnabled {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                        }
                    }
                }
                
                // Section disponibilité iCloud
                Section("Disponibilité iCloud") {
                    HStack {
                        Image(systemName: fileManager.iCloudAvailable ? "checkmark.circle" : "xmark.circle")
                            .foregroundColor(fileManager.iCloudAvailable ? .green : .red)
                        
                        Text(fileManager.iCloudAvailable ? "iCloud disponible" : "iCloud indisponible")
                        
                        Spacer()
                    }
                }
                
                // Section actions
                Section("Actions") {
                    // Migrer vers iCloud
                    if !UserDefaults.standard.bool(forKey: "AtomeUseICloud") && fileManager.iCloudAvailable {
                        Button(action: {
                            pendingMigrationToICloud = true
                            showingMigrationAlert = true
                        }) {
                            HStack {
                                Image(systemName: "icloud.and.arrow.up")
                                Text("Migrer vers iCloud")
                                Spacer()
                            }
                        }
                        .disabled(migrationInProgress)
                    }
                    
                    // Migrer vers local
                    if UserDefaults.standard.bool(forKey: "AtomeUseICloud") {
                        Button(action: {
                            pendingMigrationToICloud = false
                            showingMigrationAlert = true
                        }) {
                            HStack {
                                Image(systemName: "folder.badge.arrow.down")
                                Text("Migrer vers stockage local")
                                Spacer()
                            }
                        }
                        .disabled(migrationInProgress)
                    }
                    
                    // Ouvrir dossier dans Fichiers
                    Button(action: openFilesApp) {
                        HStack {
                            Image(systemName: "folder")
                            Text("Ouvrir dans Fichiers")
                            Spacer()
                        }
                    }
                    
                    // Reconfigurer le stockage
                    Button(action: reconfigureStorage) {
                        HStack {
                            Image(systemName: "gear")
                            Text("Reconfigurer le stockage")
                            Spacer()
                        }
                    }
                }
                
                // Section informations
                Section("Informations") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("• Le stockage iCloud synchronise vos fichiers entre tous vos appareils Apple")
                        Text("• Le stockage local garde vos fichiers uniquement sur cet appareil")
                        Text("• Vous pouvez migrer vos données à tout moment")
                        Text("• La migration peut prendre quelques minutes selon la taille de vos données")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Stockage")
            .alert("Migration des données", isPresented: $showingMigrationAlert) {
                Button("Annuler", role: .cancel) { }
                Button("Migrer") {
                    performMigration()
                }
            } message: {
                Text(pendingMigrationToICloud ?
                     "Voulez-vous migrer vos données vers iCloud ? Cette opération peut prendre quelques minutes." :
                     "Voulez-vous migrer vos données vers le stockage local ? Vos fichiers ne seront plus synchronisés.")
            }
            .overlay {
                if migrationInProgress {
                    ZStack {
                        Color.black.opacity(0.3)
                            .ignoresSafeArea()
                        
                        VStack {
                            ProgressView()
                                .scaleEffect(1.5)
                            Text("Migration en cours...")
                                .padding(.top)
                        }
                        .padding()
                        .background(Color(.systemBackground))
                        .cornerRadius(12)
                    }
                }
            }
        }
    }
    
    private func performMigration() {
        migrationInProgress = true
        
        if pendingMigrationToICloud {
            fileManager.migrateToiCloud { success in
                DispatchQueue.main.async {
                    migrationInProgress = false
                    if success {
                        // Migration réussie
                    } else {
                        // Gérer l'erreur
                    }
                }
            }
        } else {
            fileManager.migrateToLocal { success in
                DispatchQueue.main.async {
                    migrationInProgress = false
                    if success {
                        // Migration réussie
                    } else {
                        // Gérer l'erreur
                    }
                }
            }
        }
    }
    
    private func openFilesApp() {
        guard let storageURL = fileManager.getCurrentStorageURL() else { return }
        
        if UIApplication.shared.canOpenURL(storageURL) {
            UIApplication.shared.open(storageURL)
        }
    }
    
    private func reconfigureStorage() {
        UserDefaults.standard.set(false, forKey: "AtomeStorageChoiceMade")
        
        // Redémarrer l'app ou montrer le setup à nouveau
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first {
            
            let storageSetupVC = StorageSetupViewController()
            let nav = UINavigationController(rootViewController: storageSetupVC)
            nav.modalPresentationStyle = .fullScreen
            
            window.rootViewController?.present(nav, animated: true)
        }
    }
}

// MARK: - Preview
struct StorageSettingsView_Previews: PreviewProvider {
    static var previews: some View {
        StorageSettingsView()
    }
}

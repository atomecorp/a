//
//  iCloudFileManager.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import Foundation
import UIKit

public class iCloudFileManager: ObservableObject {
    public static let shared = iCloudFileManager()
    
    @Published public var isInitialized = false
    @Published public var iCloudAvailable = false
    @Published public var syncEnabled = false
    
    private init() {
        checkiCloudAvailability()
    }
    
    // MARK: - iCloud Availability Check
    private func checkiCloudAvailability() {
        if let _ = FileManager.default.ubiquityIdentityToken {
            iCloudAvailable = true
            print("📱 iCloud is available")
        } else {
            iCloudAvailable = false
            print("⚠️ iCloud is not available or user not logged in")
        }
    }
    
    // MARK: - Directory URLs
    private func getLocalDocumentsDirectory() -> URL {
        // Déterminer si on est dans l'extension AUv3 ou l'app principale
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        let isAUv3Extension = bundleIdentifier.contains(".appex")
        
        if isAUv3Extension {
            // Pour l'extension AUv3 : utiliser App Groups pour partager avec l'app
            if let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one") {
                let documentsURL = groupURL.appendingPathComponent("Documents")
                print("📁 [AUv3] App Groups Documents directory: \(documentsURL.path)")
                return documentsURL
            } else {
                print("⚠️ [AUv3] App Groups non disponible, fallback vers Documents privé")
                let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
                return paths[0]
            }
        } else {
            // Pour l'app principale : utiliser Documents standard (visible dans Files)
            let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
            let documentsURL = paths[0]
            print("📁 [App] Standard Documents directory: \(documentsURL.path)")
            return documentsURL
        }
    }
    
    private func getiCloudDocumentsDirectory() -> URL? {
        guard let iCloudURL = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
            print("❌ Could not get iCloud container URL")
            return nil
        }
        return iCloudURL.appendingPathComponent("Documents")
    }
    
    // MARK: - User Choice for Storage Location
    public func presentStorageLocationChoice(from viewController: UIViewController, completion: @escaping (Bool) -> Void) {
        let alert = UIAlertController(
            title: "Choisir l'emplacement de stockage",
            message: "Où souhaitez-vous stocker vos fichiers Atome ?",
            preferredStyle: .alert
        )
        
        // Option locale
        alert.addAction(UIAlertAction(title: "Sur cet appareil uniquement", style: .default) { _ in
            UserDefaults.standard.set(false, forKey: "AtomeUseICloud")
            self.syncEnabled = false
            self.initializeLocalFileStructure()
            completion(false)
        })
        
        // Option iCloud (si disponible)
        if iCloudAvailable {
            alert.addAction(UIAlertAction(title: "iCloud (synchronisé)", style: .default) { _ in
                UserDefaults.standard.set(true, forKey: "AtomeUseICloud")
                self.syncEnabled = true
                self.initializeiCloudFileStructure()
                completion(true)
            })
        }
        
        // Option pour changer plus tard
        alert.addAction(UIAlertAction(title: "Décider plus tard", style: .cancel) { _ in
            completion(false)
        })
        
        viewController.present(alert, animated: true)
    }
    
    // MARK: - File Structure Initialization
    public func initializeFileStructure() {
        let useICloud = UserDefaults.standard.bool(forKey: "AtomeUseICloud")
        
        if useICloud && iCloudAvailable {
            initializeiCloudFileStructure()
        } else {
            initializeLocalFileStructure()
        }
    }
    
    private func initializeLocalFileStructure() {
        print("=== INITIALIZING LOCAL FILE STRUCTURE ===")
        
        let documentsURL = getLocalDocumentsDirectory()
        
        // Créer le dossier Documents s'il n'existe pas (pour App Groups)
        do {
            try FileManager.default.createDirectory(at: documentsURL, withIntermediateDirectories: true, attributes: nil)
        } catch {
            print("⚠️ Error creating Documents directory: \(error)")
        }
        
        // Utiliser directement Documents - PAS de sous-dossier AtomeFiles
        let baseURL = documentsURL
        
        createDirectoryStructure(at: baseURL, isLocal: true)
    }
    
    private func initializeiCloudFileStructure() {
        print("=== INITIALIZING ICLOUD FILE STRUCTURE ===")
        
        guard let iCloudURL = getiCloudDocumentsDirectory() else {
            print("❌ iCloud not available, falling back to local storage")
            initializeLocalFileStructure()
            return
        }
        
        // Utiliser directement iCloud Documents - PAS de sous-dossier AtomeFiles
        let baseURL = iCloudURL
        
        createDirectoryStructure(at: baseURL, isLocal: false)
    }
    
    private func createDirectoryStructure(at baseURL: URL, isLocal: Bool) {
        print("📂 Creating directory structure at: \(baseURL.path)")
        
        do {
            let fileManager = FileManager.default
            
            // Le dossier Documents existe déjà - ne pas créer AtomeFiles
            // Juste créer les sous-dossiers directement dans Documents
            
            // For iCloud, start downloading if needed
            if !isLocal {
                var resourceValues = URLResourceValues()
                resourceValues.hasHiddenExtension = false
                var mutableURL = baseURL
                try mutableURL.setResourceValues(resourceValues)
                try fileManager.startDownloadingUbiquitousItem(at: baseURL)
            }
            
            // Make directory visible in Files app
            makeDirectoryVisibleInFiles(baseURL)
            
            // Create subdirectories directement dans Documents
            let subdirectories = ["Projects", "Exports", "Recordings", "Templates"]
            for subdirectory in subdirectories {
                let subdirectoryURL = baseURL.appendingPathComponent(subdirectory, isDirectory: true)
                if !fileManager.fileExists(atPath: subdirectoryURL.path) {
                    try fileManager.createDirectory(
                        at: subdirectoryURL,
                        withIntermediateDirectories: true,
                        attributes: [FileAttributeKey.posixPermissions: 0o755]
                    )
                    makeDirectoryVisibleInFiles(subdirectoryURL)
                    print("📁 Created subdirectory: \(subdirectory)")
                    
                    if !isLocal {
                        try fileManager.startDownloadingUbiquitousItem(at: subdirectoryURL)
                    }
                }
            }
            
            // Create welcome file directement dans Documents
            createWelcomeFile(at: baseURL, isLocal: isLocal)
            
            isInitialized = true
            syncEnabled = !isLocal
            print("✅ File structure initialization successful (\(isLocal ? "Local" : "iCloud"))")
            
        } catch {
            print("❌ Error during initialization: \(error)")
        }
    }
    
    private func createWelcomeFile(at baseURL: URL, isLocal: Bool) {
        let welcomeFileURL = baseURL.appendingPathComponent("README.txt")
        let storageType = isLocal ? "localement sur votre appareil" : "dans iCloud et synchronisé"
        
        let welcomeContent = """
        Bienvenue dans Atome!
        
        Ce dossier contient vos fichiers Atome.
        
        Vos fichiers sont stockés \(storageType).
        
        Structure des dossiers:
        - Projects: Stockez vos fichiers de projets (.atome)
        - Exports: Trouvez vos fichiers exportés
        - Recordings: Accédez à vos enregistrements audio
        - Templates: Modèles et présets
        
        Créé le: \(Date())
        Type de stockage: \(isLocal ? "Local" : "iCloud")
        """
        
        do {
            if !FileManager.default.fileExists(atPath: welcomeFileURL.path) {
                try welcomeContent.write(to: welcomeFileURL, atomically: true, encoding: .utf8)
                
                if !isLocal {
                    try FileManager.default.startDownloadingUbiquitousItem(at: welcomeFileURL)
                }
                
                print("📄 README.txt file created")
            }
        } catch {
            print("⚠️ Error creating welcome file: \(error)")
        }
    }
    
    private func makeDirectoryVisibleInFiles(_ url: URL) {
        do {
            // Set directory attributes
            try FileManager.default.setAttributes([
                .posixPermissions: 0o755
            ], ofItemAtPath: url.path)
            
            // Ensure not excluded from backup (for local files)
            if !syncEnabled {
                var resourceValues = URLResourceValues()
                resourceValues.isExcludedFromBackup = false
                var urlForAttributes = url
                try urlForAttributes.setResourceValues(resourceValues)
            }
        } catch {
            print("⚠️ Error making directory visible: \(error)")
        }
    }
    
    // MARK: - File Operations
    public func getCurrentStorageURL() -> URL? {
        let useICloud = UserDefaults.standard.bool(forKey: "AtomeUseICloud")
        
        if useICloud && iCloudAvailable {
            // Pas de sous-dossier AtomeFiles pour iCloud
            return getiCloudDocumentsDirectory()
        } else {
            // Pour Files app, utiliser directement Documents sans sous-dossier
            return getLocalDocumentsDirectory()
        }
    }
    
    public func saveFile(data: Data, to relativePath: String, completion: @escaping (Bool, Error?) -> Void) {
        guard let baseURL = getCurrentStorageURL() else {
            completion(false, NSError(domain: "iCloudFileManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Storage URL not available"]))
            return
        }
        
        let fileURL = baseURL.appendingPathComponent(relativePath)
        print("💾 iCloudFileManager sauvegarde vers: \(fileURL.path)")
        
        do {
            // Create intermediate directories if needed
            let directoryURL = fileURL.deletingLastPathComponent()
            print("📁 Création du dossier: \(directoryURL.path)")
            try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true, attributes: nil)
            
            // Write the file
            try data.write(to: fileURL)
            print("✅ Fichier sauvegardé dans: \(fileURL.path)")
            
            // For iCloud files, start uploading
            if syncEnabled {
                try FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
                print("☁️ iCloud sync démarré pour: \(fileURL.lastPathComponent)")
            }
            
            completion(true, nil)
        } catch {
            print("❌ Erreur sauvegarde iCloud: \(error)")
            completion(false, error)
        }
    }
    
    public func loadFile(from relativePath: String, completion: @escaping (Data?, Error?) -> Void) {
        guard let baseURL = getCurrentStorageURL() else {
            completion(nil, NSError(domain: "iCloudFileManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Storage URL not available"]))
            return
        }
        
        let fileURL = baseURL.appendingPathComponent(relativePath)
        
        // For iCloud files, ensure they're downloaded first
        if syncEnabled {
            do {
                try FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
            } catch {
                print("⚠️ Could not start downloading iCloud file: \(error)")
            }
        }
        
        do {
            let data = try Data(contentsOf: fileURL)
            completion(data, nil)
        } catch {
            completion(nil, error)
        }
    }
    
    // MARK: - Migration between Local and iCloud
    public func migrateToiCloud(completion: @escaping (Bool) -> Void) {
        guard iCloudAvailable else {
            completion(false)
            return
        }
        
        let localURL = getLocalDocumentsDirectory()
        guard let iCloudURL = getiCloudDocumentsDirectory() else {
            completion(false)
            return
        }
        
        do {
            if FileManager.default.fileExists(atPath: localURL.path) {
                // Copy files to iCloud (sans sous-dossier AtomeFiles)
                try FileManager.default.copyItem(at: localURL, to: iCloudURL)
                
                // Start iCloud sync
                try FileManager.default.startDownloadingUbiquitousItem(at: iCloudURL)
                
                UserDefaults.standard.set(true, forKey: "AtomeUseICloud")
                syncEnabled = true
                
                completion(true)
            } else {
                initializeiCloudFileStructure()
                completion(true)
            }
        } catch {
            print("❌ Migration to iCloud failed: \(error)")
            completion(false)
        }
    }
    
    public func migrateToLocal(completion: @escaping (Bool) -> Void) {
        guard let iCloudURL = getiCloudDocumentsDirectory() else {
            completion(false)
            return
        }
        
        let localURL = getLocalDocumentsDirectory()
        
        do {
            if FileManager.default.fileExists(atPath: iCloudURL.path) {
                // Download all iCloud files first
                try FileManager.default.startDownloadingUbiquitousItem(at: iCloudURL)
                
                // Copy to local (sans sous-dossier AtomeFiles)
                if FileManager.default.fileExists(atPath: localURL.path) {
                    try FileManager.default.removeItem(at: localURL)
                }
                try FileManager.default.copyItem(at: iCloudURL, to: localURL)
                
                UserDefaults.standard.set(false, forKey: "AtomeUseICloud")
                syncEnabled = false
                
                completion(true)
            } else {
                initializeLocalFileStructure()
                completion(true)
            }
        } catch {
            print("❌ Migration to local failed: \(error)")
            completion(false)
        }
    }
}

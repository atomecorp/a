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
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0]
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
        let atomeFilesURL = documentsURL.appendingPathComponent("AtomeFiles", isDirectory: true)
        
        createDirectoryStructure(at: atomeFilesURL, isLocal: true)
    }
    
    private func initializeiCloudFileStructure() {
        print("=== INITIALIZING ICLOUD FILE STRUCTURE ===")
        
        guard let iCloudURL = getiCloudDocumentsDirectory() else {
            print("❌ iCloud not available, falling back to local storage")
            initializeLocalFileStructure()
            return
        }
        
        let atomeFilesURL = iCloudURL.appendingPathComponent("AtomeFiles", isDirectory: true)
        
        createDirectoryStructure(at: atomeFilesURL, isLocal: false)
    }
    
    private func createDirectoryStructure(at baseURL: URL, isLocal: Bool) {
        print("📂 Creating directory structure at: \(baseURL.path)")
        
        do {
            let fileManager = FileManager.default
            
            // Create main directory
            if !fileManager.fileExists(atPath: baseURL.path) {
                try fileManager.createDirectory(
                    at: baseURL,
                    withIntermediateDirectories: true,
                    attributes: [FileAttributeKey.posixPermissions: 0o755]
                )
                print("📁 AtomeFiles directory created")
            }
            
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
            
            // Create subdirectories
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
                    
                    if !isLocal {
                        try fileManager.startDownloadingUbiquitousItem(at: subdirectoryURL)
                    }
                }
            }
            
            // Create welcome file
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
        
        Ce dossier est accessible via l'app Fichiers de votre appareil.
        Vous le trouverez sous "\(isLocal ? "Sur mon iPad/iPhone" : "iCloud Drive")" > "Atome".
        
        Vos fichiers sont stockés \(storageType).
        
        Structure des dossiers:
        - Projects: Stockez vos fichiers de projets
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
            return getiCloudDocumentsDirectory()?.appendingPathComponent("AtomeFiles")
        } else {
            return getLocalDocumentsDirectory().appendingPathComponent("AtomeFiles")
        }
    }
    
    public func saveFile(data: Data, to relativePath: String, completion: @escaping (Bool, Error?) -> Void) {
        guard let baseURL = getCurrentStorageURL() else {
            completion(false, NSError(domain: "iCloudFileManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Storage URL not available"]))
            return
        }
        
        let fileURL = baseURL.appendingPathComponent(relativePath)
        
        do {
            // Create intermediate directories if needed
            let directoryURL = fileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true, attributes: nil)
            
            // Write the file
            try data.write(to: fileURL)
            
            // For iCloud files, start uploading
            if syncEnabled {
                try FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
            }
            
            completion(true, nil)
        } catch {
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
        
        let localURL = getLocalDocumentsDirectory().appendingPathComponent("AtomeFiles")
        guard let iCloudURL = getiCloudDocumentsDirectory()?.appendingPathComponent("AtomeFiles") else {
            completion(false)
            return
        }
        
        do {
            if FileManager.default.fileExists(atPath: localURL.path) {
                // Copy files to iCloud
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
        guard let iCloudURL = getiCloudDocumentsDirectory()?.appendingPathComponent("AtomeFiles") else {
            completion(false)
            return
        }
        
        let localURL = getLocalDocumentsDirectory().appendingPathComponent("AtomeFiles")
        
        do {
            if FileManager.default.fileExists(atPath: iCloudURL.path) {
                // Download all iCloud files first
                try FileManager.default.startDownloadingUbiquitousItem(at: iCloudURL)
                
                // Copy to local
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

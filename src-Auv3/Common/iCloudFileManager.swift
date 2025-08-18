//
//  iCloudFileManager.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import Foundation
import UIKit
import UniformTypeIdentifiers

public class iCloudFileManager: ObservableObject {
    public static let shared = iCloudFileManager()
    
    @Published public var isInitialized = false
    @Published public var iCloudAvailable = false
    @Published public var syncEnabled = false
    
    // Pour stocker le delegate du Document Picker
    private var documentPickerDelegate: DocumentPickerDelegate?
    private var documentPickerLoadDelegate: DocumentPickerLoadDelegate?
    // Persisté pour ne pas redemander à chaque lancement
    private var fileAccessGrantedOnce: Bool = UserDefaults.standard.bool(forKey: "AtomeFileAccessGranted")
    
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
            // Pour l'extension AUv3 : utiliser App Groups MAIS synchroniser vers Documents visible
            if let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one") {
                let documentsURL = groupURL.appendingPathComponent("Documents")
                print("📁 [AUv3] App Groups Documents directory: \(documentsURL.path)")
                return documentsURL
            } else {
                print("⚠️ [AUv3] App Groups non disponible, fallback vers Documents standard")
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
        
        // Si c'est l'app principale, synchroniser les fichiers depuis App Groups
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        let isApp = !bundleIdentifier.contains(".appex")
        if isApp {
            // Première passe : AppGroup -> Visible
            syncFromAppGroupsToVisibleDocuments()
            // Deuxième passe : Visible -> AppGroup (pour récupérer les fichiers déjà présents côté app)
            syncFromVisibleDocumentsToAppGroups()
        }
        // Lancer sync globale après init (newest-wins sur les 2-3 racines)
        FileSyncCoordinator.shared.syncAll(force: true)
        // Démarrer l'auto-sync (toutes les ~10s) seulement côté app principale pour limiter la charge
        if isApp { FileSyncCoordinator.shared.startAutoSync(every: 10) }
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
            
            // Pour éviter l'avertissement SwiftUI publier pendant update de vue, poster sur le main thread
            DispatchQueue.main.async {
                self.isInitialized = true
                self.syncEnabled = !isLocal
            }
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
            
            // Si c'est une extension AUv3, aussi copier vers Documents visible
            let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
            if bundleIdentifier.contains(".appex") {
                copyFileToVisibleDocuments(from: fileURL, relativePath: relativePath)
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
    
    // MARK: - Document Picker pour AUv3
    public func saveFileWithDocumentPicker(data: Data, fileName: String, from viewController: UIViewController, completion: @escaping (Bool, Error?) -> Void) {
        print("🔥 SWIFT: saveFileWithDocumentPicker appelé")
        print("🔥 SWIFT: fileName = \(fileName), data.count = \(data.count)")
        print("🔥 SWIFT: viewController = \(type(of: viewController))")
        
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        print("🔥 SWIFT: bundleIdentifier = \(bundleIdentifier)")
        
        // FORCER l'utilisation du Document Picker iOS dans tous les cas
        print("🔥 SWIFT: FORCER Document Picker iOS - toujours présenter à l'utilisateur")
        
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        print("🔥 SWIFT: tempURL = \(tempURL)")
        
        do {
            try data.write(to: tempURL)
            print("🔥 SWIFT: Fichier temporaire écrit avec succès")
            
            // Stocker le delegate pour éviter qu'il soit libéré
            self.documentPickerDelegate = DocumentPickerDelegate { [weak self] success, error in
                print("🔥 SWIFT: DocumentPickerDelegate callback - success: \(success), error: \(String(describing: error))")
                self?.documentPickerDelegate = nil // Libérer après utilisation
                completion(success, error)
            }
            
            print("🔥 SWIFT: DocumentPickerDelegate créé")
            
            // Replace creation to enable rename/edit inside picker
            let documentPicker: UIDocumentPickerViewController
            if #available(iOS 16.0, *) {
                documentPicker = UIDocumentPickerViewController(forExporting: [tempURL], asCopy: true)
            } else {
                documentPicker = UIDocumentPickerViewController(forExporting: [tempURL])
            }
            // NOTE: allowsEditing not available on this iOS version; forExporting already lets user rename before saving.
            documentPicker.shouldShowFileExtensions = true
            
            documentPicker.delegate = self.documentPickerDelegate
            documentPicker.modalPresentationStyle = .formSheet
            
            print("🔥 SWIFT: Tentative de présentation du Document Picker...")
            
            DispatchQueue.main.async {
                print("🔥 SWIFT: Sur main thread - présentation du Document Picker")
                viewController.present(documentPicker, animated: true) {
                    print("🔥 SWIFT: Document Picker présenté avec succès !")
                    print("📄 SWIFT: Le Document Picker iOS devrait maintenant être visible")
                }
            }
            
        } catch {
            print("❌ SWIFT: Erreur écriture fichier temporaire: \(error)")
            completion(false, error)
        }
    }
    
    // MARK: - Document Picker pour charger des fichiers AUv3
    public func loadFileWithDocumentPicker(fileTypes: [String], from viewController: UIViewController, completion: @escaping (Bool, Data?, String?, Error?) -> Void) {
        print("🔥 SWIFT: loadFileWithDocumentPicker appelé")
        print("🔥 SWIFT: fileTypes = \(fileTypes)")
        print("🔥 SWIFT: viewController = \(type(of: viewController))")
        
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        print("🔥 SWIFT: bundleIdentifier = \(bundleIdentifier)")
        
        // ÉTAPE CRITIQUE : Demander l'autorisation d'accès aux fichiers
        if fileAccessGrantedOnce {
            print("🔐 SWIFT: Permission déjà accordée précédemment – skip alerte")
            DispatchQueue.main.async {
                self.proceedWithDocumentPicker(fileTypes: fileTypes, from: viewController, completion: completion)
            }
        } else {
            print("🔐 SWIFT: Demande d'autorisation d'accès aux fichiers...")
            self.requestFileAccessPermission(from: viewController) { [weak self] granted in
                guard let self = self else { return }
                guard granted else {
                    print("❌ SWIFT: Autorisation d'accès aux fichiers refusée")
                    completion(false, nil, nil, NSError(domain: "FileAccess", code: -1, userInfo: [NSLocalizedDescriptionKey: "L'autorisation d'accès aux fichiers est requise"]))
                    return
                }
                self.fileAccessGrantedOnce = true
                print("✅ SWIFT: Autorisation d'accès aux fichiers accordée (will present picker après petit délai)")
                // Délai pour laisser l'alerte se dismiss proprement avant de présenter le picker
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    self.proceedWithDocumentPicker(fileTypes: fileTypes, from: viewController, completion: completion)
                }
            }
        }
    }

    // MARK: - Multiple files loader
    public func loadFilesWithDocumentPicker(fileTypes: [String], from viewController: UIViewController, completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) {
        print("🔥 SWIFT: loadFilesWithDocumentPicker (multiple) appelé")
        if fileAccessGrantedOnce {
            DispatchQueue.main.async { self.proceedWithMultipleDocumentPicker(fileTypes: fileTypes, from: viewController, completion: completion) }
        } else {
            self.requestFileAccessPermission(from: viewController) { [weak self] granted in
                guard let self = self else { return }
                guard granted else { completion(false, nil, NSError(domain: "FileAccess", code: -1, userInfo: [NSLocalizedDescriptionKey: "Permission requise"])) ; return }
                self.fileAccessGrantedOnce = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    self.proceedWithMultipleDocumentPicker(fileTypes: fileTypes, from: viewController, completion: completion)
                }
            }
        }
    }

    // MARK: - Import direct: picker -> stockage local (avec option renommage)
    public func importFileToRelativePath(fileTypes: [String], requestedDestPath: String, from viewController: UIViewController, completion: @escaping (Bool, String?, Error?) -> Void) {
        print("📥 SWIFT: importFileToRelativePath demandé dest='\(requestedDestPath)' types=\(fileTypes)")
        self.loadFileWithDocumentPicker(fileTypes: fileTypes, from: viewController) { [weak self] success, data, originalName, error in
            guard let self = self else { return }
            guard success, let data = data, let originalName = originalName else {
                completion(false, nil, error ?? NSError(domain: "Import", code: -2, userInfo: [NSLocalizedDescriptionKey:"Selection échouée"]))
                return
            }
            let finalRelPath = self.normalizeDestination(originalName: originalName, requested: requestedDestPath)
            print("📥 SWIFT: Import -> sauvegarde sous relPath='\(finalRelPath)'")
            self.saveFile(data: data, to: finalRelPath) { ok, saveErr in
                completion(ok, ok ? finalRelPath : nil, saveErr)
            }
        }
    }

    // MARK: - Import multiple vers un dossier
    public func importFilesToRelativeFolder(fileTypes: [String], requestedDestPath: String, from viewController: UIViewController, completion: @escaping (Bool, [String]?, Error?) -> Void) {
        print("📥 SWIFT: importFilesToRelativeFolder demandé dest='\(requestedDestPath)' types=\(fileTypes)")
        self.loadFilesWithDocumentPicker(fileTypes: fileTypes, from: viewController) { [weak self] success, results, error in
            guard let self = self else { return }
            guard success, let results = results, !results.isEmpty else {
                completion(false, nil, error ?? NSError(domain: "ImportMultiple", code: -3, userInfo: [NSLocalizedDescriptionKey:"Aucun fichier sélectionné"]))
                return
            }
            let folder = self.normalizeFolderDestination(requested: requestedDestPath)
            print("📥 SWIFT: Dossier destination normalisé = '\(folder)' (vide -> racine)")
            var saved: [String] = []
            var lastError: Error?
            let group = DispatchGroup()
            for (name,data) in results {
                let relPath = folder.isEmpty ? name : folder + "/" + name
                group.enter()
                self.saveFile(data: data, to: relPath) { ok, err in
                    if ok { saved.append(relPath) } else { lastError = err }
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                if saved.isEmpty { completion(false, nil, lastError ?? NSError(domain: "ImportMultiple", code: -4, userInfo: [NSLocalizedDescriptionKey:"Echec copie"])) }
                else { completion(true, saved, lastError) }
            }
        }
    }

    private func normalizeDestination(originalName: String, requested: String) -> String {
        var req = requested.trimmingCharacters(in: .whitespacesAndNewlines)
        if req.hasPrefix("./") { req.removeFirst(2) }
        if req == "." { req = "" }
        if req.isEmpty { return originalName }
        if req.hasSuffix("/") { return req + originalName }
        // S'il y a un chemin complet, déterminer si dernier composant a une extension
        let last = (req as NSString).lastPathComponent
        if last.contains(".") { return req } // suppose que c'est un nom de fichier complet
        // Sinon traiter comme dossier
        return req + "/" + originalName
    }

    private func normalizeFolderDestination(requested: String) -> String {
        var req = requested.trimmingCharacters(in: .whitespacesAndNewlines)
        if req.hasPrefix("./") { req.removeFirst(2) }
        if req == "." { return "" }
        if req.isEmpty { return "" }
        // Si fourni un chemin qui ressemble à un fichier (a une extension) on prend juste son dossier parent
        let last = (req as NSString).lastPathComponent
        if last.contains(".") { return ((req as NSString).deletingLastPathComponent) }
        return req.hasSuffix("/") ? String(req.dropLast()) : req
    }
    
    // MARK: - Demande d'autorisation d'accès aux fichiers
    private func requestFileAccessPermission(from viewController: UIViewController, completion: @escaping (Bool) -> Void) {
        if fileAccessGrantedOnce {
            print("🔐 SWIFT: requestFileAccessPermission – déjà accordée")
            completion(true)
            return
        }
        print("🔐 SWIFT: Présentation de la demande d'autorisation...")
        let alert = UIAlertController(
            title: "Accès aux fichiers",
            message: "Atome va ouvrir le sélecteur de fichiers iOS pour choisir un fichier audio ou projet. Cette étape ne sera demandée qu'une seule fois (réinitialisable).",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Continuer", style: .default) { [weak self] _ in
            print("✅ SWIFT: Utilisateur a accepté - ouverture Document Picker (après dismissal)")
            self?.fileAccessGrantedOnce = true
            UserDefaults.standard.set(true, forKey: "AtomeFileAccessGranted")
            completion(true)
        })
        
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in
            print("❌ SWIFT: Utilisateur a annulé la demande d'autorisation")
            completion(false)
        })
        
        DispatchQueue.main.async {
            viewController.present(alert, animated: true)
        }
    }

    // Réinitialiser l'autorisation personnalisée (pas une permission système, juste notre flag interne)
    public func resetFileAccessPermission() {
        print("🔄 SWIFT: resetFileAccessPermission appelé")
        fileAccessGrantedOnce = false
        UserDefaults.standard.removeObject(forKey: "AtomeFileAccessGranted")
    }
    
    // MARK: - Procéder avec le Document Picker après autorisation
    private func proceedWithDocumentPicker(fileTypes: [String], from viewController: UIViewController, completion: @escaping (Bool, Data?, String?, Error?) -> Void) {
        print("🔥 SWIFT: proceedWithDocumentPicker (contexte unifié app/extension)")
        // Stocker le delegate pour éviter qu'il soit libéré
        self.documentPickerLoadDelegate = DocumentPickerLoadDelegate { [weak self] success, data, fileName, error in
            print("🔥 SWIFT: DocumentPickerLoadDelegate callback - success: \(success), fileName: \(fileName ?? "nil"), error: \(String(describing: error))")
            self?.documentPickerLoadDelegate = nil // Libérer après utilisation
            completion(success, data, fileName, error)
        }
        print("🔥 SWIFT: DocumentPickerLoadDelegate créé")
        // Créer UTTypes
        var utTypes: [UTType] = []
        for fileType in fileTypes {
            switch fileType.lowercased() {
            case "atome":
                if let atomeType = UTType("one.atome.app.atome-project") { utTypes.append(atomeType); print("🔥 SWIFT: UTType personnalisé 'atome'") }
                else if let genericAtome = UTType(filenameExtension: "atome") { utTypes.append(genericAtome); print("🔥 SWIFT: UTType générique 'atome'") }
                else { utTypes.append(.data) }
            case "json": utTypes.append(.json)
            case "txt": utTypes.append(.text)
            case "m4a": if let t = UTType(filenameExtension: "m4a") { utTypes.append(t) } else { utTypes.append(.mpeg4Audio) }
            case "mp3": if #available(iOS 15.0, *) { utTypes.append(UTType.mp3) } else { utTypes.append(.audio) }
            case "wav": if #available(iOS 15.0, *) { utTypes.append(UTType.wav) } else { utTypes.append(.audio) }
            default: utTypes.append(.data)
            }
        }
        utTypes.append(.audio)
        utTypes.append(.data)
        utTypes.append(.item)
        utTypes.append(.content)
        print("🔥 SWIFT: Types UTType créés: \(utTypes)")
        let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: utTypes)
        documentPicker.delegate = self.documentPickerLoadDelegate
        documentPicker.modalPresentationStyle = .fullScreen
        documentPicker.allowsMultipleSelection = false
        documentPicker.shouldShowFileExtensions = true
        print("🔥 SWIFT: DocumentPickerViewController prêt (unifié)")
        DispatchQueue.main.async {
            print("🔥 SWIFT: Présentation du Document Picker (unifié)")
            viewController.present(documentPicker, animated: true) {
                print("� SWIFT: Document Picker visible (app ou extension)")
            }
        }
    }
    private func proceedWithMultipleDocumentPicker(fileTypes: [String], from viewController: UIViewController, completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) {
        print("🔥 SWIFT: proceedWithMultipleDocumentPicker")
        let multipleDelegate = DocumentPickerLoadMultipleDelegate { success, results, error in
            completion(success, results, error)
        }
        // Retenir via objc_setAssociatedObject sur viewController pour durée de vie
        objc_setAssociatedObject(viewController, "DocumentPickerLoadMultipleDelegate", multipleDelegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        var utTypes: [UTType] = []
        for fileType in fileTypes {
            switch fileType.lowercased() {
            case "atome": if let t = UTType("one.atome.app.atome-project") ?? UTType(filenameExtension: "atome") { utTypes.append(t) } else { utTypes.append(.data) }
            case "json": utTypes.append(.json)
            case "txt": utTypes.append(.text)
            case "m4a": if let t = UTType(filenameExtension: "m4a") { utTypes.append(t) } else { utTypes.append(.mpeg4Audio) }
            case "mp3": if #available(iOS 15.0, *) { utTypes.append(UTType.mp3) } else { utTypes.append(.audio) }
            case "wav": if #available(iOS 15.0, *) { utTypes.append(UTType.wav) } else { utTypes.append(.audio) }
            default: utTypes.append(.data)
            }
        }
        utTypes.append(contentsOf: [.audio, .data, .item, .content])
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: utTypes)
        picker.delegate = multipleDelegate
        picker.allowsMultipleSelection = true
        picker.shouldShowFileExtensions = true
        picker.modalPresentationStyle = .fullScreen
        DispatchQueue.main.async { viewController.present(picker, animated: true) }
    }
    // MARK: - Helpers présentation picker
    private func topViewController(from root: UIViewController?) -> UIViewController? {
        guard let root = root else { return nil }
        if let presented = root.presentedViewController { return topViewController(from: presented) }
        if let nav = root as? UINavigationController { return topViewController(from: nav.visibleViewController) }
        if let tab = root as? UITabBarController { return topViewController(from: tab.selectedViewController) }
        return root
    }
    private func presentDocumentPickerSafely(_ picker: UIDocumentPickerViewController, from baseVC: UIViewController) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if baseVC.presentedViewController is UIDocumentPickerViewController { print("⚠️ SWIFT: Picker déjà présenté"); return }
            let top = self.topViewController(from: baseVC) ?? baseVC
            if let presented = top.presentedViewController, presented is UIAlertController {
                print("⏳ SWIFT: Alerte encore affichée, retry dans 0.3s")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in self?.presentDocumentPickerSafely(picker, from: baseVC) }
                return
            }
            print("🔥 SWIFT: Présentation Document Picker depuis: \(type(of: top)))")
            top.present(picker, animated: true) { print("📱 SWIFT: Document Picker visible (confirmé)") }
        }
    }
    
    // MARK: - App Groups Synchronization
    private func syncFromAppGroupsToVisibleDocuments() {
        print("🔄 Synchronisation depuis App Groups vers Documents visible...")
        
        guard let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one") else {
            print("❌ App Groups non disponible pour synchronisation")
            return
        }
        
        let appGroupDocuments = groupURL.appendingPathComponent("Documents")
        let visibleDocuments = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        
        // Vérifier si App Groups contient des fichiers
        guard FileManager.default.fileExists(atPath: appGroupDocuments.path) else {
            print("📂 Aucun fichier App Groups à synchroniser")
            return
        }
        
        do {
            let fileManager = FileManager.default
            let folders = ["Projects", "Exports", "Recordings", "Templates"]
            
            for folder in folders {
                let sourceFolder = appGroupDocuments.appendingPathComponent(folder)
                let destFolder = visibleDocuments.appendingPathComponent(folder)
                
                if fileManager.fileExists(atPath: sourceFolder.path) {
                    // Créer le dossier de destination s'il n'existe pas
                    if !fileManager.fileExists(atPath: destFolder.path) {
                        try fileManager.createDirectory(at: destFolder, withIntermediateDirectories: true, attributes: nil)
                    }
                    
                    // Copier tous les fichiers du dossier source vers destination
                    let sourceContents = try fileManager.contentsOfDirectory(at: sourceFolder, includingPropertiesForKeys: nil)
                    
                    for sourceFile in sourceContents {
                        let destFile = destFolder.appendingPathComponent(sourceFile.lastPathComponent)
                        
                        // Ne copier que si le fichier n'existe pas déjà ou est plus récent
                        var shouldCopy = false
                        
                        if !fileManager.fileExists(atPath: destFile.path) {
                            shouldCopy = true
                        } else {
                            // Comparer les dates de modification
                            let sourceDate = try sourceFile.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                            let destDate = try destFile.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                            
                            if let sDate = sourceDate, let dDate = destDate, sDate > dDate {
                                try fileManager.removeItem(at: destFile)
                                shouldCopy = true
                            }
                        }
                        
                        if shouldCopy {
                            try fileManager.copyItem(at: sourceFile, to: destFile)
                            print("📄 Copié: \(sourceFile.lastPathComponent) vers Documents visible")
                        }
                    }
                }
            }
            
            print("✅ Synchronisation App Groups → Documents terminée")
            
        } catch {
            print("❌ Erreur lors de la synchronisation: \(error)")
        }
    }

    // MARK: - Reverse Synchronisation (Visible -> App Groups)
    private func syncFromVisibleDocumentsToAppGroups() {
        print("🔄 Synchronisation depuis Documents visible vers App Groups...")
        guard let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one") else {
            print("❌ App Groups non disponible pour reverse sync")
            return
        }
        let appGroupDocuments = groupURL.appendingPathComponent("Documents")
        let visibleDocuments = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

        do {
            let fm = FileManager.default
            let folders = ["Projects", "Exports", "Recordings", "Templates"]
            // Créer racine Documents si nécessaire côté App Group
            try fm.createDirectory(at: appGroupDocuments, withIntermediateDirectories: true)
            for folder in folders {
                let srcFolder = visibleDocuments.appendingPathComponent(folder)
                let dstFolder = appGroupDocuments.appendingPathComponent(folder)
                if fm.fileExists(atPath: srcFolder.path) {
                    if !fm.fileExists(atPath: dstFolder.path) {
                        try fm.createDirectory(at: dstFolder, withIntermediateDirectories: true)
                    }
                    let contents = try fm.contentsOfDirectory(at: srcFolder, includingPropertiesForKeys: [.contentModificationDateKey])
                    for srcFile in contents {
                        let dstFile = dstFolder.appendingPathComponent(srcFile.lastPathComponent)
                        var shouldCopy = false
                        if !fm.fileExists(atPath: dstFile.path) { shouldCopy = true }
                        else {
                            let srcDate = try srcFile.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                            let dstDate = try dstFile.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
                            if let s = srcDate, let d = dstDate, s > d { try fm.removeItem(at: dstFile); shouldCopy = true }
                        }
                        if shouldCopy {
                            try fm.copyItem(at: srcFile, to: dstFile)
                            print("📄 Copié: \(srcFile.lastPathComponent) vers App Groups")
                        }
                    }
                }
            }
            print("✅ Synchronisation Documents visible → App Groups terminée")
        } catch {
            print("❌ Erreur reverse sync: \(error)")
        }
    }
    
    private func copyFileToVisibleDocuments(from sourceURL: URL, relativePath: String) {
        print("📋 Copie vers Documents visible: \(relativePath)")
        
        let visibleDocuments = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let destURL = visibleDocuments.appendingPathComponent(relativePath)
        
        do {
            // Créer le dossier de destination s'il n'existe pas
            let destDirectory = destURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: destDirectory, withIntermediateDirectories: true, attributes: nil)
            
            // Supprimer le fichier existant s'il y en a un
            if FileManager.default.fileExists(atPath: destURL.path) {
                try FileManager.default.removeItem(at: destURL)
            }
            
            // Copier le fichier
            try FileManager.default.copyItem(at: sourceURL, to: destURL)
            print("✅ Fichier copié vers Documents visible: \(destURL.path)")
            
        } catch {
            print("❌ Erreur copie vers Documents visible: \(error)")
        }
    }
}

// MARK: - Document Picker Delegate pour AUv3
class DocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (Bool, Error?) -> Void
    
    init(completion: @escaping (Bool, Error?) -> Void) {
        self.completion = completion
        print("🔥 SWIFT: DocumentPickerDelegate init")
    }
    
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        print("🔥 SWIFT: documentPicker didPickDocumentsAt: \(urls)")
        completion(true, nil)
    }
    
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        print("🔥 SWIFT: documentPicker was cancelled")
        completion(false, NSError(domain: "DocumentPicker", code: -1, userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
    }
}

// MARK: - Document Picker Load Delegate pour AUv3
class DocumentPickerLoadDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (Bool, Data?, String?, Error?) -> Void
    
    init(completion: @escaping (Bool, Data?, String?, Error?) -> Void) {
        self.completion = completion
        print("🔥 SWIFT: DocumentPickerLoadDelegate init")
    }
    
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        print("🔥 SWIFT: documentPicker didPickDocumentsAt: \(urls)")
        
        guard let selectedURL = urls.first else {
            completion(false, nil, nil, NSError(domain: "DocumentPickerLoad", code: -1, userInfo: [NSLocalizedDescriptionKey: "No file selected"]))
            return
        }
        
        // Commencer l'accès sécurisé au fichier
        let didStartAccessing = selectedURL.startAccessingSecurityScopedResource()
        defer {
            if didStartAccessing {
                selectedURL.stopAccessingSecurityScopedResource()
            }
        }
        
        do {
            let data = try Data(contentsOf: selectedURL)
            let fileName = selectedURL.lastPathComponent
            print("🔥 SWIFT: Fichier lu avec succès - \(fileName), \(data.count) bytes")
            completion(true, data, fileName, nil)
        } catch {
            print("🔥 SWIFT: Erreur lecture fichier: \(error)")
            completion(false, nil, nil, error)
        }
    }
    
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        print("🔥 SWIFT: documentPickerLoad was cancelled")
        completion(false, nil, nil, NSError(domain: "DocumentPickerLoad", code: -1, userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
    }
}

// MARK: - Multiple selection delegate
class DocumentPickerLoadMultipleDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (Bool, [(String, Data)]?, Error?) -> Void
    init(completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) { self.completion = completion }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        print("🔥 SWIFT: multiple didPickDocumentsAt count=\(urls.count)")
        var results: [(String, Data)] = []
        for url in urls {
            let started = url.startAccessingSecurityScopedResource(); defer { if started { url.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: url) { results.append((url.lastPathComponent, data)) }
        }
        completion(!results.isEmpty, results.isEmpty ? nil : results, results.isEmpty ? NSError(domain: "DocumentPickerMultiple", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"]) : nil)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        completion(false, nil, NSError(domain: "DocumentPickerMultiple", code: -1, userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
    }
}

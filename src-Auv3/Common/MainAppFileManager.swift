//
//  MainAppFileManager.swift
//  atomeAudioUnit
//
//  Created by jeezs on 15/02/2025.
//
import Foundation
import UIKit

public class MainAppFileManager: ObservableObject {
    public static let shared = MainAppFileManager()
    
    @Published public var isInitialized = false
    
    private init() {}
    
    private func getDocumentsDirectory() -> URL {
        // Get the Documents directory URL
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0]
    }
    
    private func makeDirectoryVisibleInFiles(_ url: URL) {
        do {
            // Create a temporary file to force the directory to appear in Files app
            let temporaryFile = url.appendingPathComponent(".metadata_tmp")
            try "This is a temporary file to make the directory visible.".write(to: temporaryFile, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(at: temporaryFile)
            
            // Set directory attributes
            try FileManager.default.setAttributes([
                .posixPermissions: 0o755
            ], ofItemAtPath: url.path)
            
            // Ensure the directory is not excluded from backup
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = false
            var urlForAttributes = url
            try urlForAttributes.setResourceValues(resourceValues)
        } catch {
            print("⚠️ Error making directory visible: \(error)")
        }
    }
    
    public func initializeFileStructure() {
        print("=== INITIALIZING FILE STRUCTURE ===")
        
        let documentsURL = getDocumentsDirectory()
        let atomeFilesURL = documentsURL.appendingPathComponent("AtomeFiles", isDirectory: true)
        
        print("📂 AtomeFiles path: \(atomeFilesURL.path)")
        
        do {
            let fileManager = FileManager.default
            
            // Create directory if it doesn't exist
            if !fileManager.fileExists(atPath: atomeFilesURL.path) {
                try fileManager.createDirectory(
                    at: atomeFilesURL,
                    withIntermediateDirectories: true,
                    attributes: [FileAttributeKey.posixPermissions: 0o755]
                )
                print("📁 AtomeFiles directory created")
            }
            
            // Make the directory visible in Files app
            makeDirectoryVisibleInFiles(atomeFilesURL)
            
            // Create subdirectories for better organization
            let subdirectories = ["Projects", "Exports", "Recordings"]
            for subdirectory in subdirectories {
                let subdirectoryURL = atomeFilesURL.appendingPathComponent(subdirectory, isDirectory: true)
                if !fileManager.fileExists(atPath: subdirectoryURL.path) {
                    try fileManager.createDirectory(
                        at: subdirectoryURL,
                        withIntermediateDirectories: true,
                        attributes: [FileAttributeKey.posixPermissions: 0o755]
                    )
                    makeDirectoryVisibleInFiles(subdirectoryURL)
                }
            }
            
            // Create a welcome file
            let welcomeFileURL = atomeFilesURL.appendingPathComponent("README.txt")
            let welcomeContent = """
            Welcome to Atome!
            
            This folder is accessible through the Files app on your device.
            You can find it under "On My iPad/iPhone" > "Atome".
            
            Folder structure:
            - Projects: Store your project files
            - Exports: Find your exported files
            - Recordings: Access your recorded audio files
            
            Created on: \(Date())
            """
            
            if !fileManager.fileExists(atPath: welcomeFileURL.path) {
                try welcomeContent.write(to: welcomeFileURL, atomically: true, encoding: .utf8)
                print("📄 README.txt file created")
            }
            
            isInitialized = true
            print("✅ File structure initialization successful")
            
        } catch {
            print("❌ Error during initialization:")
            let nsError = error as NSError
            print("Domain: \(nsError.domain)")
            print("Code: \(nsError.code)")
            print("Description: \(nsError.localizedDescription)")
        }
    }
}

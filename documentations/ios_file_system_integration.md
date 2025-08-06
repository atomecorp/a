# iOS File System Integration: iCloud & Local Storage

## Overview

This document details the complete implementation of a dual file storage system for the Atome iOS application, supporting both local storage and iCloud synchronization with user choice compliance according to Apple's iOS 14+ guidelines.

> **⚠️ Current Status**: The implementation is currently running in **local storage mode only**. iCloud functionality has been temporarily disabled due to Apple Developer provisioning requirements. All iCloud code is implemented and ready for activation once the Apple Developer account is properly configured.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [iOS Configuration](#ios-configuration)
3. [Swift Implementation](#swift-implementation)
4. [JavaScript Bridge](#javascript-bridge)
5. [User Interface](#user-interface)
6. [API Reference](#api-reference)
7. [File Structure](#file-structure)
8. [Migration System](#migration-system)
9. [Testing & Deployment](#testing--deployment)
10. [Troubleshooting](#troubleshooting)

## Architecture Overview

The file system implementation provides:

- **Local Storage**: Files stored in the device's Documents directory, accessible via the Files app under "On My iPhone/iPad > Atome"
- **iCloud Storage**: Files synchronized across devices via iCloud Drive, accessible under "iCloud Drive > Atome"
- **User Choice**: Mandatory user selection at first launch (iOS 14+ compliance)
- **Migration**: Seamless migration between local and iCloud storage
- **JavaScript API**: Native bridge for web-based Squirrel components

### Key Components

```text
├── iCloudFileManager.swift           // Core file management logic
├── StorageSetupViewController.swift  // Initial setup UI
├── StorageSettingsView.swift         // Settings management
├── FileSystemBridge.swift            // JavaScript bridge
└── WebViewManager.swift              // WebView integration
```

## iOS Configuration

### 1. Entitlements Configuration

#### Main Application Entitlements (atome.entitlements)

```xml
<!-- iCloud Container -->
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.$(CFBundleIdentifier)</string>
</array>

<!-- iCloud Key-Value Store -->
<key>com.apple.developer.ubiquity-kvstore-identifier</key>
<string>$(TeamIdentifierPrefix)$(CFBundleIdentifier)</string>

<!-- iCloud Services -->
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
    <string>CloudKit</string>
</array>
```

#### Release Entitlements (atomeRelease.entitlements)

Same configuration applied to release builds to ensure consistent behavior across development and production environments.

### 2. Info.plist Configuration

```xml
<!-- iCloud Container Configuration -->
<key>NSUbiquitousContainers</key>
<dict>
    <key>iCloud.$(CFBundleIdentifier)</key>
    <dict>
        <key>NSUbiquitousContainerIsDocumentScopePublic</key>
        <true/>
        <key>NSUbiquitousContainerName</key>
        <string>Atome</string>
        <key>NSUbiquitousContainerSupportedFolderLevels</key>
        <string>Any</string>
    </dict>
</dict>

<!-- File Sharing Support -->
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
<key>UIFileSharingEnabled</key>
<true/>
<key>UISupportsDocumentBrowser</key>
<true/>
```

## Swift Implementation

### 1. Core File Manager (iCloudFileManager.swift)

The main file management class handles both local and iCloud operations.

#### Key Features

- **Singleton Pattern**: Centralized file management
- **Observable Object**: SwiftUI integration with `@Published` properties
- **Availability Detection**: Automatic iCloud availability checking
- **Directory Management**: Automatic creation of folder structure

#### Core Methods

```swift
public class iCloudFileManager: ObservableObject {
    public static let shared = iCloudFileManager()
    
    @Published public var isInitialized = false
    @Published public var iCloudAvailable = false
    @Published public var syncEnabled = false
    
    // Storage location selection
    public func presentStorageLocationChoice(
        from viewController: UIViewController, 
        completion: @escaping (Bool) -> Void
    )
    
    // File operations
    public func saveFile(
        data: Data, 
        to relativePath: String, 
        completion: @escaping (Bool, Error?) -> Void
    )
    
    public func loadFile(
        from relativePath: String, 
        completion: @escaping (Data?, Error?) -> Void
    )
    
    // Migration
    public func migrateToiCloud(completion: @escaping (Bool) -> Void)
    public func migrateToLocal(completion: @escaping (Bool) -> Void)
}
```

#### Directory Structure

```text
AtomeFiles/
├── Projects/        # User project files (.atome)
├── Exports/         # Exported audio files
├── Recordings/      # Audio recordings
├── Templates/       # Presets and templates
└── README.txt       # Welcome file with instructions
```

### 2. User Interface Components

#### Initial Setup (StorageSetupViewController.swift)

Features:

- **Modern UI**: Native iOS design with proper spacing and typography
- **Accessibility**: Full VoiceOver support
- **Conditional Display**: iCloud option only shown when available
- **Visual Feedback**: Recommended option highlighting

#### Settings Management (StorageSettingsView.swift)

SwiftUI-based settings interface providing:

- Current storage status display
- iCloud availability indicator
- Migration options with progress tracking
- Direct access to Files app
- Storage reconfiguration

#### Settings Key Features

```swift
struct StorageSettingsView: View {
    @StateObject private var fileManager = iCloudFileManager.shared
    @State private var migrationInProgress = false
    
    // Real-time storage status
    private var currentStorageType: String {
        UserDefaults.standard.bool(forKey: "AtomeUseICloud") ? "iCloud" : "Local"
    }
}
```

## JavaScript Bridge

### 1. Native Bridge (FileSystemBridge.swift)

The bridge implements `WKScriptMessageHandler` to enable communication between JavaScript and native iOS code.

#### Supported Actions

- `saveFile`: Save data to file system
- `loadFile`: Load file content
- `listFiles`: Directory listing
- `deleteFile`: File deletion
- `getStorageInfo`: Storage status information
- `showStorageSettings`: Open settings interface

#### Error Handling

```swift
private func sendErrorResponse(to webView: WKWebView?, error: String) {
    guard let webView = webView else { return }
    
    let escapedError = error.replacingOccurrences(of: "\"", with: "\\\"")
    let js = """
        window.fileSystemCallback && window.fileSystemCallback({
            success: false, 
            error: "\(escapedError)"
        });
    """
    webView.evaluateJavaScript(js)
}
```

### 2. JavaScript API

#### Core API (window.AtomeFileSystem)

```javascript
window.AtomeFileSystem = {
    saveFile: function(path, data, callback),
    loadFile: function(path, callback),
    listFiles: function(folder, callback),
    deleteFile: function(path, callback),
    getStorageInfo: function(callback),
    showStorageSettings: function()
};
```

#### Convenience Methods

```javascript
// Project management
window.saveProject = function(projectData, name) {
    return new Promise((resolve, reject) => {
        const fileName = name + '.atome';
        const path = 'Projects/' + fileName;
        
        AtomeFileSystem.saveFile(path, JSON.stringify(projectData), (result) => {
            if (result.success) {
                resolve(result.data);
            } else {
                reject(new Error(result.error));
            }
        });
    });
};

// Audio export
window.exportAudio = function(audioData, name) {
    return new Promise((resolve, reject) => {
        const fileName = name + '.wav';
        const path = 'Exports/' + fileName;
        
        AtomeFileSystem.saveFile(path, audioData, (result) => {
            if (result.success) {
                resolve(result.data);
            } else {
                reject(new Error(result.error));
            }
        });
    });
};
```

## User Interface

### 1. Storage Selection Flow

1. **App Launch**: Check if user has made storage choice
2. **First Time**: Present storage selection modal
3. **User Choice**:
   - "Local Storage": Files stored on device only
   - "iCloud": Files synchronized across devices
   - "Decide Later": Default to local storage

### 2. Settings Interface

Accessible from the main application, providing:

- Current storage status
- iCloud availability check
- Migration options with progress indication
- Direct link to Files app
- Reset storage preferences

### 3. Visual Design

#### Storage Selection Interface

- Clean, modern iOS design
- Clear option descriptions
- Recommended option highlighting
- Accessibility compliance
- Error state handling

#### Settings Interface

- Native SwiftUI components
- Real-time status updates
- Progress indicators for migrations
- Consistent with iOS design guidelines

## API Reference

### JavaScript API

#### File Operations

```javascript
// Save a file
AtomeFileSystem.saveFile(relativePath, data, callback)
// Parameters:
//   relativePath: String - Path relative to AtomeFiles directory
//   data: String - File content
//   callback: Function - Callback with result

// Load a file
AtomeFileSystem.loadFile(relativePath, callback)
// Returns file content in callback

// List directory contents
AtomeFileSystem.listFiles(folderPath, callback)
// Returns array of file objects with metadata

// Delete a file
AtomeFileSystem.deleteFile(relativePath, callback)
// Removes file from storage
```

#### Storage Management

```javascript
// Get storage information
AtomeFileSystem.getStorageInfo(callback)
// Returns:
// {
//   isICloudEnabled: boolean,
//   isICloudAvailable: boolean,
//   storageType: "icloud" | "local",
//   isInitialized: boolean
// }

// Show storage settings
AtomeFileSystem.showStorageSettings()
// Opens native settings interface
```

#### High-Level API

```javascript
// Project management
await saveProject(projectData, projectName)
await loadProject(projectName)

// Audio export
await exportAudio(audioData, fileName)
```

### Swift API

#### File Operations Methods

```swift
// File operations
func saveFile(
    data: Data, 
    to relativePath: String, 
    completion: @escaping (Bool, Error?) -> Void
)

func loadFile(
    from relativePath: String, 
    completion: @escaping (Data?, Error?) -> Void
)

// Storage management
func getCurrentStorageURL() -> URL?
func checkiCloudAvailability()

// Migration
func migrateToiCloud(completion: @escaping (Bool) -> Void)
func migrateToLocal(completion: @escaping (Bool) -> Void)
```

## File Structure

### Local Storage Path

```text
Documents/
└── AtomeFiles/
    ├── Projects/
    ├── Exports/
    ├── Recordings/
    ├── Templates/
    └── README.txt
```

### iCloud Storage Path

```text
iCloud Drive/
└── Atome/
    ├── Projects/
    ├── Exports/
    ├── Recordings/
    ├── Templates/
    └── README.txt
```

### File Visibility

Both storage locations are accessible via the iOS Files app:

- **Local**: "On My iPhone/iPad" > "Atome"
- **iCloud**: "iCloud Drive" > "Atome"

## Migration System

### Migration Process

1. **User Initiates**: Through settings interface
2. **Confirmation**: Alert dialog with details
3. **Progress Indication**: Visual feedback during migration
4. **File Copy**: Preserve all existing files
5. **Settings Update**: Update user preferences
6. **Verification**: Confirm successful migration

### Migration Types

#### Local to iCloud

1. Create iCloud directory structure
2. Copy all local files to iCloud
3. Start iCloud synchronization
4. Update user preferences
5. Verify successful upload

#### iCloud to Local

1. Download all iCloud files
2. Create local directory structure
3. Copy files to local storage
4. Update user preferences
5. Verify successful copy

### Error Handling

Common error scenarios:

- Network unavailability
- Insufficient iCloud storage
- File permission issues
- Incomplete transfers

## Testing & Deployment

### Prerequisites

1. **Apple Developer Account**: Required for iCloud container
2. **iCloud Container Setup**: Create container in developer portal
3. **Team ID Configuration**: Set correct team identifier
4. **Device Testing**: iCloud requires physical device testing

### Setup Steps

1. **Xcode Configuration**:

   ```text
   Project Settings > Signing & Capabilities > + Capability > iCloud
   - Enable "iCloud Documents"
   - Configure container identifier
   ```

2. **Container Creation**:
   - Apple Developer Portal > Identifiers > iCloud Containers
   - Create new container: `iCloud.your.bundle.identifier`

3. **Provisioning Profiles**: Update with iCloud capability

### Testing Checklist

- [ ] Local storage creation and access
- [ ] iCloud availability detection
- [ ] File save/load operations
- [ ] Directory listing functionality
- [ ] Migration between storage types
- [ ] Files app integration
- [ ] JavaScript API functionality
- [ ] Error handling scenarios
- [ ] Multiple device synchronization

### Deployment Considerations

1. **iCloud Storage Quotas**: Monitor user storage usage
2. **Network Dependency**: Handle offline scenarios
3. **Performance**: Large file handling optimization
4. **User Education**: Clear documentation for users

## Troubleshooting

### Common Issues

#### iCloud Not Available

**Symptoms**: iCloud option not shown, migration fails

**Solutions**:

- Verify user is logged into iCloud
- Check iCloud Drive is enabled
- Confirm network connectivity
- Validate container configuration

#### Files Not Syncing

**Symptoms**: Files don't appear on other devices

**Solutions**:

- Call `startDownloadingUbiquitousItem`
- Check iCloud storage quota
- Verify file is not too large
- Wait for sync completion

#### Migration Failures

**Symptoms**: Migration process doesn't complete

**Solutions**:

- Check available storage space
- Verify network connectivity
- Ensure proper file permissions
- Retry with error logging

#### JavaScript API Issues

**Symptoms**: Callbacks not firing, errors in console

**Solutions**:

- Verify WebView message handler setup
- Check callback function registration
- Validate JSON serialization
- Enable WebView debugging

### Debug Tools

#### Console Logging

```swift
print("📂 File operation: \(operation)")
print("✅ Success: \(result)")
print("❌ Error: \(error)")
```

#### JavaScript Debugging

```javascript
console.log('File system operation:', operation);
window.fileSystemCallback = (result) => {
    console.log('Result:', result);
};
```

### Performance Optimization

1. **Batch Operations**: Group multiple file operations
2. **Background Processing**: Use background queues for large operations
3. **Caching**: Cache frequently accessed files
4. **Lazy Loading**: Load file lists on demand

## Conclusion

This implementation provides a robust, user-friendly file system that complies with Apple's guidelines while offering seamless integration between native iOS capabilities and web-based Squirrel components. The dual storage approach ensures data accessibility whether users prefer local-only storage or cloud synchronization across devices.

The system is designed for scalability and maintainability, with clear separation of concerns between storage logic, user interface, and JavaScript integration. Proper error handling and user feedback ensure a reliable experience across different network conditions and device configurations.

## Implementation Summary

### Current Status

⚠️ **Note**: The iCloud implementation is currently **disabled** due to Apple Developer configuration requirements. The system is running in **local storage mode only** until iCloud container setup is completed.

### Files Created

- `iCloudFileManager.swift` - Core file management (ready but not active)
- `StorageSetupViewController.swift` - Initial setup UI (ready but not active)
- `StorageSettingsView.swift` - Settings management (ready but not active)
- `FileSystemBridge.swift` - JavaScript bridge (simplified version active)
- `file-system-example.js` - Example usage

### Configuration Changes

#### Currently Active
- Using `MainAppFileManager` for local storage only
- Basic file sharing enabled in `Info.plist`
- Standard entitlements without iCloud

#### Ready for iCloud (When Developer Account Configured)
- `iCloudFileManager.swift` - Complete implementation ready
- iCloud entitlements prepared but commented out
- iCloud container configuration ready
- Migration system implemented

### Current Features (Local Only)

- ✅ Local file storage in Documents/AtomeFiles
- ✅ Files app integration ("On My iPhone/iPad" > "Atome")
- ✅ Basic JavaScript API (simplified)
- ✅ Directory structure creation
- ✅ Error handling and user feedback

### Features Ready for iCloud Activation

- 🔄 iOS 14+ compliant user choice system
- 🔄 Dual storage (local/iCloud) with seamless migration
- 🔄 iCloud Drive integration
- 🔄 Complete JavaScript API for web components
- 🔄 SwiftUI settings interface
- 🔄 Performance optimization for large files

## Activation Steps for iCloud

### 1. Apple Developer Configuration
```bash
# Required steps:
1. Create iCloud container in Apple Developer Portal
2. Update provisioning profiles with iCloud capability
3. Configure Team ID in Xcode project settings
```

### 2. Code Activation
```swift
// In AppDelegate.swift - Replace:
@StateObject private var fileManager = MainAppFileManager.shared
// With:
@StateObject private var fileManager = iCloudFileManager.shared

// In WebViewManager.swift - Uncomment:
addFileSystemAPI(to: webView)
```

### 3. Entitlements Activation
Re-add iCloud entitlements to both:
- `atome.entitlements`
- `atomeRelease.entitlements`

### 4. Info.plist Activation
Re-add iCloud container configuration

## Troubleshooting Current Setup

### Common Issues Fixed

#### Compilation Errors Resolved
- ✅ Fixed URLResourceValues usage in `iCloudFileManager.swift`
- ✅ Fixed type annotations in `FileSystemBridge.swift`
- ✅ Added proper imports (UIKit, SwiftUI)
- ✅ Simplified storage settings to avoid SwiftUI dependencies
- ✅ Fixed AUv3 extension compatibility by removing `UIApplication.shared` usage
- ✅ Added view controller discovery method for presenting alerts in extensions
- ✅ Fixed weak self reference handling in async closures for proper method access
- ✅ Corrected file manager references from `iCloudFileManager` to `MainAppFileManager` for current implementation
- ✅ Recreated corrupted `FileSystemBridge.swift` with proper structure and syntax
- ✅ Added missing file operation methods to `MainAppFileManager.swift` (saveFile, loadFile, getCurrentStorageURL, iCloudAvailable)

#### Current Limitations

- iCloud functionality disabled until developer setup
- Settings interface shows simple alert instead of full UI
- JavaScript API returns local-only storage info
- **File Manager**: Currently using `MainAppFileManager` instead of `iCloudFileManager` for stability

#### MainAppFileManager API (Currently Active)

The `MainAppFileManager` provides a simplified, local-only file management system:

```swift
public class MainAppFileManager: ObservableObject {
    public static let shared = MainAppFileManager()
    
    @Published public var isInitialized = false
    public var iCloudAvailable: Bool { return false }
    
    // File operations
    public func saveFile(data: Data, to relativePath: String, completion: @escaping (Bool, Error?) -> Void)
    public func loadFile(from relativePath: String, completion: @escaping (Data?, Error?) -> Void)
    public func getCurrentStorageURL() -> URL?
    public func initializeFileStructure()
}
```

**Features:**
- ✅ Local storage in Documents/AtomeFiles
- ✅ Directory structure creation and management
- ✅ Files app integration
- ✅ Error handling for file operations
- ❌ No iCloud synchronization (by design)

#### AUv3 Extension Compatibility

The `FileSystemBridge.swift` implementation is specifically designed to work within AUv3 (Audio Unit v3) extensions, which have restrictions on certain iOS APIs:

- **UIApplication.shared**: Not available in extensions - replaced with view controller discovery
- **View Controller Access**: Uses responder chain to find parent view controller
- **Alert Presentation**: Compatible with both main app and extension contexts
- **Memory Management**: Uses weak references to avoid retain cycles
- **Async Closure Handling**: Proper `guard let self = self` pattern for method access in async contexts

```swift
// AUv3-compatible async closure with proper self handling
private func handleShowStorageSettings() {
    DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        
        guard let webView = self.currentWebView,
              let viewController = self.findViewController(from: webView) else {
            print("❌ Impossible de trouver le view controller pour afficher les paramètres")
            return
        }
        // ... rest of implementation
    }
}

// AUv3-compatible view controller discovery
private func findViewController(from view: UIView) -> UIViewController? {
    var responder: UIResponder? = view
    while responder != nil {
        if let viewController = responder as? UIViewController {
            return viewController
        }
        responder = responder?.next
    }
    return nil
}
```

### Debug Current Implementation

```swift
// Check current storage status
print("Using file manager: \(MainAppFileManager.shared)")
print("Files location: \(FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0])")
```

```javascript
// Test file system from JavaScript
if (window.AtomeFileSystem) {
    console.log("File system API available");
    AtomeFileSystem.getStorageInfo((result) => {
        console.log("Storage info:", result);
    });
} else {
    console.log("File system API not available - check WebViewManager setup");
}
```

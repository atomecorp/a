import Foundation

/// Centralizes the sandbox policy for the AUv3 extension.
/// Only two roots are permitted:
/// - App Group container Documents directory
/// - PluginKit (extension) Documents directory
/// Any path outside these roots must be rejected to avoid sandbox violations.
enum SandboxPathValidator {
    private static let appGroupIdentifier = "group.atome.one"

    /// Returns the list of allowed root directories, in priority order.
    /// Directories are created if missing to avoid later writes failing due to nonexistent folders.
    static func allowedRoots() -> [URL] {
        var roots: [URL] = []

        if let groupURL = appGroupDocumentsRoot() {
            roots.append(groupURL)
            createDirectoryIfNeeded(at: groupURL)
        }

        if let pluginDocs = pluginContainerRoot() {
            roots.append(pluginDocs)
            createDirectoryIfNeeded(at: pluginDocs)
        }

        var unique: [URL] = []
        var seen: Set<String> = []
        for url in roots {
            let resolved = url.resolvingSymlinksInPath().standardizedFileURL
            let path = resolved.path
            if seen.insert(path).inserted {
                unique.append(resolved)
            }
        }
        return unique
    }

    /// Convenience accessor returning the highest priority root (App Group if available).
    static func primaryRoot() -> URL? {
        return allowedRoots().first
    }

    /// Returns the App Group Documents directory if available.
    static func appGroupDocumentsRoot() -> URL? {
        let fm = FileManager.default
        guard let groupURL = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else { return nil }
        return groupURL.appendingPathComponent("Documents", isDirectory: true).standardizedFileURL
    }

    /// Returns the PluginKit (extension) Documents directory if available.
    static func pluginContainerRoot() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.standardizedFileURL
    }

    /// Ensures the provided URL resides strictly inside one of the allowed roots.
    static func isAllowed(url: URL) -> Bool {
        let resolved = url.resolvingSymlinksInPath().standardizedFileURL
        let path = resolved.path
        for root in allowedRoots() {
            let rootPath = root.resolvingSymlinksInPath().standardizedFileURL.path
            if path == rootPath { return true }
            if path.hasPrefix(rootPath.hasSuffix("/") ? rootPath : rootPath + "/") {
                return true
            }
        }
        return false
    }

    /// Sanitizes a user-provided path so it can be appended to an allowed root without escaping it.
    /// Returns nil if the path is absolute, tries to traverse above root, or contains forbidden characters.
    static func sanitizedRelativePath(_ raw: String) -> String? {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }

        // Strip leading slashes to avoid absolute lookups
        while trimmed.hasPrefix("/") { trimmed.removeFirst() }
        if trimmed.isEmpty { return "" }

        var stack: [String] = []
        for component in trimmed.split(separator: "/") {
            let part = String(component)
            if part.isEmpty || part == "." { continue }
            if part == ".." {
                if stack.isEmpty { return nil }
                stack.removeLast()
                continue
            }
            if part.contains(":") { return nil }
            stack.append(part)
        }
        return stack.joined(separator: "/")
    }

    /// Builds candidate URLs for a given relative path, constrained to allowed roots.
    static func candidateURLs(for relativePath: String) -> [URL] {
        guard let sanitized = sanitizedRelativePath(relativePath) else { return [] }
        return allowedRoots().map { root in
            sanitized.isEmpty ? root : root.appendingPathComponent(sanitized, isDirectory: false)
        }
    }

    private static func createDirectoryIfNeeded(at url: URL) {
        var isDir: ObjCBool = false
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path, isDirectory: &isDir) {
            return
        }
        do {
            try fm.createDirectory(at: url, withIntermediateDirectories: true, attributes: [
                FileAttributeKey.posixPermissions: 0o755
            ])
        } catch {
            print("⚠️ SandboxPathValidator failed to create directory at \(url.path): \(error)")
        }
    }
}

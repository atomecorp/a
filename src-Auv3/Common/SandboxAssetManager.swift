import Foundation

/// Handles copying bundled assets into the writable sandbox roots on demand.
/// This lets LocalHTTPServer/FileSystemBridge keep serving legacy resources
/// without ever reading directly from the .appex bundle (for sandbox safety).
final class SandboxAssetManager {
    static let shared = SandboxAssetManager()

    private let fm = FileManager.default
    private let copyQueue = DispatchQueue(label: "sandbox.asset.manager")

    private init() {}

    /// Ensures a relative path exists inside the allowed root. When missing,
    /// tries to locate the asset inside the bundle (mirroring legacy paths)
    /// and copies it over. Returns the destination URL if successful.
    func materializeAssetIfNeeded(relativePath: String) -> URL? {
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath) else {
            return nil
        }
        guard let root = SandboxPathValidator.primaryRoot() else {
            return nil
        }
        let destination = sanitized.isEmpty ? root : root.appendingPathComponent(sanitized)
        if fm.fileExists(atPath: destination.path) {
            return destination
        }
        guard let source = locateBundleAsset(for: relativePath) else {
            return nil
        }
        copyQueue.sync {
            do {
                try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                if fm.fileExists(atPath: destination.path) {
                    return
                }
                try fm.copyItem(at: source, to: destination)
                setDefaultPermissions(at: destination)
            } catch {
                print("⚠️ SandboxAssetManager failed to copy \(source.lastPathComponent) -> \(destination.path): \(error)")
            }
        }
        return fm.fileExists(atPath: destination.path) ? destination : nil
    }

    private func setDefaultPermissions(at url: URL) {
        do {
            try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: url.path)
        } catch { }
    }

    /// Recreates the legacy lookup order using bundle resources, but never
    /// exposes the bundle path to callers. Only returns the original URL so
    /// it can be copied into the sandbox.
    private func locateBundleAsset(for relativePath: String) -> URL? {
        guard let bundleRoot = Bundle.main.resourceURL else { return nil }
        let nameNSString = relativePath as NSString
        let baseName = nameNSString.deletingPathExtension
        let ext = nameNSString.pathExtension
        let fileOnly = nameNSString.lastPathComponent
        let lower = relativePath.lowercased()

        var candidates: [URL?] = []
        let add: (URL?) -> Void = { candidates.append($0) }

        if !ext.isEmpty {
            add(Bundle.main.url(forResource: baseName, withExtension: ext))
        }
        if lower.hasSuffix(".m4a") {
            add(Bundle.main.url(forResource: baseName, withExtension: "m4a"))
        }

        let assetsRoot = bundleRoot.appendingPathComponent("assets", isDirectory: true)
        add(assetsRoot.appendingPathComponent(relativePath))
        add(assetsRoot.appendingPathComponent("audios/" + fileOnly))
        add(assetsRoot.appendingPathComponent("audios/" + relativePath))
        add(assetsRoot.appendingPathComponent("texts/" + relativePath))
        add(assetsRoot.appendingPathComponent("images/" + relativePath))
        add(assetsRoot.appendingPathComponent("images/logos/" + fileOnly))

        let srcRoot = bundleRoot.appendingPathComponent("src", isDirectory: true)
        let srcAssets = srcRoot.appendingPathComponent("assets", isDirectory: true)
        add(srcRoot.appendingPathComponent(relativePath))
        add(srcAssets.appendingPathComponent(relativePath))
        add(srcAssets.appendingPathComponent("audios/" + fileOnly))
        add(srcAssets.appendingPathComponent("audios/" + relativePath))
        add(srcAssets.appendingPathComponent("texts/" + relativePath))
        add(srcAssets.appendingPathComponent("images/logos/" + fileOnly))

        for candidate in candidates {
            if let url = candidate, fm.fileExists(atPath: url.path) {
                return url
            }
        }
        return nil
    }
}

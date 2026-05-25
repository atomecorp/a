import Foundation

extension FileSyncCoordinator {
    struct FileMeta {
        let isDir: Bool
        let size: UInt64
        let modDate: Date
    }

    private func shouldSyncRelativePath(_ rel: String) -> Bool {
        let trimmed = rel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if trimmed.hasPrefix(".") { return false }
        let firstComponent = trimmed
            .split(separator: "/", maxSplits: 1, omittingEmptySubsequences: true)
            .first
            .map(String.init) ?? trimmed
        return allowedTopLevelEntries.contains(firstComponent)
    }

    func buildInventory(root: URL) -> [String: FileMeta] {
        var map: [String: FileMeta] = [:]
        guard let enumerator = fm.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return map
        }
        let rootPath = root.resolvingSymlinksInPath().standardizedFileURL.path
        for case let url as URL in enumerator {
            let itemPath = url.resolvingSymlinksInPath().standardizedFileURL.path
            guard itemPath.hasPrefix(rootPath + "/") else { continue }
            let rel = String(itemPath.dropFirst(rootPath.count + 1))
            if rel.isEmpty { continue }
            if !shouldSyncRelativePath(rel) { continue }
            if rel.contains("/var/mobile/Containers/Data") { continue }
            do {
                let res = try url.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey])
                let isDir = res.isDirectory ?? false
                let size = UInt64(res.fileSize ?? 0)
                let mod = res.contentModificationDate ?? Date(timeIntervalSince1970: 0)
                map[rel] = FileMeta(isDir: isDir, size: size, modDate: mod)
            } catch {
                continue
            }
        }
        return map
    }

    func ensureDirectory(_ url: URL) {
        do {
            try fm.createDirectory(at: url, withIntermediateDirectories: true)
        } catch { }
    }

    func copyFile(from: URL, to: URL) {
        do {
            if fm.fileExists(atPath: to.path) {
                try fm.removeItem(at: to)
            }
            try fm.copyItem(at: from, to: to)
            if let attrs = try? fm.attributesOfItem(atPath: from.path),
               let mod = attrs[.modificationDate] as? Date {
                try? fm.setAttributes([.modificationDate: mod], ofItemAtPath: to.path)
            }
        } catch {
            print("⚠️ Sync copy failed: \(error)")
        }
    }

    func deleteItemIfExists(_ url: URL) {
        if fm.fileExists(atPath: url.path) {
            do {
                try fm.removeItem(at: url)
            } catch {
                print("⚠️ Delete failed: \(error)")
            }
        }
    }

    func availableRoots() -> [URL] {
        var roots: [URL] = []
        if let group = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?
            .appendingPathComponent("Documents", isDirectory: true) {
            roots.append(group)
        }
        if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first {
            roots.append(docs)
        }
        if let ubiq = fm.url(forUbiquityContainerIdentifier: nil)?
            .appendingPathComponent("Documents", isDirectory: true) {
            roots.append(ubiq)
        }
        var seen: Set<String> = []
        return roots.filter { root in
            let key = root.path
            if seen.contains(key) { return false }
            seen.insert(key)
            return true
        }
    }

    func cleanupLeakedInternalContent(in roots: [URL]) {
        for root in roots {
            for name in leakedInternalTopLevelEntries {
                let leakedURL = root.appendingPathComponent(name, isDirectory: true)
                guard fm.fileExists(atPath: leakedURL.path) else { continue }
                do {
                    try fm.removeItem(at: leakedURL)
                } catch {
                    print("⚠️ Failed to remove leaked internal folder \(name): \(error)")
                }
            }
        }
    }

    func cleanupSpuriousArtifacts(in roots: [URL]) {
        let canonical = Set(["Projects", "Exports", "Recordings", "Templates", "Testing"])
        for root in roots {
            cleanupRepeatedPrivateFolders(in: root, canonical: canonical)
            flattenNestedCanonicalFolders(in: root, canonical: canonical)
        }
    }

    private func cleanupRepeatedPrivateFolders(in root: URL, canonical: Set<String>) {
        guard let entries = try? fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }
        for dir in entries {
            guard (try? dir.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else { continue }
            let name = dir.lastPathComponent
            guard let match = canonical.first(where: { name.hasSuffix($0) }) else { continue }
            let prefix = name.replacingOccurrences(of: match, with: "")
            guard !prefix.isEmpty, prefix.replacingOccurrences(of: "private", with: "").isEmpty else { continue }
            let target = root.appendingPathComponent(match, isDirectory: true)
            try? fm.createDirectory(at: target, withIntermediateDirectories: true)
            moveMissingChildren(from: dir, to: target, failurePrefix: "Cleanup")
            do {
                try fm.removeItem(at: dir)
            } catch {
                print("⚠️ Cleanup remove failed: \(error)")
            }
        }
    }

    private func flattenNestedCanonicalFolders(in root: URL, canonical: Set<String>) {
        let exports = root.appendingPathComponent("Exports", isDirectory: true)
        guard fm.fileExists(atPath: exports.path) else { return }
        for sub in canonical.subtracting(["Exports"]) {
            let nested = exports.appendingPathComponent(sub, isDirectory: true)
            if fm.fileExists(atPath: nested.path) {
                let top = root.appendingPathComponent(sub, isDirectory: true)
                try? fm.createDirectory(at: top, withIntermediateDirectories: true)
                moveMissingChildren(from: nested, to: top, failurePrefix: "Flatten")
                try? fm.removeItem(at: nested)
            }
        }
    }

    private func moveMissingChildren(from source: URL, to target: URL, failurePrefix: String) {
        guard let files = try? fm.contentsOfDirectory(at: source, includingPropertiesForKeys: nil) else { return }
        for file in files {
            let destination = target.appendingPathComponent(file.lastPathComponent)
            if fm.fileExists(atPath: destination.path) { continue }
            do {
                try fm.moveItem(at: file, to: destination)
            } catch {
                print("⚠️ \(failurePrefix) move failed: \(error)")
            }
        }
    }
}

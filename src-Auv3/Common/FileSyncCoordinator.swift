// FileSyncCoordinator.swift
// Synchronise Documents (visible app), App Group Documents, et iCloud (si dispo)
// Stratégie: newest-wins (mtime), copie sur les autres emplacements manquants ou obsolètes.

import Foundation

final class FileSyncCoordinator {
    static let shared = FileSyncCoordinator()
    private let fm = FileManager.default
    private let queue = DispatchQueue(label: "filesync.coordinator.queue", qos: .utility)
    private var syncing = false
    private(set) var lastSync: Date? = nil
    private var pending = false
    private var timer: DispatchSourceTimer? = nil

    // Public API
    func syncAll(force: Bool = false) {
        queue.async { [weak self] in
            guard let self = self else { return }
            if self.syncing {
                self.pending = true
                return
            }
            if !force, let last = self.lastSync, Date().timeIntervalSince(last) < 5 { return }
            self.syncing = true
            self.pending = false
            self._runSync()
            self.syncing = false
            self.lastSync = Date()
            if self.pending { self.pending = false; self.syncAll(force: true) }
        }
    }

    // MARK: - Auto Sync
    func startAutoSync(every interval: TimeInterval = 10) {
        queue.async { [weak self] in
            guard let self = self else { return }
            self.timer?.cancel(); self.timer = nil
            let t = DispatchSource.makeTimerSource(queue: self.queue)
            t.schedule(deadline: .now() + interval, repeating: interval)
            t.setEventHandler { [weak self] in self?.syncAll() }
            t.resume()
            self.timer = t
            print("⏱️ FileSyncCoordinator auto-sync started interval=\(interval)s")
        }
    }

    func stopAutoSync() {
        queue.async { [weak self] in
            self?.timer?.cancel(); self?.timer = nil
            print("⏹️ FileSyncCoordinator auto-sync stopped")
        }
    }

    // MARK: - Core Sync Logic
    private func _runSync() {
        let roots = availableRoots()
        if roots.count < 2 { return }
        var inventories: [URL: [String: FileMeta]] = [:]
        for root in roots {
            inventories[root] = buildInventory(root: root)
        }
        var allRelPaths: Set<String> = []
        for inv in inventories.values { allRelPaths.formUnion(inv.keys) }
        for rel in allRelPaths {
            var metas: [(root: URL, meta: FileMeta)] = []
            for (root, inv) in inventories { if let m = inv[rel] { metas.append((root, m)) } }
            guard !metas.isEmpty else { continue }
            if metas.first!.meta.isDir { for root in roots { ensureDirectory(root.appendingPathComponent(rel)) }; continue }
            let winner = metas.max { a, b in
                if a.meta.modDate == b.meta.modDate { return a.meta.size < b.meta.size }
                return a.meta.modDate < b.meta.modDate
            }!
            for root in roots {
                let dest = root.appendingPathComponent(rel)
                if root == winner.root { continue }
                if let existing = inventories[root]?[rel] {
                    if abs(existing.modDate.timeIntervalSince(winner.meta.modDate)) < 1 && existing.size == winner.meta.size { continue }
                    copyFile(from: winner.root.appendingPathComponent(rel), to: dest)
                } else {
                    ensureDirectory(dest.deletingLastPathComponent())
                    copyFile(from: winner.root.appendingPathComponent(rel), to: dest)
                }
            }
        }
        print("🔄 FileSyncCoordinator sync complete roots=")
        for r in roots { print("   • \(r.path)") }
    }

    private struct FileMeta { let isDir: Bool; let size: UInt64; let modDate: Date }

    private func buildInventory(root: URL) -> [String: FileMeta] {
        var map: [String: FileMeta] = [:]
        guard let enumerator = fm.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return map }
        for case let url as URL in enumerator {
            let rel = url.path.replacingOccurrences(of: root.path + "/", with: "")
            if rel.isEmpty { continue }
            do {
                let res = try url.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey])
                let isDir = res.isDirectory ?? false
                let size = UInt64(res.fileSize ?? 0)
                let mod = res.contentModificationDate ?? Date(timeIntervalSince1970: 0)
                map[rel] = FileMeta(isDir: isDir, size: size, modDate: mod)
            } catch { continue }
        }
        return map
    }

    private func ensureDirectory(_ url: URL) { do { try fm.createDirectory(at: url, withIntermediateDirectories: true) } catch { } }

    private func copyFile(from: URL, to: URL) {
        do {
            if fm.fileExists(atPath: to.path) { try fm.removeItem(at: to) }
            try fm.copyItem(at: from, to: to)
            if let attrs = try? fm.attributesOfItem(atPath: from.path), let mod = attrs[.modificationDate] as? Date {
                try? fm.setAttributes([.modificationDate: mod], ofItemAtPath: to.path)
            }
            print("📄 Sync copy \(from.lastPathComponent) -> \(to.deletingLastPathComponent().lastPathComponent)")
        } catch { print("⚠️ Sync copy failed: \(error)") }
    }

    private func availableRoots() -> [URL] {
        var roots: [URL] = []
        if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first { roots.append(docs) }
        if let group = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents", isDirectory: true) { roots.append(group) }
        if let ubiq = fm.url(forUbiquityContainerIdentifier: nil)?.appendingPathComponent("Documents", isDirectory: true) { roots.append(ubiq) }
        var seen: Set<String> = []
        return roots.filter { r in let k = r.path; if seen.contains(k) { return false }; seen.insert(k); return true }
    }
}

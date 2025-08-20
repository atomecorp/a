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

    // MARK: - Inventory / Tombstones (Option A canonical storage)
    // lastSeenVisibleRoot: identifiant (path) du visible root qui a vu le fichier pour la dernière fois.
    // Permet d'éviter qu'un autre processus (ex: app principale vs extension) interprète une absence locale
    // comme une suppression utilisateur alors que le fichier vient d'être créé ailleurs.
    private struct InventoryRecord: Codable { var lastModified: TimeInterval; var deletedAt: TimeInterval?; var lastSeenVisible: TimeInterval?; var missingVisibleSince: TimeInterval?; var lastSeenVisibleRoot: String? }
    private var inventory: [String: InventoryRecord] = [:]
    private var inventoryLoaded = false
    private var inventoryDirty = false

    private func inventoryFileURL() -> URL? {
        // Store in App Group if possible else first documents
        if let group = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents/.atome_sync", isDirectory: true) {
            return group.appendingPathComponent("inventory.json", isDirectory: false)
        }
        if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent(".atome_sync", isDirectory: true) {
            return docs.appendingPathComponent("inventory.json", isDirectory: false)
        }
        return nil
    }

    private func loadInventoryIfNeeded() {
        guard !inventoryLoaded, let url = inventoryFileURL() else { return }
        defer { inventoryLoaded = true }
        do {
            try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: url.path) {
                let data = try Data(contentsOf: url)
                let decoded = try JSONDecoder().decode([String: InventoryRecord].self, from: data)
                inventory = decoded
            }
        } catch { print("⚠️ Inventory load failed: \(error)") }
    }

    private func persistInventoryIfNeeded() {
        guard inventoryDirty, let url = inventoryFileURL() else { return }
        do {
            let data = try JSONEncoder().encode(inventory)
            try data.write(to: url, options: .atomic)
            inventoryDirty = false
        } catch { print("⚠️ Inventory save failed: \(error)") }
    }

    // Public API
    func syncAll(force: Bool = false) {
        queue.async { [weak self] in
            guard let self = self else { return }
            if self.syncing {
                self.pending = true
                return
            }
            // Throttle window réduit (5s -> 2s) pour une propagation plus rapide entre app & extension
            if !force, let last = self.lastSync, Date().timeIntervalSince(last) < 2 { return }
            self.syncing = true
            self.pending = false
            self._runSync()
            self.syncing = false
            self.lastSync = Date()
            if self.pending { self.pending = false; self.syncAll(force: true) }
        }
    }

    // Blocking sync (used by /sync_now endpoint) returns stats
    func blockingSync() -> (changed: Int, deleted: Int, roots: [String]) {
        var changed = 0
        var deleted = 0
        var rootsPaths: [String] = []
        queue.sync {
            let beforeInventory = Set(inventory.keys)
           // let beforeFiles: [String: Date] = [:] // placeholder for future fine-grained diff
            let roots = availableRoots()
            rootsPaths = roots.map { $0.path }
            let prevInventory = inventory // copy
            let prevDeleted = prevInventory.filter { $0.value.deletedAt != nil }.count
            self._runSync()
            let afterDeleted = inventory.filter { $0.value.deletedAt != nil }.count
            deleted = afterDeleted - prevDeleted
            // Changed heuristic: new entries or resurrected ones
            let afterInventory = Set(inventory.keys)
            changed = afterInventory.subtracting(beforeInventory).count
            self.lastSync = Date()
        }
        return (changed: changed, deleted: max(0, deleted), roots: rootsPaths)
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
        loadInventoryIfNeeded()
        let roots = availableRoots()
        if roots.isEmpty { return }
    // Paramètres (faciles à ajuster)
    let deletionObservationWindow: TimeInterval = 3.0
        // Determine canonical root (App Group prioritized)
        let canonicalRoot: URL? = {
            if let group = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents", isDirectory: true) { return group }
            return roots.first
        }()
        // Identify visible user Documents root (first non-group documents)
        let visibleRoot: URL? = {
            if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first { return docs }
            return nil
        }()
        var inventories: [URL: [String: FileMeta]] = [:]
        for root in roots {
            inventories[root] = buildInventory(root: root)
        }
        var allRelPaths: Set<String> = []
        for inv in inventories.values { allRelPaths.formUnion(inv.keys) }

        // Detect deletions (paths that existed before but now missing in at least one root)
        let now = Date().timeIntervalSince1970
        // Pass 1: mark missing previously tracked paths
    for (path, rec) in inventory {
            if rec.deletedAt != nil { continue }
            var presentSomewhere = false
            for (_, inv) in inventories { if inv[path] != nil { presentSomewhere = true; break } }
            if !presentSomewhere {
                var updated = rec
                updated.deletedAt = now
                inventory[path] = updated
                inventoryDirty = true
        print("🕳️ Mark deletion (missing everywhere) path=\(path)")
            }
        }

        // Pass 2: process current paths
        for rel in allRelPaths {
            var metas: [(root: URL, meta: FileMeta)] = []
            for (root, inv) in inventories { if let m = inv[rel] { metas.append((root, m)) } }
            guard !metas.isEmpty else { continue }
            let isDir = metas.first!.meta.isDir
            // Inventory record
            let rec = inventory[rel]
            let newestMeta = metas.max { a, b in
                if a.meta.modDate == b.meta.modDate { return a.meta.size < b.meta.size }
                return a.meta.modDate < b.meta.modDate
            }!
            let newestMTime = newestMeta.meta.modDate.timeIntervalSince1970

            if var existing = rec, let deletedAt = existing.deletedAt {
                // More permissive resurrection conditions:
                // 1. mtime newer than deletion
                // 2. File now present in visible user root (explicit user action)
                // 3. Deletion older than a grace window (2s) -> treat reappearance as recreation
               // let nowTs = now
                let presentInVisible = (visibleRoot != nil) ? (inventories[visibleRoot!]?[rel] != nil) : false
                // Resurrection désormais SEULEMENT si modification plus récente que la tombstone OU action explicite (visible)
                let resurrect = (newestMTime > deletedAt) || presentInVisible
                if resurrect {
                    existing.deletedAt = nil
                    existing.lastModified = max(existing.lastModified, newestMTime, deletedAt + 0.001)
                    inventory[rel] = existing; inventoryDirty = true
                    print("♻️ Resurrect rel=\(rel) mtime=\(newestMTime) deletedAt=\(deletedAt) presentVisible=\(presentInVisible)")
                } else {
                    // Enforce deletion: remove surviving copies
                    print("✂️ Enforce tombstone rel=\(rel) keep deletedAt=\(deletedAt) metas=\(metas.count)")
                    for m in metas { deleteItemIfExists(m.root.appendingPathComponent(rel)) }
                    continue
                }
            } else if rec == nil {
                inventory[rel] = InventoryRecord(lastModified: newestMTime, deletedAt: nil, lastSeenVisible: nil, missingVisibleSince: nil); inventoryDirty = true
                print("➕ Track new rel=\(rel) mtime=\(newestMTime)")
            } else {
                // update lastModified if advanced
                if let existing = rec, newestMTime > existing.lastModified + 0.5 {
                    inventory[rel]?.lastModified = newestMTime; inventoryDirty = true
                    print("🕓 Advance mtime rel=\(rel) -> \(newestMTime)")
                }
            }

            // Track presence in visible root
            if let vRoot = visibleRoot, inventories[vRoot]?[rel] != nil {
                if var existing = inventory[rel] {
                    existing.lastSeenVisible = now
                    existing.lastSeenVisibleRoot = vRoot.path
                    existing.missingVisibleSince = nil
                    inventory[rel] = existing; inventoryDirty = true
                }
            }

            // User deletion propagation: file missing in visible root but exists elsewhere and was previously seen there -> propagate deletion
            if let vRoot = visibleRoot,
               inventories[vRoot]?[rel] == nil,
               var existing = inventory[rel], existing.deletedAt == nil,
               let cRoot = canonicalRoot, inventories[cRoot]?[rel] != nil {
                // Ne considérer une suppression utilisateur QUE si le visible root qui manque
                // est le même que celui qui a initialement vu le fichier.
                if existing.lastSeenVisibleRoot == vRoot.path {
                    let nowTs = now
                    if existing.missingVisibleSince == nil {
                        existing.missingVisibleSince = nowTs
                        inventory[rel] = existing; inventoryDirty = true
                        print("⏳ Start missing window rel=\(rel) (root match)")
                    } else {
                        let elapsed = nowTs - (existing.missingVisibleSince ?? nowTs)
                        if elapsed > deletionObservationWindow {
                            var updated = existing; updated.deletedAt = nowTs; updated.missingVisibleSince = nil
                            inventory[rel] = updated; inventoryDirty = true
                            let e = String(format: "%.2f", elapsed)
                            print("🗑️ Confirm deletion rel=\(rel) elapsed=\(e)s (root match)")
                            for m in metas { deleteItemIfExists(m.root.appendingPathComponent(rel)) }
                            continue
                        } else {
                            let e2 = String(format: "%.2f", elapsed)
                            print("… waiting deletion window rel=\(rel) elapsed=\(e2)s / \(deletionObservationWindow)s (root match)")
                        }
                    }
                } else {
                    // Racine différente -> ne PAS interpréter comme suppression. On annule éventuellement un cycle en cours.
                    if existing.missingVisibleSince != nil {
                        existing.missingVisibleSince = nil
                        inventory[rel] = existing; inventoryDirty = true
                        print("� Ignore missing (root mismatch) rel=\(rel)")
                    }
                }
            }

            if isDir { for root in roots { ensureDirectory(root.appendingPathComponent(rel)) }; continue }
            // Winner: canonical root file if exists, else newest
            let winner: (root: URL, meta: FileMeta) = {
                if let canon = canonicalRoot, let meta = inventories[canon]?[rel] { return (canon, meta) }
                return newestMeta
            }()
            // Si un cycle de suppression utilisateur est en cours (missingVisibleSince actif) on NE recopie PAS vers le visible root
            var skipVisibleCopy = false
            if let vRoot = visibleRoot, let rec2 = inventory[rel], rec2.missingVisibleSince != nil, inventories[vRoot]?[rel] == nil, rec2.lastSeenVisibleRoot == vRoot.path {
                let elapsed = now - (rec2.missingVisibleSince ?? now)
                if elapsed < deletionObservationWindow {
                    skipVisibleCopy = true
                    let e3 = String(format: "%.2f", elapsed)
                    print("🚫 Skip recreate during pending deletion rel=\(rel) elapsed=\(e3)s")
                }
            }
        // END pending deletion guard
            for root in roots {
                if skipVisibleCopy, let vRoot = visibleRoot, root == vRoot { continue }
                let dest = root.appendingPathComponent(rel)
                if root == winner.root { continue }
                if let existing = inventories[root]?[rel] {
                    if abs(existing.modDate.timeIntervalSince(winner.meta.modDate)) < 1 && existing.size == winner.meta.size { continue }
                    copyFile(from: winner.root.appendingPathComponent(rel), to: dest)
                } else {
                    ensureDirectory(dest.deletingLastPathComponent())
                    copyFile(from: winner.root.appendingPathComponent(rel), to: dest)
                }
            } // end for rel
        }
        print("🔄 FileSyncCoordinator sync complete roots=")
        for r in roots { print("   • \(r.path)") }
    cleanupSpuriousArtifacts(in: roots)
        persistInventoryIfNeeded()
    }

    private struct FileMeta { let isDir: Bool; let size: UInt64; let modDate: Date }

    private func buildInventory(root: URL) -> [String: FileMeta] {
        var map: [String: FileMeta] = [:]
        guard let enumerator = fm.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return map }
        let rootPath = root.resolvingSymlinksInPath().standardizedFileURL.path
        for case let url as URL in enumerator {
            let itemPath = url.resolvingSymlinksInPath().standardizedFileURL.path
            guard itemPath.hasPrefix(rootPath + "/") else { continue }
            let rel = String(itemPath.dropFirst(rootPath.count + 1))
            if rel.isEmpty { continue }
            if rel.contains("/var/mobile/Containers/Data") { continue }
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

    private func deleteItemIfExists(_ url: URL) {
        if fm.fileExists(atPath: url.path) {
            do { try fm.removeItem(at: url); print("🗑️ Deleted \(url.lastPathComponent)") } catch { print("⚠️ Delete failed: \(error)") }
        }
    }

    private func availableRoots() -> [URL] {
        var roots: [URL] = []
    // Option A: prioritize App Group as canonical; still include visible Documents as mirror, plus iCloud if present.
    if let group = fm.containerURL(forSecurityApplicationGroupIdentifier: "group.atome.one")?.appendingPathComponent("Documents", isDirectory: true) { roots.append(group) }
    if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first { roots.append(docs) }
    if let ubiq = fm.url(forUbiquityContainerIdentifier: nil)?.appendingPathComponent("Documents", isDirectory: true) { roots.append(ubiq) }
        var seen: Set<String> = []
        return roots.filter { r in let k = r.path; if seen.contains(k) { return false }; seen.insert(k); return true }
    }

    // MARK: - Cleanup of spurious duplicated private* folders and nested canonical dirs
    private func cleanupSpuriousArtifacts(in roots: [URL]) {
        let canonical = Set(["Projects","Exports","Recordings","Templates","Testing"])
        for root in roots {
            // Remove repeated private* artifacts at root level
            if let entries = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) {
                for dir in entries {
                    guard (try? dir.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else { continue }
                    let name = dir.lastPathComponent
                    if let match = canonical.first(where: { name.hasSuffix($0) }) {
                        let prefix = name.replacingOccurrences(of: match, with: "")
                        if !prefix.isEmpty, prefix.replacingOccurrences(of: "private", with: "").isEmpty {
                            // Move contents then remove folder
                            let target = root.appendingPathComponent(match, isDirectory: true)
                            try? fm.createDirectory(at: target, withIntermediateDirectories: true)
                            if let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
                                for f in files {
                                    let dest = target.appendingPathComponent(f.lastPathComponent)
                                    if fm.fileExists(atPath: dest.path) { continue }
                                    do { try fm.moveItem(at: f, to: dest); print("🧹 Moved \(f.lastPathComponent) -> \(match)") } catch { print("⚠️ Cleanup move failed: \(error)") }
                                }
                            }
                            do { try fm.removeItem(at: dir); print("🧹 Removed spurious folder \(name)") } catch { print("⚠️ Cleanup remove failed: \(error)") }
                        }
                    }
                }
            }
            // Flatten nested canonical folders inside Exports
            let exports = root.appendingPathComponent("Exports", isDirectory: true)
            if fm.fileExists(atPath: exports.path) {
                for sub in canonical.subtracting(["Exports"]) {
                    let nested = exports.appendingPathComponent(sub, isDirectory: true)
                    if fm.fileExists(atPath: nested.path) {
                        let top = root.appendingPathComponent(sub, isDirectory: true)
                        try? fm.createDirectory(at: top, withIntermediateDirectories: true)
                        if let files = try? fm.contentsOfDirectory(at: nested, includingPropertiesForKeys: nil) {
                            for f in files {
                                let dest = top.appendingPathComponent(f.lastPathComponent)
                                if fm.fileExists(atPath: dest.path) { continue }
                                do { try fm.moveItem(at: f, to: dest); print("🧹 Flattened \(sub) item -> top-level") } catch { print("⚠️ Flatten move failed: \(error)") }
                            }
                        }
                        try? fm.removeItem(at: nested)
                    }
                }
            }
        }
    }
}

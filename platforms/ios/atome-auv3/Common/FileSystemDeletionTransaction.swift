import Foundation

struct FileSystemDeletionTarget {
    let url: URL
}

enum FileSystemDeletionTransactionError: LocalizedError {
    case coordinatorAccessorNotInvoked
    case deletionNotConfirmed(String)

    var errorDescription: String? {
        switch self {
        case .coordinatorAccessorNotInvoked:
            return "File coordinator did not perform the deletion"
        case .deletionNotConfirmed(let path):
            return "File deletion was not confirmed: \(path)"
        }
    }
}

struct FileSystemDeletionTransaction {
    typealias Coordinate = (URL, (URL) -> Void) -> Error?
    typealias RemoveItem = (URL) throws -> Void
    typealias FileExists = (String) -> Bool
    typealias MarkDeleted = (URL) -> Void
    typealias Sync = () -> Void

    private let coordinate: Coordinate
    private let removeItem: RemoveItem
    private let fileExists: FileExists
    private let markDeleted: MarkDeleted
    private let sync: Sync

    init(
        coordinate: @escaping Coordinate,
        removeItem: @escaping RemoveItem,
        fileExists: @escaping FileExists,
        markDeleted: @escaping MarkDeleted,
        sync: @escaping Sync
    ) {
        self.coordinate = coordinate
        self.removeItem = removeItem
        self.fileExists = fileExists
        self.markDeleted = markDeleted
        self.sync = sync
    }

    func delete(_ target: FileSystemDeletionTarget) throws {
        try removeAndConfirm(target)
        markDeleted(target.url)
        sync()
    }

    func deleteAll(_ targets: [FileSystemDeletionTarget]) -> [URL] {
        var failures: [URL] = []
        var deleted: [URL] = []
        for target in targets {
            do {
                try removeAndConfirm(target)
                deleted.append(target.url)
            } catch {
                failures.append(target.url)
            }
        }
        deleted.forEach(markDeleted)
        if !deleted.isEmpty { sync() }
        return failures
    }

    private func removeAndConfirm(_ target: FileSystemDeletionTarget) throws {
        var accessorError: Error?
        var coordinatedPath: String?
        let coordinatorError = coordinate(target.url) { coordinatedURL in
            coordinatedPath = coordinatedURL.path
            do { try removeItem(coordinatedURL) }
            catch { accessorError = error }
        }
        if let coordinatorError { throw coordinatorError }
        if let accessorError { throw accessorError }
        guard let coordinatedPath else {
            throw FileSystemDeletionTransactionError.coordinatorAccessorNotInvoked
        }
        guard !fileExists(coordinatedPath), !fileExists(target.url.path) else {
            throw FileSystemDeletionTransactionError.deletionNotConfirmed(target.url.path)
        }
    }
}

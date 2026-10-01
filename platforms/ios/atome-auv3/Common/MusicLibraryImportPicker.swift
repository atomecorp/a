import AVFoundation
import MediaPlayer
import UIKit

// Apple Music / Music library import.
//
// The Music library is neither a folder of the Files provider nor part of
// Apple Photos: `MPMediaPickerController` is the only system surface that
// shows it. Each picked track is exported to an M4A file and handed to the
// file bridge with the same (name, data) contract as the other pickers, so
// the web layer keeps parsing a single shape.
//
// A track protected by DRM (an Apple Music subscription title) or only
// present in the cloud has no exportable asset: it is skipped, and when
// nothing readable remains the bridge answers with the localized message the
// web layer sent (`protectedMessage`).
final class MusicLibraryImportPicker: NSObject, MPMediaPickerControllerDelegate {
    private static let associationKey = "MusicLibraryImportPickerRetainer"
    private let completion: (Bool, [(String, Data)]?, Error?) -> Void
    private let protectedMessage: String

    private init(protectedMessage: String, completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) {
        self.protectedMessage = protectedMessage
        self.completion = completion
    }

    static func loadTracks(
        allowsMultiple: Bool,
        protectedMessage: String,
        from viewController: UIViewController,
        completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void
    ) {
        let reader = MusicLibraryImportPicker(protectedMessage: protectedMessage, completion: completion)
        let present = {
            let controller = MPMediaPickerController(mediaTypes: .music)
            controller.allowsPickingMultipleItems = allowsMultiple
            controller.showsCloudItems = false
            controller.delegate = reader
            objc_setAssociatedObject(viewController, Self.associationKey, reader, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            viewController.present(controller, animated: true)
        }
        // The picker shows nothing until the library is authorized: ask first,
        // and answer a refusal with an error instead of an empty sheet.
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized:
            DispatchQueue.main.async(execute: present)
        case .notDetermined:
            MPMediaLibrary.requestAuthorization { status in
                DispatchQueue.main.async {
                    if status == .authorized {
                        present()
                    } else {
                        completion(false, nil, Self.error(code: -3, "Music library access denied"))
                    }
                }
            }
        default:
            completion(false, nil, Self.error(code: -3, "Music library access denied"))
        }
    }

    private static func error(code: Int, _ message: String) -> NSError {
        NSError(domain: "MusicLibraryImport", code: code, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func release(_ viewController: UIViewController?) {
        guard let viewController else { return }
        objc_setAssociatedObject(viewController, associationKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    func mediaPickerDidCancel(_ mediaPicker: MPMediaPickerController) {
        let host = mediaPicker.presentingViewController
        mediaPicker.dismiss(animated: true) { [weak self] in
            defer { Self.release(host) }
            self?.completion(false, nil, Self.error(code: -1, "User cancelled"))
        }
    }

    func mediaPicker(_ mediaPicker: MPMediaPickerController, didPickMediaItems collection: MPMediaItemCollection) {
        let host = mediaPicker.presentingViewController
        let items = collection.items
        mediaPicker.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            self.export(items, index: 0, collected: [], skippedProtected: 0) { success, results, error in
                defer { Self.release(host) }
                self.completion(success, results, error)
            }
        }
    }

    private func export(
        _ items: [MPMediaItem],
        index: Int,
        collected: [(String, Data)],
        skippedProtected: Int,
        done: @escaping (Bool, [(String, Data)]?, Error?) -> Void
    ) {
        guard index < items.count else {
            if !collected.isEmpty {
                done(true, collected, nil)
            } else if skippedProtected > 0 {
                done(false, nil, Self.error(code: -4, protectedMessage))
            } else {
                done(false, nil, Self.error(code: -2, "No readable track"))
            }
            return
        }
        let item = items[index]
        let next = { (entry: (String, Data)?, isProtected: Bool) in
            var accumulated = collected
            if let entry { accumulated.append(entry) }
            self.export(
                items,
                index: index + 1,
                collected: accumulated,
                skippedProtected: skippedProtected + (isProtected ? 1 : 0),
                done: done
            )
        }
        guard let assetURL = item.assetURL, !item.hasProtectedAsset, !item.isCloudItem else {
            next(nil, true)
            return
        }
        let asset = AVURLAsset(url: assetURL)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            next(nil, false)
            return
        }
        let name = Self.fileName(for: item, index: index)
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("m4a")
        session.outputURL = output
        session.outputFileType = .m4a
        session.exportAsynchronously {
            defer { try? FileManager.default.removeItem(at: output) }
            guard session.status == .completed, let data = try? Data(contentsOf: output), !data.isEmpty else {
                DispatchQueue.main.async { next(nil, false) }
                return
            }
            DispatchQueue.main.async { next((name, data), false) }
        }
    }

    // « Artiste - Titre.m4a », reduced to characters every store accepts.
    private static func fileName(for item: MPMediaItem, index: Int) -> String {
        let parts = [item.artist, item.title]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let raw = parts.isEmpty ? "track_\(index + 1)" : parts.joined(separator: " - ")
        let forbidden = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        let cleaned = raw.components(separatedBy: forbidden).joined(separator: "_")
        return "\(cleaned).m4a"
    }
}

import Foundation
#if canImport(UIKit)
import UIKit
import UniformTypeIdentifiers
#endif

/// Host acquisition only; project creation belongs to the canonical JS command path.
final class AppNativeClipboardController {
    static let shared = AppNativeClipboardController()
    private static let copyType = "one.atome.clipboard.copy-key"
    private init() {}

    static func canHandle(command: String) -> Bool {
        ["clipboard_read_text", "clipboard_write_text", "clipboard_has_text", "clipboard_read_items"].contains(command)
    }

    func handle(command: String, payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        #if canImport(UIKit)
        runOnMain {
            let board = UIPasteboard.general
            switch command {
            case "clipboard_write_text":
                var item: [String: Any] = [UTType.utf8PlainText.identifier: (payload["text"] as? String) ?? ""]
                if let key = payload["copyKey"] as? String { item[Self.copyType] = key }
                board.items = [item]
                completion(["success": true, "revision": board.changeCount], nil)
            case "clipboard_has_text":
                completion(["success": true, "has_text": board.hasStrings], nil)
            case "clipboard_read_text":
                let text = board.hasStrings ? (board.string ?? "") : ""
                completion(["success": true, "text": text, "revision": board.changeCount], nil)
            case "clipboard_read_items":
                let revision = board.changeCount
                let providers = board.itemProviders
                let marker = board.value(forPasteboardType: Self.copyType)
                let key = (marker as? String) ?? (marker as? Data).flatMap { String(data: $0, encoding: .utf8) }
                // Deferred Photos/Files representations are acquired asynchronously, off the audio thread.
                self.readProviders(providers, index: 0, items: []) { items, error in
                    self.runOnMain {
                        guard error == nil, let items = items else {
                            completion(["success": false, "error": "clipboard_item_unreadable",
                                        "detail": (error?.localizedDescription ?? "") + " [" + providers.flatMap { $0.registeredTypeIdentifiers }.joined(separator: ",") + "]"], nil); return
                        }
                        guard board.changeCount == revision else {
                            completion(["success": false, "error": "clipboard_changed"], nil); return
                        }
                        var result: [String: Any] = ["success": true, "revision": revision, "items": items]
                        if let key = key { result["copy_key"] = key }
                        completion(result, nil)
                    }
                }
            default:
                completion(["success": false, "error": "clipboard_command_unsupported"], nil)
            }
        }
        #else
        completion(["success": false, "error": "clipboard_unavailable"], nil)
        #endif
    }

    #if canImport(UIKit)
    private func fileItem(data: Data, name: String, mime: String) -> [String: Any] {
        ["kind": "file", "name": name, "mime_type": mime, "base64": data.base64EncodedString()]
    }

    private func readProviders(_ providers: [NSItemProvider], index: Int, items: [[String: Any]],
                               completion: @escaping ([[String: Any]]?, Error?) -> Void) {
        guard index < providers.count else { completion(items, nil); return }
        readProvider(providers[index]) { item, error in
            guard error == nil else { completion(nil, error); return }
            self.readProviders(providers, index: index + 1, items: item.map { items + [$0] } ?? items, completion: completion)
        }
    }

    private func readProvider(_ provider: NSItemProvider,
                              completion: @escaping ([String: Any]?, Error?) -> Void) {
        let types = provider.registeredTypeIdentifiers.filter { $0 != Self.copyType }
        // One primary representation per logical item; a movie's poster is not another image Atome.
        if let identifier = types.first(where: { UTType($0)?.conforms(to: .movie) == true })
            ?? types.first(where: { UTType($0)?.conforms(to: .audio) == true }) {
            provider.loadFileRepresentation(forTypeIdentifier: identifier) { url, error in
                guard let url = url, error == nil else { completion(nil, error ?? CocoaError(.fileReadUnknown)); return }
                do {
                    // The provider owns this temporary URL only during its callback.
                    let data = try Data(contentsOf: url)
                    let type = UTType(identifier)
                    completion(self.fileItem(data: data, name: url.lastPathComponent,
                                             mime: type?.preferredMIMEType ?? "application/octet-stream"), nil)
                } catch { completion(nil, error) }
            }
            return
        }
        if types.contains(where: { UTType($0)?.conforms(to: .image) == true }) && provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { object, error in
                guard let image = object as? UIImage, let data = image.pngData(), error == nil else {
                    completion(nil, error ?? CocoaError(.fileReadCorruptFile)); return
                }
                completion(self.fileItem(data: data, name: "clipboard.png", mime: "image/png"), nil)
            }
            return
        }
        if let identifier = types.first(where: { UTType($0)?.conforms(to: .url) == true }) {
            provider.loadItem(forTypeIdentifier: identifier, options: nil) { item, error in
                guard error == nil else { completion(nil, error); return }
                let url = (item as? URL) ?? (item as? String).flatMap { URL(string: $0) }
                guard let url = url else { completion(nil, CocoaError(.fileReadUnknown)); return }
                if !url.isFileURL { completion(["kind": "text", "text": url.absoluteString], nil); return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                do {
                    let data = try Data(contentsOf: url)
                    let type = UTType(filenameExtension: url.pathExtension)
                    completion(self.fileItem(data: data, name: url.lastPathComponent,
                                             mime: type?.preferredMIMEType ?? "application/octet-stream"), nil)
                } catch { completion(nil, error) }
            }
            return
        }
        if let identifier = types.first(where: { UTType($0)?.conforms(to: .plainText) == true }) {
            provider.loadDataRepresentation(forTypeIdentifier: identifier) { data, error in
                let encoding: String.Encoding = identifier.contains("utf16") ? .utf16 : .utf8
                let text = data.flatMap { String(data: $0, encoding: encoding) }
                if let text = text, error == nil { completion(["kind": "text", "text": text], nil) }
                else { completion(nil, error ?? CocoaError(.fileReadUnknown)) }
            }
            return
        }
        if types.isEmpty { completion(nil, nil) }
        else { completion(nil, CocoaError(.fileReadUnknown)) }
    }

    private func runOnMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }
    #endif
}

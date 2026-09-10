import Foundation

#if canImport(UIKit)
import UIKit
#endif

/// Bridges the host pasteboard to the web layer.
///
/// `squirrel.css` pins `-webkit-touch-callout: none` on html/body so the native
/// edit bubble (Copy / Paste) never appears over a surface the product draws
/// itself, and WKWebView exposes no `navigator.clipboard.readText`. Without
/// these commands there is simply no way to paste into atome on iOS.
///
/// Command names are shared verbatim with the Tauri desktop commands so the JS
/// facade (`eVe/intuition/tools/clipboard/system_bridge.js`) issues one call for
/// every native host.
final class AppNativeClipboardController {
    static let shared = AppNativeClipboardController()

    private init() {}

    static func canHandle(command: String) -> Bool {
        command == "clipboard_read_text"
            || command == "clipboard_write_text"
            || command == "clipboard_has_text"
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        #if canImport(UIKit)
        // UIPasteboard is main-thread only.
        runOnMain {
            switch command {
            case "clipboard_write_text":
                UIPasteboard.general.string = (payload["text"] as? String) ?? ""
                completion(["success": true], nil)

            case "clipboard_read_text":
                // Touching `.string` is what raises the iOS 16+ "Allow Paste?"
                // prompt. It is only ever reached from an explicit user gesture,
                // never at boot and never in the background — use
                // `clipboard_has_text` for anything speculative.
                //
                // `hasStrings` first, and it is not an optimisation: without it
                // an empty pasteboard still costs the user a permission alert
                // for nothing.
                guard UIPasteboard.general.hasStrings else {
                    completion(["success": true, "text": "", "has_text": false], nil)
                    return
                }
                let text = UIPasteboard.general.string ?? ""
                completion(["success": true, "text": text, "has_text": !text.isEmpty], nil)

            case "clipboard_has_text":
                // `hasStrings` is silent: no system prompt. This is what lets the
                // UI dim a Paste control without the user being asked anything.
                completion(["success": true, "has_text": UIPasteboard.general.hasStrings], nil)

            default:
                completion(["success": false], "Unsupported clipboard command: \(command)")
            }
        }
        #else
        completion(["success": false], "Clipboard unavailable on this platform")
        #endif
    }

    #if canImport(UIKit)
    private func runOnMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }
    #endif
}

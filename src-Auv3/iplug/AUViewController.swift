import UIKit
import WebKit
import AVFoundation

class AUViewController: UIViewController, WKScriptMessageHandler, UIDocumentPickerDelegate {
    var webView: WKWebView!
    var au: AUv3Interface? // Placeholder protocol to AU parameters

    override func viewDidLoad() {
        super.viewDidLoad()
    let contentController = WKUserContentController()
    contentController.add(self, name: "squirrel")
    contentController.add(self, name: "swiftBridge")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        webView = WKWebView(frame: self.view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        self.view.addSubview(webView)

        // Load local Squirrel UI index from bundle or injected string later
        // Intentionally not loading any HTML here; JS will create DOM elements via Squirrel
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "squirrel" || message.name == "swiftBridge" else { return }
        guard let body = message.body as? [String: Any] else { return }
        guard let type = body["type"] as? String else { return }
        if type == "param" {
            let id = body["id"] as? String ?? ""
            let value = (body["value"] as? NSNumber)?.floatValue ?? 0.0
            switch id {
            case "gain": au?.setParam(.gain, value: value)
            case "play": au?.setParam(.play, value: value)
            case "position": au?.setParam(.positionFrames, value: value)
            default: break
            }
        } else if (type == "loadFile") {
            presentFilePicker()
        } else if (type == "iplug") {
            let action = body["action"] as? String ?? ""
            if action == "loadLocalPath" {
                if let rel = body["relativePath"] as? String, let base = appGroupURL() {
                    // Normalize: allow relative paths like "Recordings/Name.m4a"
                    let full = base.appendingPathComponent("Documents").appendingPathComponent(rel)
                    au?.loadFile(full.path)
                }
            }
        }
    }

    func sendMeter(tag: String, level: Float) {
        let js = "window.dispatchEvent(new CustomEvent('meter', { detail: { tag: '" + tag + "', level: " + String(level) + " } }))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

protocol AUv3Interface {
    func setParam(_ id: AUParamID, value: Float)
    func loadFile(_ pathInAppGroup: String)
}

enum AUParamID {
    case gain
    case play
    case positionFrames
}

// MARK: - File picker / App Group copy
extension AUViewController {
    func presentFilePicker() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.audio])
        picker.allowsMultipleSelection = false
        picker.delegate = self
        self.present(picker, animated: true, completion: nil)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        if let dest = copyToAppGroupIfNeeded(srcURL: url, relativePath: "Shared/input.wav") {
            au?.loadFile(dest.path)
        }
    }

    func appGroupURL() -> URL? {
        // Try preferred group IDs in order
        let ids = ["group.atome.one", "group.atome.shared"]
        for g in ids {
            if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) { return url }
        }
        return nil
    }

    func copyToAppGroupIfNeeded(srcURL: URL, relativePath: String) -> URL? {
        guard let container = appGroupURL() else { return nil }
        let dst = container.appendingPathComponent(relativePath)
        do {
            try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: dst.path) {
                try FileManager.default.removeItem(at: dst)
            }
            let access = srcURL.startAccessingSecurityScopedResource()
            defer { if access { srcURL.stopAccessingSecurityScopedResource() } }
            try FileManager.default.copyItem(at: srcURL, to: dst)
            return dst
        } catch {
            print("copyToAppGroupIfNeeded error: \(error)")
            return nil
        }
    }
}

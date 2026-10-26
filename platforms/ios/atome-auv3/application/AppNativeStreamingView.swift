import WebKit

/// The internal page of a service (France TV, Divertissement › Vidéo › Films & séries,
/// eVe/domains/media/streaming_view.js) for the iOS application: the native owner shared
/// with Tauri macOS (Common/AtomeStreamingView.m) lays the service's own site BEHIND the
/// app page, seen through the canvas cut-out, and raises it while the person acts in it.
/// This adapter only carries the page's commands to that owner, on the main thread.
final class AppNativeStreamingView {
    static let shared = AppNativeStreamingView()

    private static let commands: Set<String> = ["streaming_view_open", "streaming_view_place", "streaming_view_front",
                                                "streaming_view_media", "streaming_view_close"]
    private weak var host: WKWebView?

    static func canHandle(command: String) -> Bool { commands.contains(command) }

    func attach(webView: WKWebView) {
        DispatchQueue.main.async { self.host = webView }
    }

    private final class Reply {
        let completion: ([String: Any], String?) -> Void
        init(_ completion: @escaping ([String: Any], String?) -> Void) { self.completion = completion }
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            guard let host = self.host else { completion(["ok": false, "error": "streaming_view_host_missing"], nil); return }
            guard let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else {
                completion(["ok": false, "error": "streaming_view_request_invalid"], nil); return
            }
            let context = Unmanaged.passRetained(Reply(completion)).toOpaque()
            atome_streaming_view_invoke(Unmanaged.passUnretained(host).toOpaque(), command, json, context) { context, text in
                guard let context else { return }
                let reply = Unmanaged<Reply>.fromOpaque(context).takeRetainedValue()
                let value = text.flatMap { String(cString: $0).data(using: .utf8) }
                    .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                reply.completion(value ?? ["ok": false, "error": "streaming_view_reply_invalid"], nil)
            }
        }
    }
}

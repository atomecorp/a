import Foundation

/// Native requests for the page's one assistant (CarPlay, Siri). Native code only
/// asks; the page owns the assistant (assistant_native_link.js). The latest request is
/// kept until the page takes it, so one made before the page installed its link (cold
/// launch) is not lost; the page event only says that a request is waiting.
final class AssistantRequestInbox {
    static let shared = AssistantRequestInbox()
    private static let takeCommand = "assistant_request_take"
    private var pending: [String: String]?

    private init() {}

    static func canHandle(command: String) -> Bool { command == takeCommand }

    /// Main thread only.
    func request(action: String, source: String, surface: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        pending = ["action": action, "source": source, "surface": surface]
        WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('eve:assistant-request'));",
                                  label: "assistant.request", priority: .high)
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            let request = self.pending
            self.pending = nil
            completion(request ?? [:], nil)
        }
    }
}

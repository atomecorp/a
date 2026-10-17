import Foundation

// Where the user was working, kept across a page or process the system reclaimed.
// The page publishes it on each workspace change and reads it once it has booted.
// The window scene stores it in its restoration state, which iOS keeps when it
// terminates the app in the background and discards when the user closes the app
// from the switcher: a deliberate cold start still opens the home.
final class AppWorkspaceResume: ObservableObject {
    static let shared = AppWorkspaceResume()

    @Published private(set) var stored = ""

    private init() {}

    static func canHandle(command: String) -> Bool {
        command == "workspace_resume_read" || command == "workspace_resume_publish"
    }

    // Seeded from the scene's restoration state before the page asks for it.
    func restore(_ value: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        if stored.isEmpty { stored = value }
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            if command == "workspace_resume_read" {
                completion(["ok": true, "target": self.readTarget()], nil)
                return
            }
            let principal = (payload["principal"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let projectId = (payload["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !principal.isEmpty, !projectId.isEmpty else {
                self.stored = ""
                completion(["ok": true], nil)
                return
            }
            guard let data = try? JSONSerialization.data(withJSONObject: ["principal": principal, "projectId": projectId]),
                  let encoded = String(data: data, encoding: .utf8) else {
                completion([:], "workspace_resume_encode_failed")
                return
            }
            self.stored = encoded
            completion(["ok": true], nil)
        }
    }

    private func readTarget() -> Any {
        guard let data = stored.data(using: .utf8),
              let target = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return NSNull() }
        return target
    }
}

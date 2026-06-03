import Foundation

final class AppNativeBevyRendererController {
    static let shared = AppNativeBevyRendererController()

    private static let commands: Set<String> = [
        "bevy_native_start",
        "bevy_native_apply_ops",
        "bevy_native_resize"
    ]

    private init() {}

    static func canHandle(command: String) -> Bool {
        commands.contains(command.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        let normalizedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AppNativeBevyRendererController.canHandle(command: normalizedCommand) else {
            completion(["success": false], "ios_bevy_native_command_unsupported:\(normalizedCommand)")
            return
        }
        completion([
            "success": false,
            "native": true,
            "command": normalizedCommand,
            "payload_keys": Array(payload.keys).sorted()
        ], "ios_bevy_native_rust_renderer_not_linked")
    }
}

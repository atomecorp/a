import Foundation

final class AppNativeBevyRendererController {
    static let shared = AppNativeBevyRendererController()

    private static let commands: Set<String> = [
        "bevy_native_start",
        "bevy_native_apply_ops",
        "bevy_native_resize"
    ]

    private init() {}

    private func stringValue(_ value: Any?) -> String {
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? "<empty>" : trimmed
        }
        if let number = value as? NSNumber { return String(describing: number) }
        if value == nil { return "<nil>" }
        return String(describing: value)
    }

    private func sceneSummary(_ payload: [String: Any]) -> [String: Any] {
        guard let scene = payload["scene"] as? [String: Any] else {
            return [
                "node_count": 0,
                "media_node_count": 0,
                "texture_node_count": 0,
                "sample_ids": []
            ]
        }
        let nodes = scene["nodes"] as? [[String: Any]] ?? []
        var mediaNodeCount = 0
        var textureNodeCount = 0
        var sampleIds: [String] = []
        for node in nodes {
            let kind = String(describing: node["kind"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if kind == "image" || kind == "video" || kind == "audio_waveform" {
                mediaNodeCount += 1
            }
            if node["texture"] != nil {
                textureNodeCount += 1
            }
            if sampleIds.count < 6,
               let id = node["id"] as? String,
               !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                sampleIds.append(id)
            }
        }
        return [
            "node_count": nodes.count,
            "media_node_count": mediaNodeCount,
            "texture_node_count": textureNodeCount,
            "sample_ids": sampleIds
        ]
    }

    private func opsSummary(_ payload: [String: Any]) -> [String: Any] {
        let ops = payload["ops"] as? [[String: Any]] ?? []
        var spawnCount = 0
        var despawnCount = 0
        var resourceCount = 0
        var mediaSpawnCount = 0
        var sampleIds: [String] = []
        for op in ops {
            let type = String(describing: op["type"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if type == "spawn" { spawnCount += 1 }
            if type == "despawn" { despawnCount += 1 }
            if type == "resource" { resourceCount += 1 }
            if let node = op["node"] as? [String: Any] {
                let kind = String(describing: node["kind"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if type == "spawn" && (kind == "image" || kind == "video" || kind == "audio_waveform") {
                    mediaSpawnCount += 1
                }
                if sampleIds.count < 6,
                   let id = node["id"] as? String,
                   !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    sampleIds.append(id)
                }
            } else if sampleIds.count < 6, let id = op["id"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                sampleIds.append(id)
            }
        }
        return [
            "op_count": ops.count,
            "spawn_count": spawnCount,
            "despawn_count": despawnCount,
            "resource_count": resourceCount,
            "media_spawn_count": mediaSpawnCount,
            "sample_ids": sampleIds
        ]
    }

    private func log(_ stage: String, _ fields: [String: Any]) {
        let sorted = fields.keys.sorted().map { key in
            "\(key)=\(stringValue(fields[key]))"
        }.joined(separator: " ")
        print("[IOS_BEVY] \(stage) \(sorted)")
    }

    private func notLinkedResponse(command: String, payload: [String: Any]) -> [String: Any] {
        var response: [String: Any] = [
            "success": false,
            "native": true,
            "platform": "ios",
            "command": command,
            "rust_linked": false,
            "rust_compiled": false,
            "bevy_core_linked": false,
            "presentable": false,
            "renderer_mode": "rust_not_linked",
            "error": "ios_bevy_native_rust_renderer_not_linked",
            "payload_keys": Array(payload.keys).sorted()
        ]
        if command == "bevy_native_start" {
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["width"] = payload["width"] ?? 0
            response["height"] = payload["height"] ?? 0
            response["scene"] = sceneSummary(payload)
        } else if command == "bevy_native_apply_ops" {
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["ops"] = opsSummary(payload)
        } else if command == "bevy_native_resize" {
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["width"] = payload["width"] ?? 0
            response["height"] = payload["height"] ?? 0
        }
        return response
    }

    static func canHandle(command: String) -> Bool {
        commands.contains(command.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        let normalizedCommand = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AppNativeBevyRendererController.canHandle(command: normalizedCommand) else {
            log("unsupported", [
                "command": normalizedCommand,
                "payload_keys": Array(payload.keys).sorted()
            ])
            completion(["success": false], "ios_bevy_native_command_unsupported:\(normalizedCommand)")
            return
        }
        let response = notLinkedResponse(command: normalizedCommand, payload: payload)
        log("not_linked", response)
        completion(response, "ios_bevy_native_rust_renderer_not_linked")
    }
}

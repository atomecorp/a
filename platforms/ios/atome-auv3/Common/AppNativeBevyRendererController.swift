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

    private func intFlag(_ value: UInt8) -> Int {
        value == 0 ? 0 : 1
    }

    private func rendererMode(_ pointer: UnsafePointer<CChar>?) -> String {
        guard let pointer else { return "unknown" }
        return String(cString: pointer)
    }

    private func sceneJSONString(_ payload: [String: Any]) -> String? {
        guard let scene = payload["scene"] as? [String: Any],
              JSONSerialization.isValidJSONObject(scene),
              let data = try? JSONSerialization.data(withJSONObject: scene, options: []) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func finiteDimension(_ value: Any?, fallback: Double = 0) -> Double {
        if let number = value as? NSNumber { return number.doubleValue }
        if let number = value as? Double { return number }
        if let number = value as? Float { return Double(number) }
        if let string = value as? String, let parsed = Double(string) { return parsed }
        return fallback
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

    private func linkedStatusFields() -> [String: Any] {
        let status = atome_ios_bevy_renderer_status()
        return [
            "abi_version": Int(status.abi_version),
            "rust_linked": intFlag(status.rust_linked),
            "rust_compiled": intFlag(status.rust_compiled),
            "bevy_core_linked": intFlag(status.bevy_core_linked),
            "presentable": intFlag(status.presentable),
            "renderer_mode": rendererMode(status.renderer_mode)
        ]
    }

    private func nativeResponse(command: String, payload: [String: Any]) -> [String: Any] {
        var response: [String: Any] = linkedStatusFields()
        response.merge([
            "success": true,
            "native": true,
            "platform": "ios",
            "command": command,
            "payload_keys": Array(payload.keys).sorted()
        ]) { _, new in new }
        if command == "bevy_native_start" {
            let width = finiteDimension(payload["width"])
            let height = finiteDimension(payload["height"])
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["width"] = width
            response["height"] = height
            response["scene"] = sceneSummary(payload)
            if let sceneJSON = sceneJSONString(payload) {
                let probe = sceneJSON.withCString { pointer in
                    atome_ios_bevy_scene_probe(pointer, width, height)
                }
                response["abi_version"] = Int(probe.abi_version)
                response["scene_decode_ok"] = intFlag(probe.scene_decode_ok)
                response["scene_probe_success"] = intFlag(probe.success)
                response["rust_linked"] = intFlag(probe.rust_linked)
                response["rust_compiled"] = intFlag(probe.rust_compiled)
                response["bevy_core_linked"] = intFlag(probe.bevy_core_linked)
                response["presentable"] = intFlag(probe.presentable)
                response["renderer_mode"] = rendererMode(probe.renderer_mode)
                response["probe_error_code"] = Int(probe.error_code)
                response["rust_scene"] = [
                    "node_count": Int(probe.node_count),
                    "media_node_count": Int(probe.media_node_count),
                    "texture_node_count": Int(probe.texture_node_count),
                    "source_node_count": Int(probe.source_node_count),
                    "text_node_count": Int(probe.text_node_count)
                ]
                if probe.success == 0 {
                    response["success"] = false
                    response["error"] = "ios_bevy_native_scene_probe_failed:\(probe.error_code)"
                }
            } else {
                response["success"] = false
                response["scene_decode_ok"] = 0
                response["scene_probe_success"] = 0
                response["probe_error_code"] = 1
                response["error"] = "ios_bevy_native_scene_json_invalid"
            }
        } else if command == "bevy_native_apply_ops" {
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["ops"] = opsSummary(payload)
        } else if command == "bevy_native_resize" {
            response["surface_id"] = stringValue(payload["surfaceId"])
            response["width"] = finiteDimension(payload["width"])
            response["height"] = finiteDimension(payload["height"])
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
        var response = nativeResponse(command: normalizedCommand, payload: payload)
        if response["success"] as? Bool == false {
            let error = String(describing: response["error"] ?? "ios_bevy_native_scene_probe_failed")
            log("failed", response)
            completion(response, error)
            return
        }
        if intFlag(atome_ios_bevy_renderer_status().presentable) == 0 {
            let mode = String(describing: response["renderer_mode"] ?? "linked_no_presenter")
            let error = "ios_bevy_native_not_presentable:\(mode)"
            response["success"] = false
            response["error"] = error
            log("not_presentable", response)
            completion(response, error)
            return
        }
        log("accepted", response)
        completion(response, nil)
    }
}

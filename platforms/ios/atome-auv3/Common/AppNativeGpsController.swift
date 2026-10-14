import Foundation
import os.log

// AiS is the trip and commit authority; this is a capability coordinator only.
final class AppNativeGpsController {
    static let shared = AppNativeGpsController()
    private struct Failure: LocalizedError { let code: String; var errorDescription: String? { code } }
    private struct Binding { let token: String, owner: String, trip: String, session: String; var revision: Int = 0 }
    private var binding: Binding?
    private var located: [String: ([String: Any], String?) -> Void] = [:]
    private var engineSource = ""
    private var processing = false
    private var effects: [[String: Any]] = []
    private static let log = Logger(subsystem: "atome", category: "GPS")
    private init() {
        atome_gps_set_authorization_callback { owner, session in
            guard let owner, let session, let current = AppNativeGpsController.shared.binding,
                  current.owner == String(cString: owner), current.session == String(cString: session),
                  let claims = try? AiSRuntime.verifyToken(current.token) else { return false }
            return claims["sub"] as? String == current.owner
        }
        atome_gps_set_effect_callback { json in
            guard let json, let effect = try? JSONSerialization.jsonObject(with: Data(String(cString: json).utf8)) as? [String: Any] else { return }
            DispatchQueue.main.async { AppNativeGpsController.shared.receive(effect) }
        }
    }
    static func canHandle(command: String) -> Bool { command == "gps_invoke" }
    private func invoke(_ input: [String: Any]) throws -> [String: Any] {
        let json = String(decoding: try JSONSerialization.data(withJSONObject: input), as: UTF8.self)
        let output = json.withCString { request in engineSource.withCString { atome_gps_invoke(request, $0) } }
        guard let output else { throw Failure(code: "HOST_UNSUPPORTED") }; defer { atome_gps_free(output) }
        guard let result = try JSONSerialization.jsonObject(with: Data(String(cString: output).utf8)) as? [String: Any] else { throw Failure(code: "INVALID_PROVIDER_RESPONSE") }
        guard result["ok"] as? Bool == true else { throw Failure(code: result["error"] as? String ?? "HOST_UNSUPPORTED") }
        return result
    }
    private func read(_ current: Binding) throws -> [String: Any] {
        let response = AiSRuntime.handleStateCurrentMessage(["action": "get", "atome_id": current.trip, "token": current.token])
        guard response["success"] as? Bool == true, let record = response["state"] as? [String: Any],
              record["owner_id"] as? String == current.owner, record["type"] as? String == "gps_trip",
              record["project_id"] as? String == nil, let props = record["properties"] as? [String: Any],
              props["__deleted"] as? Bool != true else { throw Failure(code: "TRIP_NOT_FOUND") }
        return props
    }
    private func persist(_ patch: [String: Any], _ current: Binding) throws {
        guard binding?.session == current.session else { throw Failure(code: "CONTEXT_CHANGED") }
        let props = try read(current)
        guard let revision = props["revision"] as? NSNumber, revision.intValue == binding?.revision else { throw Failure(code: "VERSION_CONFLICT") }
        var next = patch; next["revision"] = revision.intValue + 1; next["type"] = "gps_trip"
        let response = AiSRuntime.handleEventsMessage(["action": "commit", "token": current.token,
            "event": ["id": UUID().uuidString, "atome_id": current.trip, "kind": "set", "scope": "global",
                "payload": ["props": next, "expected_versions": ["revision": revision.intValue + 1]]]])
        guard response["success"] as? Bool == true else { throw Failure(code: "VERSION_CONFLICT") }
        binding?.revision = revision.intValue + 1
    }
    private func fail(_ error: Error) {
        Self.log.error("GPS session refused: \(error.localizedDescription, privacy: .public)")
        do { _ = try invoke(["operation": "fail", "error": error.localizedDescription]) }
        catch { Self.log.error("GPS release refused: \(error.localizedDescription, privacy: .public)") }
        binding = nil; effects.removeAll()
    }
    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            do {
                let operation = payload["operation"] as? String ?? "", token = payload["token"] as? String ?? ""
                if operation == "release" { _ = try self.invoke(["operation": operation]); self.binding = nil; self.effects.removeAll(); completion(["ok": true], nil); return }
                guard let claims = try AiSRuntime.verifyToken(token), let owner = claims["sub"] as? String else { throw Failure(code: "AUTH_REQUIRED") }
                if self.binding != nil, try self.invoke(["operation": "state"])["active"] as? Bool != true { self.binding = nil }
                let input = payload["input"] as? [String: Any] ?? [:]
                if operation == "state" {
                    completion(self.binding == nil || self.binding?.owner == owner ? try self.invoke(["operation": "state"])
                        : ["ok": true, "active": false, "trip_id": "", "background": true], nil); return
                }
                if operation == "locate" {
                    let id = UUID().uuidString; self.located[id] = { result, error in
                        guard let claims = try? AiSRuntime.verifyToken(token), claims["sub"] as? String == owner else {
                            completion(["ok": false, "error": "CONTEXT_CHANGED"], nil); return
                        }
                        completion(result, error)
                    }
                    do { _ = try self.invoke(["operation": "locate", "request_id": id]) }
                    catch { self.located.removeValue(forKey: id); throw error }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                        if self.located[id] != nil { do { _ = try self.invoke(["operation": "cancel_locate", "request_id": id]) }
                            catch { Self.log.error("GPS location release refused: \(error.localizedDescription, privacy: .public)") } }
                        self.located.removeValue(forKey: id)?(["ok": false, "error": "LOCATION_UNAVAILABLE"], nil)
                    }; return
                }
                if operation == "stop" {
                    if let current = self.binding, current.owner == owner {
                        _ = try self.invoke(["operation": "stop"])
                        try self.persist(["status": "stopped", "ended_at": AiSRuntime.isoNow()], current); self.binding = nil; self.effects.removeAll()
                    }
                    completion(["ok": true], nil); return
                }
                guard operation == "start", let id = input["trip_id"] as? String else { throw Failure(code: "INVALID_ARGUMENT") }
                if let current = self.binding {
                    guard current.owner == owner && current.trip == id else { throw Failure(code: "NAVIGATION_ALREADY_ACTIVE") }
                    completion(try self.invoke(["operation": "state"]), nil); return
                }
                var current = Binding(token: token, owner: owner, trip: id, session: UUID().uuidString)
                let props = try self.read(current)
                guard let revision = props["revision"] as? NSNumber else { throw Failure(code: "VERSION_CONFLICT") }
                current.revision = revision.intValue
                guard let route = props["route"] as? [String: Any] else { throw Failure(code: "NO_ROUTE") }
                guard let root = Bundle.main.resourceURL,
                      let source = try? String(contentsOf: root.appendingPathComponent("atome_runtime/src/wasm/gps_navigation_engine.js"), encoding: .utf8) else { throw Failure(code: "NOT_CONFIGURED") }
                self.engineSource = source
                self.binding = current
                let result: [String: Any]
                do { result = try self.invoke(["operation": "start", "trip_id": id, "route": route, "owner_id": owner, "session_id": current.session]) }
                catch { self.binding = nil; throw error }
                do { try self.persist(["status": "navigating", "navigation_device": "ios", "started_at": AiSRuntime.isoNow(), "ended_at": ""], current) }
                catch { _ = try self.invoke(["operation": "release"]); self.binding = nil; throw error }
                completion(result, nil)
            } catch { completion(["ok": false, "error": error.localizedDescription], nil) }
        }
    }
    private func receive(_ effect: [String: Any]) {
        if effect["type"] as? String == "located", let id = effect["request_id"] as? String {
            let callback = located.removeValue(forKey: id)
            if let error = effect["error"] as? String { callback?(["ok": false, "error": error], nil) }
            else if let position = effect["position"] as? [String: Any] { callback?(["ok": true].merging(position) { _, new in new }, nil) }
            return
        }
        guard effect["session_id"] as? String == binding?.session else { return }
        effects.append(effect); processNext()
    }
    private func processNext() {
        guard !processing, !effects.isEmpty, let current = binding else { return }
        let effect = effects.removeFirst(); processing = true
        guard effect["session_id"] as? String == current.session else { finish(); return }
        let type = effect["type"] as? String ?? ""
        if type == "arrived" || type == "interrupted" {
            do { _ = try invoke(["operation": "stop"])
                try persist(["status": type == "arrived" ? "arrived" : "interrupted", "ended_at": AiSRuntime.isoNow()], current); binding = nil
            } catch { fail(error) }
            finish(); return
        }
        guard type == "recalculate" else { finish(); return }
        do {
            let props = try read(current)
            guard let origin = effect["origin"], let destination = props["destination"] else { throw Failure(code: "INVALID_ARGUMENT") }
            let offset = (props["waypoint_offset"] as? Int ?? 0) + (effect["passed_waypoints"] as? Int ?? 0)
            let waypoints = Array((props["waypoints"] as? [[String: Any]] ?? []).dropFirst(offset))
            FastifySyncClient.shared.relayPublic(["type": "gps-resource", "action": "route", "requestId": UUID().uuidString,
                "input": ["origin": origin, "destination": destination, "waypoints": waypoints]]) { response in
                DispatchQueue.main.async {
                    defer { self.finish() }; guard self.binding?.session == current.session else { return }
                    do {
                        guard response["ok"] as? Bool == true, let route = response["route"] as? [String: Any] else {
                            _ = try self.invoke(["operation": "set_error", "session_id": current.session, "error": response["error"] ?? "PROVIDER_UNAVAILABLE"]); return
                        }
                        try self.persist(["route": route, "waypoint_offset": offset], current)
                        _ = try self.invoke(["operation": "replace_route", "session_id": current.session, "route": route])
                    } catch { self.fail(error) }
                }
            }
        } catch { fail(error); finish() }
    }
    private func finish() { processing = false; processNext() }
}

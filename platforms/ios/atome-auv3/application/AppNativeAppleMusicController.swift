import Foundation
import MusicKit
import OSLog

// MusicKit owns playback and the Apple library. This adapter owns no durable application state.
@MainActor
final class AppNativeAppleMusicController {
    static let shared = AppNativeAppleMusicController()
    private var busy = false
    private static let log = Logger(subsystem: "atome", category: "AppleMusic")
    nonisolated static func canHandle(_ command: String) -> Bool { command == "apple_music_invoke" }
    nonisolated static func handle(_ payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        Task { @MainActor in
            let controller = shared
            var writeStarted = false
            do {
                let token = payload["token"] as? String ?? ""
                let owner = try principal(token)
                let request = try AppleMusicRequest(operation: payload["operation"] as? String ?? "",
                    input: payload["input"] as? [String: Any] ?? [:])
                // A read (the player's state, covers, the library, a search) never waits for a command in
                // flight: the Dashboard follows the song every second while a play may take longer.
                let reading = ["get_state", "artwork", "search", "list_playlists", "list_library", "playlist_tracks"].contains(request.operation)
                if !reading { guard !controller.busy else { throw AppleMusicFailure(code: "BUSY") }; controller.busy = true }
                defer { if !reading { controller.busy = false } }
                let valid = {
                    guard try principal(token) == owner else { throw AppleMusicFailure(code: "CONTEXT_CHANGED") }
                    if ["create_playlist", "add_tracks", "favorite_current"].contains(request.operation) {
                        try verifyWrite(payload, request: request, owner: owner, token: token)
                    }
                }
                try valid()
                let result = try await controller.execute(request, check: valid, writeStarted: { writeStarted = true })
                try valid(); completion(result, nil)
            } catch let failure as AppleMusicFailure { completion(["ok": false, "error": failure.code, "effect_started": writeStarted], nil) }
            catch {
                let native = error as NSError
                log.error("MusicKit request failed domain=\(native.domain, privacy: .public) code=\(native.code)")
                completion(["ok": false, "error": "PROVIDER_UNAVAILABLE", "effect_started": writeStarted], nil)
            }
        }
    }
    private static func principal(_ token: String) throws -> String {
        guard let claims = try AiSRuntime.verifyToken(token), let owner = claims["sub"] as? String, !owner.isEmpty else {
            throw AppleMusicFailure(code: "AUTH_REQUIRED")
        }
        return owner
    }
    private static func verifyWrite(_ payload: [String: Any], request: AppleMusicRequest, owner: String, token: String) throws {
        guard let id = payload["request_id"] as? String, id.range(of: "^[A-Za-z0-9_-]{1,160}$", options: .regularExpression) != nil else {
            throw AppleMusicFailure(code: "INVALID_ARGUMENT")
        }
        let response = AiSRuntime.handleStateCurrentMessage(["action": "get", "atome_id": "apple_music_operation_" + id, "token": token])
        guard response["success"] as? Bool == true, let record = response["state"] as? [String: Any],
              record["owner_id"] as? String == owner, record["type"] as? String == "apple_music_operation", record["project_id"] as? String == nil,
              let props = record["properties"] as? [String: Any], props["__deleted"] as? Bool != true,
              props["status"] as? String == "submitting", let saved = props["request"] as? [String: Any],
              saved["action"] as? String == request.operation, let input = saved["input"] as? [String: Any],
              try JSONSerialization.data(withJSONObject: input, options: .sortedKeys) == JSONSerialization.data(withJSONObject: request.input, options: .sortedKeys) else {
            throw AppleMusicFailure(code: "OPERATION_CONFLICT")
        }
    }
    func state() -> [String: Any] {
        let authorization: String
        switch MusicAuthorization.currentStatus {
        case .authorized: authorization = "authorized"
        case .notDetermined: authorization = "not_determined"
        case .denied: authorization = "denied"
        case .restricted: authorization = "restricted"
        @unknown default: authorization = "restricted"
        }
        var result: [String: Any] = ["ok": true, "supported": true, "authorization": authorization,
            "capabilities": Array(AppleMusicRequest.fields.keys).sorted()]
        guard authorization == "authorized" else { return result }
        let player = SystemMusicPlayer.shared
        switch player.state.playbackStatus {
        case .playing: result["playback"] = "playing"
        case .paused: result["playback"] = "paused"
        case .stopped: result["playback"] = "stopped"
        default: result["playback"] = "opened_unconfirmed"
        }
        result["title"] = player.queue.currentEntry?.title ?? ""
        result["artist"] = player.queue.currentEntry?.subtitle ?? ""
        result["position"] = player.playbackTime
        if let entry = player.queue.currentEntry, case let .song(song) = entry.item {
            result["current_entry_id"] = entry.id; result["current_song_id"] = song.id.rawValue
            result["duration"] = song.duration ?? 0
        }
        return result
    }
    private func execute(_ request: AppleMusicRequest, check: () throws -> Void, writeStarted: () -> Void) async throws -> [String: Any] {
        if request.operation == "get_state" { return state() }
        if request.operation == "authorize" {
            let status = await MusicAuthorization.request(); try check()
            guard status == .authorized else { throw AppleMusicFailure(code: "PERMISSION_DENIED") }
            return state()
        }
        guard MusicAuthorization.currentStatus == .authorized else { throw AppleMusicFailure(code: "AUTHORIZATION_REQUIRED") }
        try check()
        if request.operation == "favorite_current" {
            return try await AppleMusicFavorites.addCurrent(request, check: check, started: writeStarted)
        }
        if request.operation == "artwork" { return try await AppleMusicLibrary.artwork(request, check: check) }
        if ["search", "list_playlists", "list_library", "playlist_tracks"].contains(request.operation) {
            return try await AppleMusicLibrary.read(request, check: check)
        }
        if ["create_playlist", "add_tracks"].contains(request.operation) {
            return try await AppleMusicLibrary.write(request, check: check, started: writeStarted)
        }
        return try await AppleMusicPlayback.execute(request, check: check, state: state)
    }
}

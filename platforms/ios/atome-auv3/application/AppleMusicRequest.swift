import Foundation

struct AppleMusicFailure: Error { let code: String }

// Native provider response contract, independent of MusicKit playback and credentials.
enum AppleMusicFavoriteResponse {
    static func resources(status: Int, data: Data) throws -> [[String: Any]] {
        guard status == 200, let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let values = body["data"] as? [[String: Any]] else { throw AppleMusicFailure(code: "PROVIDER_UNAVAILABLE") }
        return values
    }
    static func catalogID(status: Int, data: Data) throws -> String {
        let values = try resources(status: status, data: data)
        guard values.count == 1, values[0]["type"] as? String == "songs", let id = values[0]["id"] as? String,
              AppleMusicRequest.validID(id) else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }
        return id
    }
    static func confirmsFavorite(status: Int, data: Data) throws -> Bool {
        try resources(status: status, data: data).contains { value in
            guard value["type"] as? String == "library-songs", let attributes = value["attributes"] as? [String: Any],
                  let flag = attributes["inFavorites"] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { return false }
            return flag.boolValue
        }
    }
}

// The native capability boundary validates its own input, even if called outside the JS tool gateway.
struct AppleMusicRequest {
    let operation: String
    let input: [String: Any]
    static let fields: [String: Set<String>] = [
        "get_state": [], "authorize": [], "resume": [], "pause": [], "stop": [], "next": [], "previous": [],
        "search": ["query", "scope", "kind", "limit"], "list_playlists": ["limit", "offset"],
        "list_library": ["kind", "limit", "offset"],
        "favorite_current": ["song_id", "entry_id"],
        "playlist_tracks": ["id", "scope", "limit", "offset"], "play": ["id", "query", "scope", "kind"],
        "create_playlist": ["name", "description"], "add_tracks": ["playlist_id", "track_ids", "scope"]
    ]
    init(operation: String, input: [String: Any]) throws {
        guard let allowed = Self.fields[operation], Set(input.keys).isSubset(of: allowed) else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
        self.operation = operation; self.input = input
        for (key, value) in input {
            if ["limit", "offset"].contains(key) {
                guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
                      number.doubleValue == Double(number.intValue), number.intValue >= (key == "limit" ? 1 : 0),
                      number.intValue <= (key == "limit" ? 25 : 10000) else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
            } else if key == "track_ids" {
                guard let ids = value as? [String], !ids.isEmpty, ids.count <= 25, Set(ids).count == ids.count,
                      ids.allSatisfy(Self.validID) else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
            } else {
                guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || key == "description",
                      text.count <= (key == "description" ? 1000 : 200) else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
                if ["id", "playlist_id", "song_id"].contains(key) && !Self.validID(text) { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
                if key == "scope" && !["catalog", "library"].contains(text) { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
                if key == "kind" && !["song", "playlist", "artist"].contains(text) { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
            }
        }
        let required = ["search": ["query"], "playlist_tracks": ["id"], "create_playlist": ["name"], "add_tracks": ["playlist_id", "track_ids"]]
        guard (required[operation] ?? []).allSatisfy({ input[$0] != nil }) else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
        if operation == "favorite_current" && (input["song_id"] == nil || input["entry_id"] == nil) {
            throw AppleMusicFailure(code: "INVALID_ARGUMENT")
        }
        if operation == "list_library" && !["song", "playlist"].contains(input["kind"] as? String ?? "") {
            throw AppleMusicFailure(code: "INVALID_ARGUMENT")
        }
        if operation == "play" && ((input["id"] == nil) == (input["query"] == nil) || (input["id"] != nil && input["kind"] == nil)) {
            throw AppleMusicFailure(code: "INVALID_ARGUMENT")
        }
    }
    static func validID(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 200 && value.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil
    }
    var scope: String { input["scope"] as? String ?? "catalog" }
    var kind: String { input["kind"] as? String ?? "song" }
    var limit: Int { (input["limit"] as? NSNumber)?.intValue ?? 25 }
    var offset: Int { (input["offset"] as? NSNumber)?.intValue ?? 0 }
    func string(_ key: String) -> String { input[key] as? String ?? "" }
}

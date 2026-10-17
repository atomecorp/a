import Foundation

@main
struct AppleMusicNativeRequestProbe {
    static func main() throws {
        var checked = 0
        func reject(_ operation: String, _ input: [String: Any]) throws {
            do { _ = try AppleMusicRequest(operation: operation, input: input) }
            catch let failure as AppleMusicFailure {
                precondition(failure.code == "INVALID_ARGUMENT"); checked += 1; return
            }
            preconditionFailure("Untrusted native input was accepted")
        }
        try reject("delete_playlist", [:])
        try reject("list_library", [:])
        try reject("list_library", ["kind": "artist"])
        try reject("favorite_current", [:])
        try reject("favorite_current", ["song_id": "123", "entry_id": ""])
        try reject("favorite_current", ["song_id": "../123", "entry_id": "entry"])
        try reject("search", ["query": " "])
        try reject("search", ["query": "A", "limit": true])
        try reject("search", ["query": "A", "limit": 1.5])
        try reject("search", ["query": "A", "limit": 26])
        try reject("search", ["query": "A", "scope": "remote"])
        try reject("create_playlist", ["name": "A", "token": "untrusted"])
        try reject("add_tracks", ["playlist_id": "p.1", "track_ids": ["1", "1"]])
        try reject("add_tracks", ["playlist_id": "p.1", "track_ids": []])
        try reject("play", ["id": "1"])
        try reject("play", ["id": "1", "kind": "song", "query": "A"])
        try reject("play", ["id": "../wrong", "kind": "song"])
        _ = try AppleMusicRequest(operation: "play", input: ["query": "Pink Floyd", "kind": "artist"])
        _ = try AppleMusicRequest(operation: "list_library", input: ["kind": "song", "limit": 25, "offset": 25])
        _ = try AppleMusicRequest(operation: "favorite_current", input: ["song_id": "123", "entry_id": "entry"])
        _ = try AppleMusicRequest(operation: "play", input: ["id": "i.123", "kind": "playlist", "scope": "library"])
        _ = try AppleMusicRequest(operation: "create_playlist", input: ["name": "Morning", "description": ""])
        _ = try AppleMusicRequest(operation: "add_tracks", input: ["playlist_id": "p.1", "track_ids": ["1", "2"]])
        func body(_ values: [[String: Any]]) throws -> Data { try JSONSerialization.data(withJSONObject: ["data": values]) }
        let catalog = try AppleMusicFavoriteResponse.catalogID(status: 200, data: body([["id": "123", "type": "songs"]]))
        precondition(catalog == "123")
        for flag: Any in [false, "true", 1, NSNull()] {
            let confirmed = try AppleMusicFavoriteResponse.confirmsFavorite(status: 200,
                data: body([["type": "library-songs", "attributes": ["inFavorites": flag]]]))
            precondition(!confirmed)
        }
        let confirmed = try AppleMusicFavoriteResponse.confirmsFavorite(status: 200,
            data: body([["type": "library-songs", "attributes": ["inFavorites": true]]]))
        precondition(confirmed)
        let empty = try AppleMusicFavoriteResponse.confirmsFavorite(status: 200, data: body([]))
        precondition(!empty)
        print("Apple Music native request validation: \(checked) refusals, 6 valid requests and 7 favorite response assertions passed")
    }
}

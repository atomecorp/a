import Foundation
import MusicKit

// Provider-only adapter. MusicKit owns authorization; canonical Atomes own intent/receipt.
@MainActor
enum AppleMusicFavorites {
    static func request(_ path: String, query: [URLQueryItem] = [], method: String = "GET") throws -> URLRequest {
        var components = URLComponents(); components.scheme = "https"; components.host = "api.music.apple.com"
        components.path = "/v1/" + path; components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url else { throw AppleMusicFailure(code: "INVALID_ARGUMENT") }
        var request = URLRequest(url: url); request.httpMethod = method; return request
    }
    static func checkCurrent(_ request: AppleMusicRequest) throws {
        guard let entry = SystemMusicPlayer.shared.queue.currentEntry, case let .song(song) = entry.item else {
            throw AppleMusicFailure(code: "NO_ACTIVE_MUSIC")
        }
        guard entry.id == request.string("entry_id"), song.id.rawValue == request.string("song_id") else {
            throw AppleMusicFailure(code: "CURRENT_SONG_CHANGED")
        }
    }
    static func catalogID(_ id: String, check: () throws -> Void) async throws -> String {
        // Resolve the actual resource type through MusicKit rather than guessing from an ID prefix.
        var library = MusicLibraryRequest<Song>(); library.filter(matching: \.id, equalTo: MusicItemID(id)); library.limit = 1
        let local = try await library.response().items.first; try check()
        if let local {
            guard AppleMusicRequest.validID(local.id.rawValue) else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }
            let response = try await MusicDataRequest(urlRequest: request("me/library/songs/" + local.id.rawValue + "/catalog")).response()
            try check()
            return try AppleMusicFavoriteResponse.catalogID(status: response.urlResponse.statusCode, data: response.data)
        }
        let song = try await AppleMusicLibrary.song(id, scope: "catalog", check: check)
        return song.id.rawValue
    }
    static func addCurrent(_ input: AppleMusicRequest, check: () throws -> Void, started: () -> Void) async throws -> [String: Any] {
        try check(); try checkCurrent(input)
        let id = try await catalogID(input.string("song_id"), check: check)
        let country = try await MusicDataRequest.currentCountryCode; try check()
        guard country.range(of: "^[A-Za-z]{2}$", options: .regularExpression) != nil else { throw AppleMusicFailure(code: "PROVIDER_UNAVAILABLE") }
        let mutation = try request("me/favorites", query: [URLQueryItem(name: "ids[songs]", value: id)], method: "POST")
        try checkCurrent(input); try check(); started()
        let accepted = try await MusicDataRequest(urlRequest: mutation).response(); try check()
        guard accepted.urlResponse.statusCode == 202 else { throw AppleMusicFailure(code: "OPERATION_UNCONFIRMED") }
        // 202 can silently ignore unsupported resources. Only an authoritative read-back confirms the favorite.
        let read = try request("catalog/" + country + "/songs/" + id + "/library", query: [URLQueryItem(name: "extend", value: "inFavorites")])
        let response = try await MusicDataRequest(urlRequest: read).response(); try check()
        let confirmed = try AppleMusicFavoriteResponse.confirmsFavorite(status: response.urlResponse.statusCode, data: response.data)
        guard confirmed else { throw AppleMusicFailure(code: "OPERATION_UNCONFIRMED") }
        return ["ok": true, "song_id": input.string("song_id"), "favorited": true]
    }
}

import Foundation
import MediaPlayer
import MusicKit
import UIKit

@MainActor
enum AppleMusicLibrary {
    static func item(_ song: Song, scope: String) -> [String: Any] {
        var value: [String: Any] = ["id": song.id.rawValue, "name": song.title, "artist": song.artistName, "kind": "song", "scope": scope,
            "duration": song.duration ?? 0]
        value["artwork_url"] = song.artwork?.url(width: 256, height: 256)?.absoluteString
        return value
    }
    static func item(_ playlist: Playlist, scope: String) -> [String: Any] {
        var value: [String: Any] = ["id": playlist.id.rawValue, "name": playlist.name, "artist": playlist.curatorName ?? "", "kind": "playlist", "scope": scope]
        value["artwork_url"] = playlist.artwork?.url(width: 256, height: 256)?.absoluteString
        return value
    }
    static func item(_ artist: Artist, scope: String) -> [String: Any] {
        var value: [String: Any] = ["id": artist.id.rawValue, "name": artist.name, "kind": "artist", "scope": scope]
        value["artwork_url"] = artist.artwork?.url(width: 256, height: 256)?.absoluteString
        return value
    }
    static func search(_ request: AppleMusicRequest, check: () throws -> Void) async throws -> [[String: Any]] {
        var items: [[String: Any]] = []
        if request.scope == "library" {
            var search = MusicLibrarySearchRequest(term: request.string("query"), types: [Song.self, Playlist.self, Artist.self])
            search.limit = request.limit
            let result = try await search.response(); try check()
            items = result.songs.map { item($0, scope: "library") } + result.playlists.map { item($0, scope: "library") }
                + result.artists.map { item($0, scope: "library") }
        } else {
            var search = MusicCatalogSearchRequest(term: request.string("query"), types: [Song.self, Playlist.self, Artist.self])
            search.limit = request.limit
            let result = try await search.response(); try check()
            items = result.songs.map { item($0, scope: "catalog") } + result.playlists.map { item($0, scope: "catalog") }
                + result.artists.map { item($0, scope: "catalog") }
        }
        return Array(items.filter { request.input["kind"] == nil || $0["kind"] as? String == request.kind }.prefix(request.limit))
    }
    static func song(_ id: String, scope: String, check: () throws -> Void) async throws -> Song {
        let result: Song?
        if scope == "library" {
            var lookup = MusicLibraryRequest<Song>(); lookup.filter(matching: \.id, equalTo: MusicItemID(id)); lookup.limit = 1
            result = try await lookup.response().items.first
        } else {
            result = try await MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id)).response().items.first
        }
        try check(); guard let result else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }; return result
    }
    static func playlist(_ id: String, scope: String, check: () throws -> Void) async throws -> Playlist {
        let result: Playlist?
        if scope == "library" {
            var lookup = MusicLibraryRequest<Playlist>(); lookup.filter(matching: \.id, equalTo: MusicItemID(id)); lookup.limit = 1
            result = try await lookup.response().items.first
        } else {
            result = try await MusicCatalogResourceRequest<Playlist>(matching: \.id, equalTo: MusicItemID(id)).response().items.first
        }
        try check(); guard let result else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }; return result
    }
    static func artist(_ id: String, scope: String, check: () throws -> Void) async throws -> Artist {
        let result: Artist?
        if scope == "library" {
            var lookup = MusicLibraryRequest<Artist>(); lookup.filter(matching: \.id, equalTo: MusicItemID(id)); lookup.limit = 1
            result = try await lookup.response().items.first
        } else {
            result = try await MusicCatalogResourceRequest<Artist>(matching: \.id, equalTo: MusicItemID(id)).response().items.first
        }
        try check(); guard let result else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }; return result
    }
    static func read(_ request: AppleMusicRequest, check: () throws -> Void) async throws -> [String: Any] {
        if request.operation == "search" { return ["ok": true, "items": try await search(request, check: check)] }
        if request.operation == "list_library" && request.kind == "song" {
            var lookup = MusicLibraryRequest<Song>(); lookup.limit = request.limit + 1; lookup.offset = request.offset
            let result = try await lookup.response(); try check()
            return ["ok": true, "items": result.items.prefix(request.limit).map { item($0, scope: "library") },
                "has_more": result.items.count > request.limit || result.items.hasNextBatch]
        }
        if ["list_playlists", "list_library"].contains(request.operation) {
            var lookup = MusicLibraryRequest<Playlist>(); lookup.limit = request.limit + 1; lookup.offset = request.offset
            let result = try await lookup.response(); try check()
            return ["ok": true, "items": result.items.prefix(request.limit).map { item($0, scope: "library") },
                "has_more": result.items.count > request.limit || result.items.hasNextBatch]
        }
        let playlist = try await playlist(request.string("id"), scope: request.scope, check: check)
        let loaded = try await playlist.with([.tracks]); try check()
        guard var batch = loaded.tracks else { throw AppleMusicFailure(code: "PROVIDER_UNAVAILABLE") }
        var songs: [Song] = [], skipped = 0
        while true {
            for track in batch {
                guard case let .song(song) = track else { continue }
                if skipped < request.offset { skipped += 1; continue }
                songs.append(song)
                if songs.count > request.limit { break }
            }
            if songs.count > request.limit || !batch.hasNextBatch { break }
            guard let next = try await batch.nextBatch(limit: request.limit) else { break }
            try check(); batch = next
        }
        return ["ok": true, "items": songs.prefix(request.limit).map { item($0, scope: request.scope) }, "has_more": songs.count > request.limit]
    }
    // Covers as JPEG data URLs (the contacts' photos way): the WebView cannot load MusicKit's
    // `musicKit://` library URLs. No `ids`: the cover of the song the device plays now.
    static func artwork(_ request: AppleMusicRequest, check: () throws -> Void) async throws -> [String: Any] {
        let side = request.size
        if request.ids.isEmpty {
            guard let entry = SystemMusicPlayer.shared.queue.currentEntry else { return ["ok": true, "items": []] }
            var id = entry.id
            if case let .song(song) = entry.item { id = song.id.rawValue }
            var image = MPMusicPlayerController.systemMusicPlayer.nowPlayingItem?.artwork?.image(at: CGSize(width: side, height: side))
            if image == nil, let url = entry.artwork?.url(width: side, height: side) { image = await download(url) }
            try check()
            guard let image, let data = dataURL(image, side: side) else { return ["ok": true, "items": []] }
            return ["ok": true, "items": [["id": id, "artwork": data]]]
        }
        var items: [[String: Any]] = []
        for id in request.ids {
            guard let song = try? await song(id, scope: request.scope, check: check) else { continue }
            var image = request.scope == "library" ? libraryImage(song, side: side) : nil
            if image == nil, let url = song.artwork?.url(width: side, height: side) { image = await download(url) }
            try check()
            if let image, let data = dataURL(image, side: side) { items.append(["id": id, "artwork": data]) }
        }
        return ["ok": true, "items": items]
    }
    // A library song's own cover through the media library: by its persistent ID when MusicKit gives it, else by title and artist.
    private static func libraryImage(_ song: Song, side: Int) -> UIImage? {
        let query = MPMediaQuery.songs()
        if let persistent = UInt64(song.id.rawValue) {
            query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: persistent), forProperty: MPMediaItemPropertyPersistentID))
        } else {
            query.addFilterPredicate(MPMediaPropertyPredicate(value: song.title, forProperty: MPMediaItemPropertyTitle))
            query.addFilterPredicate(MPMediaPropertyPredicate(value: song.artistName, forProperty: MPMediaItemPropertyArtist))
        }
        return query.items?.first?.artwork?.image(at: CGSize(width: side, height: side))
    }
    // A catalogue cover (an https URL); a `musicKit://` one is not downloadable.
    private static func download(_ url: URL) async -> UIImage? {
        guard url.scheme == "https", let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return UIImage(data: data)
    }
    private static func dataURL(_ image: UIImage, side: Int) -> String? {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let size = CGSize(width: side, height: side)
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = drawn.jpegData(compressionQuality: 0.82) else { return nil }
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }
    static func write(_ request: AppleMusicRequest, check: () throws -> Void, started: () -> Void) async throws -> [String: Any] {
        if request.operation == "create_playlist" {
            try check(); started()
            let playlist = try await MusicLibrary.shared.createPlaylist(name: request.string("name"), description: request.input["description"] as? String)
            try check(); return ["ok": true, "playlist_id": playlist.id.rawValue]
        }
        var playlist = try await playlist(request.string("playlist_id"), scope: "library", check: check)
        // Resolve every song before the first external mutation. A missing ID cannot partially append a batch.
        var songs: [Song] = []
        for id in request.input["track_ids"] as? [String] ?? [] { songs.append(try await song(id, scope: request.scope, check: check)) }
        for song in songs {
            try check(); started(); playlist = try await MusicLibrary.shared.add(song, to: playlist); try check()
        }
        return ["ok": true, "playlist_id": playlist.id.rawValue]
    }
}

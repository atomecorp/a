import Foundation
import MusicKit

@MainActor
enum AppleMusicPlayback {
    static func fold(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }
    static func execute(_ request: AppleMusicRequest, check: () throws -> Void, state: () -> [String: Any]) async throws -> [String: Any] {
        let player = SystemMusicPlayer.shared
        if request.operation == "play" {
            let id: String
            if request.input["id"] != nil { id = request.string("id") }
            else {
                var input = request.input; input["kind"] = request.kind; input["limit"] = 10
                let found = try await AppleMusicLibrary.search(AppleMusicRequest(operation: "search", input: input), check: check)
                let query = fold(request.string("query"))
                let exact = found.filter { value in
                    let name = value["name"] as? String ?? "", artist = value["artist"] as? String ?? ""
                    return fold(name) == query || fold(name + " " + artist) == query || fold(artist + " " + name) == query
                }
                let candidates = exact.isEmpty ? found : exact
                guard !candidates.isEmpty else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }
                guard candidates.count == 1 else { return ["ok": false, "error": "AMBIGUOUS_SELECTION", "candidates": candidates] }
                guard let selected = candidates.first?["id"] as? String else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }; id = selected
            }
            if request.scope == "catalog" || request.kind == "artist" {
                let subscription = try await MusicSubscription.current; try check()
                guard subscription.canPlayCatalogContent else { throw AppleMusicFailure(code: "SUBSCRIPTION_REQUIRED") }
            }
            if request.kind == "playlist" {
                let playlist = try await AppleMusicLibrary.playlist(id, scope: request.scope, check: check)
                try check(); player.queue = .init(for: [playlist])
            } else if request.kind == "artist" {
                let artist = try await AppleMusicLibrary.artist(id, scope: request.scope, check: check)
                let loaded = try await artist.with([.topSongs]); try check()
                guard let songs = loaded.topSongs, !songs.isEmpty else { throw AppleMusicFailure(code: "ITEM_NOT_FOUND") }
                player.queue = .init(for: songs)
            } else {
                let song = try await AppleMusicLibrary.song(id, scope: request.scope, check: check)
                try check(); player.queue = [song]
            }
            try await player.play(); try check(); return state()
        }
        guard player.queue.currentEntry != nil || player.state.playbackStatus != .stopped else { throw AppleMusicFailure(code: "NO_ACTIVE_MUSIC") }
        try check()
        switch request.operation {
        case "pause": player.pause()
        case "stop": player.stop()
        case "resume": try await player.play()
        case "next": try await player.skipToNextEntry()
        case "previous": try await player.skipToPreviousEntry()
        case "seek": player.playbackTime = request.seconds
        default: throw AppleMusicFailure(code: "INVALID_ARGUMENT")
        }
        try check(); return state()
    }
}

import Foundation

extension FastifySyncClient {
    // Public, unauthenticated /ws/api operations owned by Fastify (YouTube search,
    // PeerTube search and stream resolution,
    // television catalogue, YouTube live resolution, the shows around a position, the films and series
    // of Divertissement › Vidéo, GPS resources, Open Food
    // Facts, the free book catalogs, the Médiathèque's free media, the bug reports kept on
    // atome.one, the shop's sales everyone browses). The phone has no copy of them: the frame is forwarded, without
    // any credential, to the configured Fastify server and its single reply is
    // returned.
    static let publicTypes: Set<String> = ["youtube-search", "peertube-search", "peertube-resolve", "tv-catalog",
        "tv-resolve", "shows-nearby", "video-catalog", "gps-resource", "food-facts",
        "book-source", "book-fetch", "media-library-search", "media-library-fetch", "bug-report-submit", "bug-report-status", "shop-public", "coaches-public", "tone3000"]

    func relayPublic(_ payload: [String: Any], reply: @escaping ([String: Any]) -> Void) {
        let requestId = payload["requestId"] ?? NSNull()
        let requestType = payload["type"] as? String ?? ""
        let responseType = requestType + "-response"
        let unavailableByType = ["youtube-search": "youtube_search_unavailable",
            "peertube-search": "peertube_search_unavailable", "peertube-resolve": "peertube_resolve_unavailable"]
        let unavailable = unavailableByType[requestType] ?? "PROVIDER_UNAVAILABLE"
        let failure: (String) -> Void = { error in
            reply(["type":responseType, "requestId":requestId,
                "ok":false, "success":false, "error":error])
        }
        let defaults = UserDefaults(suiteName: SharedBus.appGroupSuite) ?? .standard
        let configured = firstValue(defaults, keys: ["SQUIRREL_FASTIFY_URL", "SQUIRREL_TAURI_FASTIFY_URL"])
        let base = configured.isEmpty ? "https://atome.one" : configured
        guard var components = URLComponents(string: base),
              let host = components.host,
              components.scheme == "https" || (components.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)) else {
            failure("service_invalid"); return
        }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws/api"
        components.query = nil
        components.fragment = nil
        guard let url = components.url else { failure("service_invalid"); return }
        let config = URLSessionConfiguration.ephemeral
        // The catalogue may be built on the first request.
        config.timeoutIntervalForRequest = 60
        let session = URLSession(configuration: config)
        let task = session.webSocketTask(with: url)
        // A country's catalogue can exceed the 1 MB default.
        task.maximumMessageSize = 8 * 1024 * 1024
        task.resume()
        var outgoing = payload
        outgoing.removeValue(forKey: "token")
        guard let bytes = try? JSONSerialization.data(withJSONObject: outgoing) else {
            task.cancel(with: .goingAway, reason: nil); session.invalidateAndCancel()
            failure("INVALID_ARGUMENT"); return
        }
        task.send(.data(bytes)) { sendError in
            guard sendError == nil else {
                task.cancel(with: .goingAway, reason: nil); session.invalidateAndCancel()
                failure(unavailable); return
            }
            task.receive { result in
                defer { task.cancel(with: .goingAway, reason: nil); session.invalidateAndCancel() }
                guard case .success(let message) = result else { failure(unavailable); return }
                let received: Data?
                switch message {
                case .data(let data): received = data
                case .string(let text): received = text.data(using: .utf8)
                @unknown default: received = nil
                }
                guard let received,
                      let response = (try? JSONSerialization.jsonObject(with: received)) as? [String: Any],
                      response["type"] as? String == responseType,
                      String(describing: response["requestId"] ?? "") == String(describing: requestId) else {
                    failure(unavailable); return
                }
                reply(response)
            }
        }
    }

}

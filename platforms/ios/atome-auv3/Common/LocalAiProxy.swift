import Foundation

/// Local AI provider proxy for the iOS local HTTP server.
///
/// The web layer routes every provider completion through the local server when
/// `isTauri()` is true (see `atome/src/squirrel/ai/provider_client_transport.js`),
/// and `isTauri()` is true for the `atome:` scheme used by the iOS WebView.
/// Desktop answers that call in `platforms/desktop-tauri/src/server/mod.rs`
/// (`eve_ai_provider_completion_handler`); this is the Swift counterpart, kept
/// behaviourally identical so both runtimes speak the same contract.
enum LocalAiProxy {
    static let routePath = "/api/eve/ai/provider-completion"

    struct ProxyResponse {
        let status: Int
        let reason: String
        let contentType: String
        let body: Data
    }

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    static func handle(body: Data, completion: @escaping (ProxyResponse) -> Void) {
        guard let payload = (try? JSONSerialization.jsonObject(with: body, options: [])) as? [String: Any] else {
            completion(errorResponse(status: 400, message: "Invalid AI proxy request body"))
            return
        }

        let providerId = text(payload["provider_id"])
        let providerType = text(payload["provider_type"])
        let endpoint = text(payload["completion_endpoint"])
        let model = text(payload["model"])
        let prompt = text(payload["prompt"])
        let systemPrompt = text(payload["system_prompt"])
        let apiKey = text(payload["api_key"])
        let timeoutMs = clampedTimeoutMs(payload["timeout_ms"])

        if providerType.isEmpty || endpoint.isEmpty || apiKey.isEmpty {
            completion(errorResponse(status: 400, message: "Missing AI provider fields"))
            return
        }

        guard isAllowedEndpoint(endpoint) else {
            completion(errorResponse(status: 400, message: "AI provider endpoint is not allowed"))
            return
        }

        guard let request = buildUpstreamRequest(
            providerType: providerType,
            endpoint: endpoint,
            model: model,
            prompt: prompt,
            systemPrompt: systemPrompt,
            apiKey: apiKey,
            timeoutMs: timeoutMs
        ) else {
            completion(errorResponse(status: 400, message: "Unsupported AI provider type"))
            return
        }

        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(errorResponse(status: 502, message: "AI proxy request failed: \(error.localizedDescription)"))
                return
            }
            guard let http = response as? HTTPURLResponse else {
                completion(errorResponse(status: 502, message: "AI proxy request failed: no response"))
                return
            }

            let payloadData = data ?? Data()

            // Forward upstream failures verbatim: the web layer parses the provider
            // error body to surface the real provider message and code.
            guard (200...299).contains(http.statusCode) else {
                let upstreamType = http.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
                completion(ProxyResponse(
                    status: http.statusCode,
                    reason: reasonPhrase(for: http.statusCode),
                    contentType: upstreamType,
                    body: payloadData
                ))
                return
            }

            guard let upstreamJson = try? JSONSerialization.jsonObject(with: payloadData, options: []) else {
                completion(errorResponse(status: 502, message: "AI proxy invalid upstream JSON"))
                return
            }

            let responseText = self.responseText(from: upstreamJson, providerType: providerType)
            let usage = self.responseUsage(from: upstreamJson, providerType: providerType)

            let result: [String: Any] = [
                "ok": true,
                "provider_id": providerId,
                "provider_type": providerType,
                "text": responseText,
                "usage": usage,
                "raw": upstreamJson
            ]

            guard JSONSerialization.isValidJSONObject(result),
                  let encoded = try? JSONSerialization.data(withJSONObject: result, options: []) else {
                completion(self.errorResponse(status: 500, message: "AI proxy response encode failed"))
                return
            }

            completion(ProxyResponse(
                status: 200,
                reason: "OK",
                contentType: "application/json; charset=utf-8",
                body: encoded
            ))
        }.resume()
    }

    // MARK: - Request building

    private static func buildUpstreamRequest(
        providerType: String,
        endpoint: String,
        model: String,
        prompt: String,
        systemPrompt: String,
        apiKey: String,
        timeoutMs: Int
    ) -> URLRequest? {
        let timeout = TimeInterval(timeoutMs) / 1000.0

        switch providerType {
        case "openai":
            guard let url = URL(string: endpoint) else { return nil }
            var request = URLRequest(url: url, timeoutInterval: timeout)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            request.httpBody = encodeBody([
                "model": model,
                "temperature": 0.2,
                "messages": [
                    ["role": "system", "content": systemPrompt],
                    ["role": "user", "content": prompt]
                ]
            ])
            return request

        case "anthropic":
            guard let url = URL(string: endpoint) else { return nil }
            var request = URLRequest(url: url, timeoutInterval: timeout)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
            request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            request.httpBody = encodeBody([
                "model": model,
                "max_tokens": 2048,
                "system": systemPrompt,
                "messages": [
                    ["role": "user", "content": prompt]
                ]
            ])
            return request

        case "google":
            let base = trimTrailingSlashes(endpoint)
            let encodedModel = percentEncoded(model)
            let encodedKey = percentEncoded(apiKey)
            guard let url = URL(string: "\(base)/\(encodedModel):generateContent?key=\(encodedKey)") else { return nil }
            var request = URLRequest(url: url, timeoutInterval: timeout)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = encodeBody([
                "systemInstruction": [
                    "parts": [["text": systemPrompt]]
                ],
                "contents": [
                    [
                        "role": "user",
                        "parts": [["text": prompt]]
                    ]
                ]
            ])
            return request

        default:
            return nil
        }
    }

    // MARK: - Response parsing

    private static func responseText(from value: Any, providerType: String) -> String {
        guard let object = value as? [String: Any] else { return "" }

        switch providerType {
        case "anthropic":
            guard let parts = object["content"] as? [Any] else { return "" }
            return joinedTexts(in: parts)

        case "google":
            guard let candidates = object["candidates"] as? [Any],
                  let first = candidates.first as? [String: Any],
                  let content = first["content"] as? [String: Any],
                  let parts = content["parts"] as? [Any] else { return "" }
            return joinedTexts(in: parts)

        default:
            guard let choices = object["choices"] as? [Any],
                  let first = choices.first as? [String: Any],
                  let message = first["message"] as? [String: Any],
                  let content = message["content"] as? String else { return "" }
            return content
        }
    }

    private static func responseUsage(from value: Any, providerType: String) -> [String: Any] {
        let object = value as? [String: Any] ?? [:]

        switch providerType {
        case "anthropic":
            let usage = object["usage"] as? [String: Any] ?? [:]
            return [
                "prompt_tokens": unsignedInt(usage["input_tokens"]),
                "completion_tokens": unsignedInt(usage["output_tokens"])
            ]

        case "google":
            let usage = object["usageMetadata"] as? [String: Any] ?? [:]
            return [
                "prompt_tokens": unsignedInt(usage["promptTokenCount"]),
                "completion_tokens": unsignedInt(usage["candidatesTokenCount"]),
                "total_tokens": unsignedInt(usage["totalTokenCount"])
            ]

        default:
            return object["usage"] as? [String: Any] ?? [:]
        }
    }

    private static func joinedTexts(in parts: [Any]) -> String {
        parts
            .compactMap { ($0 as? [String: Any])?["text"] as? String }
            .joined(separator: "\n")
    }

    // MARK: - Validation helpers

    /// Mirrors `is_allowed_ai_proxy_endpoint`: https anywhere, http only on loopback.
    private static func isAllowedEndpoint(_ endpoint: String) -> Bool {
        let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return false }
        switch url.scheme?.lowercased() {
        case "https":
            return true
        case "http":
            let host = url.host?.lowercased()
            return host == "127.0.0.1" || host == "localhost"
        default:
            return false
        }
    }

    private static func clampedTimeoutMs(_ value: Any?) -> Int {
        let requested: Int
        if let number = value as? NSNumber {
            requested = number.intValue
        } else if let string = value as? String, let parsed = Int(string) {
            requested = parsed
        } else {
            requested = 20_000
        }
        return min(max(requested, 1_000), 120_000)
    }

    // MARK: - Small utilities

    private static func text(_ value: Any?) -> String {
        guard let string = value as? String else { return "" }
        return string
    }

    private static func unsignedInt(_ value: Any?) -> Int {
        guard let number = value as? NSNumber else { return 0 }
        let intValue = number.intValue
        return intValue > 0 ? intValue : 0
    }

    private static func encodeBody(_ payload: [String: Any]) -> Data? {
        guard JSONSerialization.isValidJSONObject(payload) else { return nil }
        return try? JSONSerialization.data(withJSONObject: payload, options: [])
    }

    private static func trimTrailingSlashes(_ value: String) -> String {
        var result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while result.hasSuffix("/") { result.removeLast() }
        return result
    }

    /// RFC 3986 unreserved set, matching the `urlencoding` crate used by the
    /// desktop handler so both runtimes produce byte-identical Google URLs.
    private static let unreservedCharacters: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-._~")
        return set
    }()

    private static func percentEncoded(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreservedCharacters) ?? value
    }

    private static func errorResponse(status: Int, message: String) -> ProxyResponse {
        let payload: [String: Any] = ["success": false, "error": message]
        let body = (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data()
        return ProxyResponse(
            status: status,
            reason: reasonPhrase(for: status),
            contentType: "application/json; charset=utf-8",
            body: body
        )
    }

    private static func reasonPhrase(for status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 429: return "Too Many Requests"
        case 500: return "Internal Server Error"
        case 502: return "Bad Gateway"
        case 504: return "Gateway Timeout"
        default: return status < 400 ? "OK" : "Error"
        }
    }
}

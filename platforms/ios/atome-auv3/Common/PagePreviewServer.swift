//
//  PagePreviewServer.swift
//  The isolated preview origin on iOS (D18 item 11): the counterpart of
//  atome/servers/atome-server/src/page_preview.rs. A loopback listener of its own
//  (another port than the local server, so another origin than the app's `atome:` one)
//  serves one fixed document, the preview bootstrap
//  (eVe/domains/page_preview/page_preview_frame.html, packaged in atome_runtime).
//  A person's page never reaches it: the app sends the page's source over the
//  MessageChannel it hands the bootstrap. Its whole job is the response headers: a CSP
//  that sandboxes the document (`sandbox allow-scripts`: an opaque origin with no
//  storage, no cookie, no parent) and limits every network directive to the page's
//  allow-list, given in the query (`/page?allow=api.example.org`), each host checked
//  by the same rule as atome/src/shared/html_page_contract.js#normalizePageHost.
//  The app asks where it is at `/page_preview/origin` (AudioSchemeHandler); the
//  listener opens on that first request.
//

import Foundation
import Network

final class PagePreviewServer {
    static let shared = PagePreviewServer()

    private static let maxHosts = 32
    private static let maxHostLength = 253
    private static let maxRequestBytes = 16 * 1024
    private static let permissions = "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), "
        + "usb=(), serial=(), hid=(), bluetooth=(), payment=(), display-capture=(), fullscreen=(), midi=()"

    private let queue = DispatchQueue(label: "page.preview.server.queue")
    private var listener: NWListener?
    private var port: UInt16?
    private var waiting: [(Result<String, Error>) -> Void] = []

    enum Failure: Error { case bootstrapMissing, listener(String) }

    // The origin, once the listener is ready (`http://127.0.0.1:<port>`).
    func origin(_ completion: @escaping (Result<String, Error>) -> Void) {
        queue.async {
            if let port = self.port { completion(.success(Self.originString(port))); return }
            self.waiting.append(completion)
            if self.listener == nil { self.open() }
        }
    }

    private static func originString(_ port: UInt16) -> String { "http://127.0.0.1:\(port)" }

    private func settle(_ result: Result<String, Error>) {
        let pending = waiting
        waiting = []
        pending.forEach { $0(result) }
    }

    // Runs on `queue`: loopback only, any free port.
    private func open() {
        do {
            let params = NWParameters.tcp
            params.requiredInterfaceType = .loopback
            params.allowLocalEndpointReuse = true
            let created = try NWListener(using: params)
            created.newConnectionHandler = { [weak self] connection in self?.handle(connection) }
            created.stateUpdateHandler = { [weak self, weak created] state in
                guard let self = self, let created = created, created === self.listener else { return }
                switch state {
                case .ready:
                    guard let port = created.port?.rawValue else { return }
                    self.port = port
                    self.settle(.success(Self.originString(port)))
                case .failed(let error):
                    self.listener = nil
                    self.port = nil
                    created.cancel()
                    self.settle(.failure(Failure.listener(error.localizedDescription)))
                default: break
                }
            }
            listener = created
            created.start(queue: queue)
        } catch {
            settle(.failure(Failure.listener(error.localizedDescription)))
        }
    }

    // The bootstrap, read from the packaged runtime once.
    private lazy var bootstrap: Data? = {
        guard let root = Bundle.main.resourceURL else { return nil }
        let file = root.appendingPathComponent("atome_runtime/eVe/domains/page_preview/page_preview_frame.html")
        return try? Data(contentsOf: file)
    }()

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, isComplete, error in
            guard let self = self else { connection.cancel(); return }
            var next = buffer
            if let data = data { next.append(data) }
            if let end = next.range(of: Data("\r\n\r\n".utf8)) {
                self.answer(String(decoding: next.subdata(in: 0..<end.lowerBound), as: UTF8.self), on: connection)
                return
            }
            if error != nil || isComplete || next.count > Self.maxRequestBytes { connection.cancel(); return }
            self.receive(connection, buffer: next)
        }
    }

    private func answer(_ head: String, on connection: NWConnection) {
        let parts = (head.components(separatedBy: "\r\n").first ?? "").split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else { return send(405, "Method Not Allowed", on: connection) }
        let target = String(parts[1])
        let path = target.split(separator: "?", maxSplits: 1).first.map(String.init) ?? target
        let query = target.contains("?") ? String(target.split(separator: "?", maxSplits: 1)[1]) : ""
        guard path == "/page" else { return send(404, "Not Found", on: connection) }
        guard let hosts = Self.allowedHosts(query) else { return send(400, "page_preview_host_invalid", on: connection) }
        guard let body = bootstrap else { return send(500, "page_preview_bootstrap_missing", on: connection) }
        let headers = [
            "Content-Type: text/html; charset=utf-8",
            "Content-Security-Policy: \(Self.contentSecurityPolicy(hosts))",
            "X-Content-Type-Options: nosniff",
            "Referrer-Policy: no-referrer",
            "Cache-Control: no-store",
            "Cross-Origin-Resource-Policy: same-origin",
            "Permissions-Policy: \(Self.permissions)"
        ]
        write(status: "200 OK", headers: headers, body: parts[0] == "HEAD" ? Data() : body, length: body.count, on: connection)
    }

    private func send(_ status: Int, _ reason: String, on connection: NWConnection) {
        let body = Data(reason.utf8)
        write(status: "\(status) \(reason)", headers: ["Content-Type: text/plain; charset=utf-8", "Cache-Control: no-store"],
              body: body, length: body.count, on: connection)
    }

    private func write(status: String, headers: [String], body: Data, length: Int, on connection: NWConnection) {
        var response = Data(("HTTP/1.1 \(status)\r\n" + (headers + ["Content-Length: \(length)", "Connection: close"])
            .joined(separator: "\r\n") + "\r\n\r\n").utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    // A host a page may reach: a lowercase DNS name of two labels at least.
    static func pageHost(_ value: String) -> String? {
        let host = value.trimmingCharacters(in: .whitespaces).lowercased()
        guard !host.isEmpty, host.count <= maxHostLength else { return nil }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789-")
        let valid = labels.count >= 2 && labels.allSatisfy { label in
            !label.isEmpty && label.count <= 63 && label.first != "-" && label.last != "-" && label.allSatisfy { allowed.contains($0) }
        }
        return valid ? host : nil
    }

    // The query's `allow=` hosts; nil when one is invalid or there are too many.
    static func allowedHosts(_ query: String) -> [String]? {
        guard let raw = query.split(separator: "&").first(where: { $0.hasPrefix("allow=") }) else { return [] }
        let list = String(raw.dropFirst("allow=".count)).replacingOccurrences(of: "%2C", with: ",").replacingOccurrences(of: "%2c", with: ",")
        var hosts: [String] = []
        for entry in list.split(separator: ",") {
            guard let host = pageHost(String(entry)) else { return nil }
            if !hosts.contains(host) { hosts.append(host) }
        }
        return hosts.count <= maxHosts ? hosts : nil
    }

    static func contentSecurityPolicy(_ hosts: [String]) -> String {
        let sources = hosts.map { " https://\($0)" }.joined()
        let connect = hosts.isEmpty ? " 'none'" : sources
        return "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'\(sources); "
            + "style-src 'unsafe-inline'\(sources); img-src data: blob:\(sources); "
            + "media-src data: blob:\(sources); font-src data:\(sources); connect-src\(connect); "
            + "frame-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'"
    }
}

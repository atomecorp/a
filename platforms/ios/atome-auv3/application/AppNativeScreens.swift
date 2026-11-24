import AVFoundation
import Foundation
import Network

/// The named screens of the local network (R-248): an iOS app may not open multicast sockets of its own, so the
/// system's Bonjour browser lists the Chromecasts (`_googlecast._tcp`) and AirPlay receivers (`_airplay._tcp`)
/// heard within two seconds, each resolved to its IPv4 address and port, with its TXT entries. The page hands
/// these records to the local server (`/ws/api` `screens`, local_screens.rs), which reads them and talks to the
/// device. `screens_route` names the AirPlay receiver the sound goes to (a mirroring started in Control Center),
/// so that screen is remembered by its own name. Without the person's leave to see the local network (Réglages › Atome ›
/// Réseau local, asked by the system at the first browse), the system browser hears nothing: that is said
/// (`screens_local_network_denied`), never answered as an empty network.
///
/// The Atome apps nearby (R-248 « à proximité »): each announces `_atome._tcp` under its seat's nearby token
/// (`screens_announce`, a listener on any port that takes no connection), and the browse hands over the tokens heard
/// (`_atome._tcp` records, by name alone), this app's own left out.
final class AppNativeScreens {
    static let shared = AppNativeScreens()
    private static let atomeService = "_atome._tcp"
    private static let services = ["_googlecast._tcp", "_airplay._tcp", atomeService]
    private static let listening: TimeInterval = 2.0
    private let queue = DispatchQueue(label: "atome.screens")
    // kDNSServiceErr_PolicyDenied: the local network is not allowed to this app (or its leave is being asked).
    private static let policyDenied: Int32 = -65570

    // The one announce of this app, and the token it carries (read and written on `queue`).
    private var announcer: NWListener?
    private var announcedToken = ""

    static func canHandle(command: String) -> Bool {
        command == "screens_browse" || command == "screens_route" || command == "screens_announce"
    }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        if command == "screens_announce" {
            guard let token = payload["token"] as? String else {
                completion(["ok": false, "error": "screens_announce_token_required"], nil)
                return
            }
            queue.async { self.announce(token, completion) }
            return
        }
        if command == "screens_route" {
            let output = AVAudioSession.sharedInstance().currentRoute.outputs.first { $0.portType == .airPlay }
            completion(["ok": true, "airplay_output": output?.portName ?? NSNull()], nil)
            return
        }
        browse { records, error in
            completion(error.map { ["ok": false, "error": $0] } ?? ["ok": true, "records": records], nil)
        }
    }

    /// This app announced under `token`, replacing the announce before; an empty token takes it away.
    private func announce(_ token: String, _ completion: @escaping ([String: Any], String?) -> Void) {
        announcer?.cancel()
        announcer = nil
        announcedToken = ""
        guard !token.isEmpty else {
            completion(["ok": true], nil)
            return
        }
        let listener: NWListener
        do {
            listener = try NWListener(using: .tcp)
        } catch {
            completion(["ok": false, "error": "screens_announce_failed:\(error)"], nil)
            return
        }
        let txt = NWTXTRecord(["v": "1"])
        listener.service = NWListener.Service(name: token, type: Self.atomeService, domain: nil, txtRecord: txt.data)
        // The record carries only its name: nobody connects to it.
        listener.newConnectionHandler = { $0.cancel() }
        var answered = false
        listener.stateUpdateHandler = { [weak self, weak listener] state in
            let reply: [String: Any]
            switch state {
            case .ready: reply = ["ok": true]
            case let .failed(error):
                listener?.cancel()
                if self?.announcer === listener {
                    self?.announcer = nil
                    self?.announcedToken = ""
                }
                reply = ["ok": false, "error": "screens_announce_failed:\(error)"]
            default: return
            }
            guard !answered else { return }
            answered = true
            completion(reply, nil)
        }
        announcer = listener
        announcedToken = token
        listener.start(queue: queue)
    }

    private func browse(_ done: @escaping ([[String: Any]], String?) -> Void) {
        var records: [[String: Any]] = []
        var refused: String?
        var pending = 0
        var browsing = true
        var browsers: [NWBrowser] = []
        var seen = Set<String>()
        var finished = false
        let finish = { [queue] in
            queue.async {
                guard !finished, !browsing, pending == 0 else { return }
                finished = true
                browsers.forEach { $0.cancel() }
                done(records, records.isEmpty ? refused : nil)
            }
        }
        for service in Self.services {
            let browser = NWBrowser(for: .bonjourWithTXTRecord(type: service, domain: nil), using: .tcp)
            browser.stateUpdateHandler = { state in
                let error: NWError
                switch state {
                case let .waiting(waiting): error = waiting
                case let .failed(failed): error = failed
                default: return
                }
                if case let .dns(code) = error, code == Self.policyDenied {
                    refused = "screens_local_network_denied"
                    browsing = false
                } else {
                    refused = refused ?? "screens_browse_failed:\(error)"
                }
                finish()
            }
            browser.browseResultsChangedHandler = { [queue, self] results, _ in
                for result in results where !finished {
                    guard case let .service(name, _, _, _) = result.endpoint, !seen.contains("\(service)/\(name)") else { continue }
                    seen.insert("\(service)/\(name)")
                    var txt: [String: String] = [:]
                    if case let .bonjour(record) = result.metadata { txt = record.dictionary }
                    // An Atome app is told by its name alone (it takes no connection); this app's own is no other app.
                    if service == Self.atomeService {
                        if name != self.announcedToken {
                            records.append(["service": service, "name": name, "host": "", "port": 0, "txt": txt])
                        }
                        continue
                    }
                    pending += 1
                    Self.resolve(result.endpoint, on: queue) { host, port in
                        if let host, let port { records.append(["service": service, "name": name, "host": host, "port": Int(port), "txt": txt]) }
                        pending -= 1
                        finish()
                    }
                }
            }
            browser.start(queue: queue)
            browsers.append(browser)
        }
        queue.asyncAfter(deadline: .now() + Self.listening) {
            browsing = false
            finish()
        }
    }

    /// The IPv4 address and port a Bonjour service answers on, read from a TCP connection to it.
    private static func resolve(_ endpoint: NWEndpoint, on queue: DispatchQueue, _ resolved: @escaping (String?, UInt16?) -> Void) {
        let parameters = NWParameters.tcp
        (parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options)?.version = .v4
        let connection = NWConnection(to: endpoint, using: parameters)
        var answered = false
        let answer = { (host: String?, port: UInt16?) in
            guard !answered else { return }
            answered = true
            connection.cancel()
            resolved(host, port)
        }
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                if case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint, case let .ipv4(address) = host {
                    answer("\(address)".components(separatedBy: "%").first, port.rawValue)
                } else {
                    answer(nil, nil)
                }
            case .failed, .cancelled:
                answer(nil, nil)
            default:
                break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + listening) { answer(nil, nil) }
    }
}

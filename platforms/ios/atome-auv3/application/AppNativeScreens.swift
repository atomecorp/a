import AVFoundation
import Foundation
import Network

/// The named screens of the local network (R-248): an iOS app may not open multicast sockets of its own, so the
/// system's Bonjour browser lists the Chromecasts (`_googlecast._tcp`) and AirPlay receivers (`_airplay._tcp`)
/// heard within two seconds, each resolved to its IPv4 address and port, with its TXT entries. The page hands
/// these records to the local server (`/ws/api` `screens`, local_screens.rs), which reads them and talks to the
/// device. `screens_route` names the AirPlay receiver the sound goes to (a mirroring started in Control Center),
/// so that screen is remembered by its own name.
final class AppNativeScreens {
    static let shared = AppNativeScreens()
    private static let services = ["_googlecast._tcp", "_airplay._tcp"]
    private static let listening: TimeInterval = 2.0
    private let queue = DispatchQueue(label: "atome.screens")

    static func canHandle(command: String) -> Bool { command == "screens_browse" || command == "screens_route" }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        if command == "screens_route" {
            let output = AVAudioSession.sharedInstance().currentRoute.outputs.first { $0.portType == .airPlay }
            completion(["ok": true, "airplay_output": output?.portName ?? NSNull()], nil)
            return
        }
        browse { records in completion(["ok": true, "records": records], nil) }
    }

    private func browse(_ done: @escaping ([[String: Any]]) -> Void) {
        var records: [[String: Any]] = []
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
                done(records)
            }
        }
        for service in Self.services {
            let browser = NWBrowser(for: .bonjourWithTXTRecord(type: service, domain: nil), using: .tcp)
            browser.browseResultsChangedHandler = { [queue] results, _ in
                for result in results where !finished {
                    guard case let .service(name, _, _, _) = result.endpoint, !seen.contains("\(service)/\(name)") else { continue }
                    seen.insert("\(service)/\(name)")
                    var txt: [String: String] = [:]
                    if case let .bonjour(record) = result.metadata { txt = record.dictionary }
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

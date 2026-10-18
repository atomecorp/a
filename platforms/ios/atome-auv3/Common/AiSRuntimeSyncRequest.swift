import Foundation
import SQLite3

extension AiSRuntime {
    static func handleSyncMessage(_ message: [String: Any]) -> [String: Any] {
        queue.sync {
            let requestId = stringValue(message["requestId"])
            let action = stringValue(message["action"])
            guard let localToken = normalizedOptionalString(message["token"]),
                  let claims = try? verifyToken(localToken),
                  normalizedOptionalString(claims["sub"]) != nil else {
                return ["type":"sync-response", "requestId":requestId, "success":false, "error":"Access denied"]
            }
            if action == "configure-remote" || action == "clear-remote" {
                return FastifySyncClient.configureRemote(message, localUserId: stringValue(claims["sub"]))
            }
            if action == "get-pending" {
                do {
                    let db = try openDatabase()
                    let principal = stringValue(claims["sub"])
                    // The oldest undelivered rows only: the page polls this status, and the whole
                    // outbox (314 000 rows) was serialized to it at every read.
                    let rows = try query(db, """
                        SELECT queue_id, atome_id, operation, created_at FROM sync_queue
                        WHERE \(undeliveredOutboxScope) ORDER BY created_at, queue_id LIMIT 100
                        """, [.text(principal)])
                    let count = try undeliveredOutboxCount(db, localPrincipalId: principal)
                    var result: [String: Any] = ["type":"sync-response", "requestId":requestId, "success":true, "changes":rows, "pending_delivery_count":count]
                    result["sync_status"] = syncProgress.read(localPrincipal: stringValue(claims["sub"]))
                    return result
                } catch {
                    return ["type":"sync-response", "requestId":requestId, "success":false, "error":error.localizedDescription]
                }
            }
            return ["type":"sync-response", "requestId":requestId, "success":false, "error":"Unknown sync action"]
        }
    }

}

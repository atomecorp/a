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
                    let rows = try query(db, """
                        SELECT q.queue_id, q.atome_id, q.operation, q.created_at FROM sync_queue q
                        WHERE q.target_server = 'fastify' AND q.status != 'synced' AND json_extract(q.payload, '$.actor.id') = ? ORDER BY q.queue_id
                        """, [.text(stringValue(claims["sub"]))])
                    var result: [String: Any] = ["type":"sync-response", "requestId":requestId, "success":true, "changes":rows, "pending_delivery_count":rows.count]
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

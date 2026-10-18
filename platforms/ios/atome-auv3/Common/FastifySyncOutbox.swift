import Foundation

// Single serialized delivery consumer of the durable AiS outbox.
extension FastifySyncClient {
    // Fastify commits a pushed batch atomically and refuses it whole for one bad event.
    // Refusals no retry can change, as in Tauri's sync worker.
    private static let permanentRefusals: Set<String> = ["event_id_conflict", "property_write_denied"]

    func drainOutbox() {
        guard outboxTask == nil, !outboxUploading, let config = configuration, resolveConfiguration() == config else { return }
        outboxRetry?.cancel(); outboxRetry = nil
        let rows: [[String: Any]], classifying: Bool
        // After a refused batch, its rows go one by one so the refusal lands on its own event.
        do { (rows, classifying) = try AiSRuntime.pendingRemoteSync(principalId: config.principalId, localPrincipalId: config.localPrincipalId, limit: outboxIsolation > 0 ? 1 : 50) }
        catch { notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]); return }
        // Older rows are still being classified one chunk per read: the next chunk runs once
        // the database queue has served the work waiting behind this one.
        guard !rows.isEmpty else { if classifying { scheduleOutboxRetry(after: 0.2) }; return }
        var batch: [(row: [String: Any], event: [String: Any])] = []
        for row in rows {
            do { batch.append((row, try AiSRuntime.outboundSyncEvent(row, localPrincipalId: config.localPrincipalId, principalId: config.principalId))) }
            catch { recordOutbox([row], config: config, error: error.localizedDescription, rejected: true) }
        }
        // Every row was unreadable and is now rejected: the next rows are due.
        guard !batch.isEmpty else { scheduleOutboxRetry(after: 1); return }
        // The files an event refers to reach the server first (as Tauri's sync worker
        // does): a recording made here was otherwise shared as an Atome whose file
        // never left the device.
        outboxUploading = true
        uploadOutboundMedia(batch.map(\.event), config: config) { [weak self] uploaded in
            guard let self else { return }
            self.outboxUploading = false
            guard let current = self.configuration, current.sameIdentity(as: config) else { return }
            // A failed upload holds back its own event only; the rest of the batch goes on.
            let failed = batch.indices.filter { uploaded[$0] == nil }.map { batch[$0].row }
            let sent = batch.indices.filter { uploaded[$0] != nil }
            if !failed.isEmpty { self.recordOutbox(failed, config: current, error: "media_upload_failed", rejected: false) }
            if sent.isEmpty { self.scheduleOutboxRetry(after: Self.retryDelay(failed)); return }
            self.sendOutbox(sent.compactMap { uploaded[$0] }, rows: sent.map { batch[$0].row }, config: current)
        }
    }

    private func sendOutbox(_ events: [[String: Any]], rows: [[String: Any]], config: Configuration) {
        do {
            let requestId = UUID().uuidString.lowercased()
            let data = try JSONSerialization.data(withJSONObject: [
                "type":"sync", "action":"push", "requestId":requestId, "token":config.token,
                "source":deviceSource(), "events":events
            ])
            let session = URLSession(configuration: .ephemeral)
            let task = session.webSocketTask(with: config.apiURL)
            task.maximumMessageSize = 28_000_000
            outboxSession = session; outboxTask = task; outboxRows = rows
            task.resume()
            // A missing receipt must release the socket and retry the same durable IDs.
            queue.asyncAfter(deadline: .now() + 30) { [weak self] in
                guard let self, self.outboxTask === task else { return }
                self.finishOutbox(task, config: config, error: "sync_receipt_timeout")
            }
            task.send(.data(data)) { [weak self] error in
                self?.queue.async {
                    guard let self, self.outboxTask === task else { return }
                    if error != nil { self.finishOutbox(task, config: config, error: "sync_send_failed") }
                    else { self.receiveOutbox(task, requestId: requestId, config: config) }
                }
            }
        } catch {
            notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription])
        }
    }

    private func receiveOutbox(_ task: URLSessionWebSocketTask, requestId: String, config: Configuration) {
        task.receive { [weak self] result in
            self?.queue.async {
                guard let self, self.outboxTask === task else { return }
                guard let current = self.configuration, current.sameIdentity(as: config) else { self.cancelOutbox(); return }
                do {
                    let message = try result.get()
                    let data: Data
                    switch message {
                    case .data(let bytes): data = bytes
                    case .string(let text): data = Data(text.utf8)
                    @unknown default: throw AiSError("sync_receipt_invalid")
                    }
                    guard let response = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AiSError("sync_receipt_invalid") }
                    // /ws/api may announce its welcome before the correlated command reply.
                    guard response["requestId"] as? String == requestId else {
                        self.receiveOutbox(task, requestId: requestId, config: config); return
                    }
                    guard response["success"] as? Bool == true else {
                        self.finishOutbox(task, config: config, error: response["error"] as? String ?? "sync_push_refused", refused: true)
                        return
                    }
                    guard let changes = response["changes"] as? [[String: Any]] else { throw AiSError("sync_receipt_invalid") }
                    let expected = Set(self.outboxRows.map { $0["event_id"] as? String ?? "" })
                    let received = Set(changes.compactMap { $0["id"] as? String })
                    guard expected == received else { throw AiSError("sync_receipt_incomplete") }
                    for change in changes {
                        guard let stream = (change["stream_id"] ?? change["stream"]) as? String else { throw AiSError("sync_receipt_stream_missing") }
                        try AiSRuntime.registerRemoteSyncStream(principalId: config.principalId, streamId: stream)
                    }
                    self.finishOutbox(task, config: config, error: nil)
                    if let persistent = self.syncTask { self.subscribeAvailableStreams(persistent) }
                } catch {
                    self.finishOutbox(task, config: config, error: error.localizedDescription)
                }
            }
        }
    }

    // `refused`: Fastify answered and refused the push, as opposed to a transport failure.
    private func finishOutbox(_ task: URLSessionWebSocketTask, config: Configuration, error: String?, refused: Bool = false) {
        guard outboxTask === task else { return }
        let rows = outboxRows
        cancelOutbox()
        if outboxIsolation > 0 { outboxIsolation -= 1 }
        if error != nil, refused, rows.count > 1 {
            // Not this batch's attempt: deliver its rows alone, now, to find the refused one.
            outboxIsolation = rows.count
            drainOutbox()
            return
        }
        if let error {
            recordOutbox(rows, config: config, error: error, rejected: refused && Self.permanentRefusals.contains(error))
            scheduleOutboxRetry(after: Self.retryDelay(rows))
        } else {
            do { try AiSRuntime.finishRemoteSync(rows, localPrincipalId: config.localPrincipalId) }
            catch { notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]) }
            notifyLocal(["type":"sync:delivery-complete"])
            drainOutbox()
        }
    }

    // Records a delivery failure on these rows only: backoff, or terminal when `rejected`.
    private func recordOutbox(_ rows: [[String: Any]], config: Configuration, error: String, rejected: Bool) {
        do { try AiSRuntime.finishRemoteSync(rows, localPrincipalId: config.localPrincipalId, error: error, rejected: rejected) }
        catch { notifyLocal(["type":"sync:persistence-error", "error":error.localizedDescription]) }
        notifyLocal(["type":"sync:delivery-error", "error":error])
    }

    private func scheduleOutboxRetry(after delay: TimeInterval) {
        let retry = DispatchWorkItem { [weak self] in self?.drainOutbox() }
        outboxRetry = retry
        queue.asyncAfter(deadline: .now() + delay, execute: retry)
    }

    // Same backoff as the rows' `next_retry_at` (see `AiSRuntime.finishRemoteSync`).
    private static func retryDelay(_ rows: [[String: Any]]) -> TimeInterval {
        let attempts = rows.map { AiSRuntime.intValue($0["attempts"], defaultValue: 0) }.max() ?? 0
        return min(pow(2, Double(min(attempts + 1, 6))), 60)
    }

    // MARK: - Flush

    /// Delivers the outbox now and answers once these Atomes are on the server: sharing
    /// an Atome the server has not received yet is refused (`share_owner_required`).
    func flush(atomeIds: [String], timeout: TimeInterval = 90, reply: @escaping ([String: Any]) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            guard let config = self.resolveConfiguration() else {
                reply(["success": false, "error": "sync_remote_unconfigured"]); return
            }
            let wasIdle = self.flushWaiters.isEmpty
            self.flushWaiters.append((atomeIds, Date().addingTimeInterval(timeout), reply))
            self.drainOutbox()
            if wasIdle { self.settleFlushWaiters(config: config) }
        }
    }

    private func settleFlushWaiters(config: Configuration) {
        guard !flushWaiters.isEmpty else { return }
        let now = Date()
        flushWaiters = flushWaiters.filter { waiter in
            do {
                let owed = try AiSRuntime.undeliveredRemoteSync(localPrincipalId: config.localPrincipalId, atomeIds: waiter.atomeIds)
                if owed.count == 0 { waiter.reply(["success": true, "delivered": waiter.atomeIds.count]); return false }
                guard now >= waiter.deadline else { return true }
                waiter.reply(["success": false, "error": owed.lastError ?? "workspace_flush_timeout"])
            } catch {
                waiter.reply(["success": false, "error": error.localizedDescription])
            }
            return false
        }
        guard !flushWaiters.isEmpty else { return }
        // A queued retry is not waited for: the caller is waiting now.
        if outboxTask == nil, !outboxUploading { drainOutbox() }
        queue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self, self.configuration?.sameIdentity(as: config) == true else {
                self?.flushWaiters.forEach { $0.reply(["success": false, "error": "sync_remote_changed"]) }
                self?.flushWaiters.removeAll(); return
            }
            self.settleFlushWaiters(config: config)
        }
    }

    // MARK: - Outbound media

    private func remoteHTTPBase(_ config: Configuration) -> String? {
        guard var parts = URLComponents(url: config.apiURL, resolvingAgainstBaseURL: false) else { return nil }
        parts.scheme = parts.scheme == "ws" ? "http" : "https"
        parts.path = ""; parts.query = nil
        return parts.url?.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    // Local file of an event's media, under this device's own user tree only.
    private func localMediaFile(_ props: [String: Any], localPrincipalId: String) -> (url: URL, relative: String)? {
        guard let raw = ["file_path", "filePath", "path"].compactMap({ props[$0] as? String })
                .first(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) else { return nil }
        // Same roots, same order, as the local server serving `/api/recordings`: the app
        // group container (shared with the AUv3 extension) first, then storage, then Documents.
        let roots = [
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedBus.appGroupSuite)?
                .appendingPathComponent("Documents", isDirectory: true),
            iCloudFileManager.shared.getCurrentStorageURL(),
            FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        ].compactMap { $0 }
        let normalized = raw.replacingOccurrences(of: "\\", with: "/")
        let prefix = "data/users/\(localPrincipalId)/"
        let relative = normalized.components(separatedBy: prefix).count > 1
            ? normalized.components(separatedBy: prefix).last ?? ""
            : normalized.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !relative.isEmpty, !relative.split(separator: "/").contains("..") else { return nil }
        // Folders were written as `Recordings` or `recordings` depending on the writer.
        var variants = [relative]
        var segments = relative.split(separator: "/").map(String.init)
        if let first = segments.first {
            segments[0] = first == first.lowercased() ? first.capitalized : first.lowercased()
            variants.append(segments.joined(separator: "/"))
        }
        let fm = FileManager.default
        for root in roots {
            let base = root.appendingPathComponent("data/users/\(localPrincipalId)", isDirectory: true)
            for variant in variants {
                let candidate = base.appendingPathComponent(variant)
                if fm.fileExists(atPath: candidate.path) { return (candidate, variant) }
            }
        }
        return nil
    }

    // One entry per event: the event with its media now remote, or nil when its upload failed.
    private func uploadOutboundMedia(_ events: [[String: Any]], config: Configuration, completion: @escaping ([[String: Any]?]) -> Void) {
        guard let base = remoteHTTPBase(config) else { completion(events); return }
        var pending: [[String: Any]?] = events
        func step(_ index: Int) {
            guard index < pending.count else { completion(pending); return }
            var event = events[index]
            guard var payload = event["payload"] as? [String: Any],
                  var props = payload["props"] as? [String: Any] else { step(index + 1); return }
            let mediaURL = (props["media_url"] ?? props["mediaUrl"]) as? String ?? ""
            let alreadyRemote = mediaURL.hasPrefix(base) && mediaURL.contains("/api/uploads/")
                && ((props["media_user_id"] ?? props["mediaUserId"]) as? String) == config.principalId
            guard !alreadyRemote, let file = localMediaFile(props, localPrincipalId: config.localPrincipalId),
                  let bytes = try? Data(contentsOf: file.url), let target = URL(string: base + "/api/uploads") else {
                step(index + 1); return
            }
            let fileName = ((props["file_name"] ?? props["fileName"]) as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? file.url.lastPathComponent
            var request = URLRequest(url: target)
            request.httpMethod = "POST"
            request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            request.setValue(fileName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? fileName, forHTTPHeaderField: "X-Filename")
            request.setValue(((props["mime_type"] ?? props["mimeType"]) as? String) ?? "application/octet-stream", forHTTPHeaderField: "X-Mime-Type")
            request.setValue(event["atome_id"] as? String ?? "", forHTTPHeaderField: "X-Atome-Id")
            request.setValue(((props["kind"] ?? props["type"]) as? String) ?? "generic", forHTTPHeaderField: "X-Atome-Type")
            request.setValue(file.relative, forHTTPHeaderField: "X-File-Path")
            request.httpBody = bytes
            URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
                self?.queue.async {
                    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), let data,
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          json["success"] as? Bool == true else { pending[index] = nil; step(index + 1); return }
                    let remoteName = json["file_name"] as? String ?? fileName
                    let remotePath = json["file_path"] as? String ?? remoteName
                    let encodedName = remoteName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? remoteName
                    let encodedOwner = config.principalId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? config.principalId
                    let remoteURL = "\(base)/api/uploads/\(encodedName)?media_user_id=\(encodedOwner)"
                    props["file_name"] = remoteName; props["file_path"] = remotePath
                    props["media_url"] = remoteURL; props["media_user_id"] = config.principalId
                    for key in ["mediaUrl", "src", "url", "stable_media_url"] {
                        if let value = props[key] as? String, value.contains("/api/") || value.contains("127.0.0.1") { props[key] = remoteURL }
                    }
                    payload["props"] = props; event["payload"] = payload
                    pending[index] = event
                    step(index + 1)
                }
            }.resume()
        }
        step(0)
    }

    func cancelOutbox() {
        outboxRetry?.cancel(); outboxRetry = nil
        outboxTask?.cancel(with: .goingAway, reason: nil); outboxTask = nil
        outboxSession?.invalidateAndCancel(); outboxSession = nil
        outboxRows.removeAll()
    }
}

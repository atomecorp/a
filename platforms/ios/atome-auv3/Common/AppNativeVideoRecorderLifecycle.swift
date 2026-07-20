//
//  AppNativeVideoRecorderLifecycle.swift
//  Serialized recording state, terminal recovery, cleanup, and watchdogs.
//

import AVFoundation

extension AppNativeVideoRecorder {
    var hasBlockingTerminalResult: Bool {
        guard let payload = completedPayload, !completedAcknowledged else { return false }
        if payload["discarded"] as? Bool == true { return false }
        if payload["terminal"] as? Bool == false { return true }
        return payload["success"] as? Bool == true
    }

    func clearNonBlockingTerminalResult() {
        guard !hasBlockingTerminalResult else { return }
        completedPayload = nil
        completedAcknowledged = false
    }

    func readState(completion: @escaping Completion) {
        sessionQueue.async {
            self.complete(completion, payload: self.statePayload())
        }
    }

    func acknowledgeTerminal(expectedProjectAtomeId: String = "",
                             completion: @escaping Completion) {
        sessionQueue.async {
            guard self.matchesExpectedProjectAtomeId(expectedProjectAtomeId) else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "video_recording_identity_mismatch"
                ])
                return
            }
            guard let payload = self.completedPayload else {
                self.complete(completion, payload: [
                    "success": true,
                    "status": "already_acknowledged"
                ])
                return
            }
            guard payload["success"] as? Bool == true,
                  payload["terminal"] as? Bool != false else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "video_recording_cleanup_required"
                ])
                return
            }
            self.completedAcknowledged = true
            self.complete(completion, payload: [
                "success": true,
                "status": "acknowledged"
            ])
        }
    }

    func cancel(expectedProjectAtomeId: String = "",
                completion: @escaping Completion) {
        stop(discard: true, expectedProjectAtomeId: expectedProjectAtomeId) { payload, error in
            if payload["error"] as? String == "no_active_video_recording" {
                self.complete(completion, payload: [
                    "success": true,
                    "discarded": true,
                    "terminal": true,
                    "status": "already_cancelled"
                ])
                return
            }
            self.complete(completion, payload: payload, error: error)
        }
    }

    func stop(discard: Bool,
              expectedProjectAtomeId: String = "",
              completion: @escaping Completion) {
        sessionQueue.async {
            guard self.matchesExpectedProjectAtomeId(expectedProjectAtomeId) else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "video_recording_identity_mismatch"
                ])
                return
            }
            if let payload = self.completedPayload {
                self.handleCachedTerminal(payload, discard: discard, completion: completion)
                return
            }
            if !self.stopCompletions.isEmpty {
                self.stopCompletions.append(completion)
                self.discardOnStop = self.discardOnStop || discard
                return
            }
            if self.startCompletion != nil {
                self.stopCompletions.append(completion)
                self.discardOnStop = self.discardOnStop || discard
                self.stopRequestedBeforeStart = true
                if discard && self.movieOutput?.isRecording != true {
                    self.cancelPendingStart()
                }
                return
            }
            guard let output = self.movieOutput else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "no_active_video_recording"
                ])
                return
            }
            guard output.isRecording else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "video_recording_finalizing"
                ])
                return
            }
            self.stopCompletions.append(completion)
            self.discardOnStop = discard
            self.requestActiveOutputStop(output)
        }
    }

    func matchesExpectedProjectAtomeId(_ expected: String) -> Bool {
        let requested = expected.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requested.isEmpty else { return true }
        let active = completedPayload?["project_atome_id"] as? String ?? projectAtomeId ?? ""
        return active.isEmpty || active == requested
    }

    func requestActiveOutputStop(_ output: AVCaptureFileOutput) {
        guard let activeOutput = output as? AVCaptureMovieFileOutput,
              activeOutput === movieOutput else { return }
        stopRequestedBeforeStart = false
        scheduleStopWatchdog(generation: lifecycleGeneration)
        log("recording_stop_requested")
        activeOutput.stopRecording()
    }

    func resetCounters() {
        cancelStartWatchdog()
        cancelStopWatchdog()
        startedAt = nil
        theoreticalFPS = 0
        expectsAudio = false
        discardOnStop = false
        stopRequestedBeforeStart = false
        stopCompletions.removeAll()
    }

    func statePayload() -> [String: Any] {
        let status: String
        let recoverable: Bool
        if !stopCompletions.isEmpty {
            status = "stopping"
            recoverable = true
        } else if movieOutput?.isRecording == true {
            status = "recording"
            recoverable = true
        } else if startCompletion != nil {
            status = "starting"
            recoverable = true
        } else if hasBlockingTerminalResult {
            status = completedPayload?["terminal"] as? Bool == false
                ? "cleanup_required"
                : "completed"
            recoverable = true
        } else {
            status = "idle"
            recoverable = false
        }
        let terminal = completedAcknowledged ? [:] : (completedPayload ?? [:])
        var payload: [String: Any] = [
            "success": true,
            "status": status,
            "recoverable": recoverable,
            "file_name": terminal["file_name"] ?? fileName ?? "",
            "file_path": terminal["file_path"] ?? relativePath ?? "",
            "absolute_file_path": terminal["absolute_file_path"] ?? outputURL?.path ?? "",
            "project_atome_id": terminal["project_atome_id"] ?? projectAtomeId ?? "",
            "camera_position": terminal["camera_position"] ?? cameraPositionName(cameraPosition),
            "expects_audio": terminal["expects_audio"] ?? expectsAudio,
            "terminal": terminal["terminal"] ?? false
        ]
        payload.merge(previewState.statusPayload()) { current, _ in current }
        payload["preview_source_id"] = previewSourceId
        return payload
    }

    func cleanupSessionOnly() {
        if movieOutput?.isRecording == true { movieOutput?.stopRecording() }
        previewState.stop()
        session?.stopRunning()
        session = nil
        movieOutput = nil
        activeDevice = nil
        outputURL = nil
        relativePath = nil
        fileName = nil
        projectAtomeId = nil
        startedAt = nil
        expectsAudio = false
        discardOnStop = false
        stopRequestedBeforeStart = false
    }

    var previewSourceId: String {
        let identity = projectAtomeId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return identity.isEmpty ? "native_video_preview" : "native_video_preview_\(identity)"
    }

    func readPreviewFrame(completion: @escaping Completion) {
        sessionQueue.async {
            self.complete(
                completion,
                payload: self.previewState.framePayload(sourceId: self.previewSourceId)
            )
        }
    }

    func finishEarly(error: String) {
        log("video_start ERROR \(error)")
        failActiveLifecycle(code: error)
    }

    func failActiveLifecycle(code: String) {
        let pendingStart = startCompletion
        let pendingStops = stopCompletions
        let path = outputURL?.path ?? ""
        let resolvedName = fileName ?? URL(fileURLWithPath: path).lastPathComponent
        let resolvedProjectAtomeId = projectAtomeId ?? ""
        lifecycleGeneration &+= 1
        cancelStartWatchdog()
        cancelStopWatchdog()
        startCompletion = nil
        stopCompletions.removeAll()
        cleanupSessionOnly()
        var payload: [String: Any] = [
            "success": false,
            "terminal": true,
            "error": code,
            "file_name": resolvedName,
            "project_atome_id": resolvedProjectAtomeId,
            "absolute_file_path": path,
            "mime_type": "video/quicktime"
        ]
        do {
            try removeFileIfPresent(at: path)
        } catch {
            payload["terminal"] = false
            payload["error"] = "\(code):cleanup_failed:\(error.localizedDescription)"
        }
        finishTerminal(payload, acknowledged: false,
                       pendingStart: pendingStart, pendingStops: pendingStops)
    }

    func cancelPendingStart() {
        let pendingStart = startCompletion
        let pendingStops = stopCompletions
        let path = outputURL?.path ?? ""
        let resolvedName = fileName ?? URL(fileURLWithPath: path).lastPathComponent
        let resolvedProjectAtomeId = projectAtomeId ?? ""
        lifecycleGeneration &+= 1
        cancelStartWatchdog()
        cancelStopWatchdog()
        startCompletion = nil
        stopCompletions.removeAll()
        cleanupSessionOnly()
        do {
            try removeFileIfPresent(at: path)
            FileSyncCoordinator.shared.syncAll(force: true)
            let discarded = discardedPayload(from: [
                "file_name": resolvedName,
                "project_atome_id": resolvedProjectAtomeId,
                "absolute_file_path": path,
                "mime_type": "video/quicktime"
            ])
            completedPayload = discarded
            completedAcknowledged = true
            if let pendingStart {
                complete(pendingStart, payload: [
                    "success": false,
                    "terminal": true,
                    "error": "video_recording_cancelled"
                ])
            }
            pendingStops.forEach { complete($0, payload: discarded) }
        } catch {
            let failure = cleanupFailurePayload(
                base: [
                    "file_name": resolvedName,
                    "project_atome_id": resolvedProjectAtomeId,
                    "absolute_file_path": path
                ],
                code: "video_recording_cancel_failed",
                error: error
            )
            finishTerminal(failure, acknowledged: false,
                           pendingStart: pendingStart, pendingStops: pendingStops)
        }
    }

    func scheduleStartWatchdog(generation: UInt64) {
        cancelStartWatchdog()
        let work = DispatchWorkItem { [weak self] in
            guard let self,
                  self.lifecycleGeneration == generation,
                  self.startCompletion != nil else { return }
            self.failActiveLifecycle(code: "video_recording_start_timeout")
        }
        startWatchdog = work
        sessionQueue.asyncAfter(deadline: .now() + startWatchdogDelay, execute: work)
    }

    func scheduleStopWatchdog(generation: UInt64) {
        cancelStopWatchdog()
        let work = DispatchWorkItem { [weak self] in
            guard let self,
                  self.lifecycleGeneration == generation,
                  !self.stopCompletions.isEmpty else { return }
            self.failActiveLifecycle(code: "video_recording_stop_timeout")
        }
        stopWatchdog = work
        sessionQueue.asyncAfter(deadline: .now() + stopWatchdogDelay, execute: work)
    }

    func cancelStartWatchdog() {
        startWatchdog?.cancel()
        startWatchdog = nil
    }

    func cancelStopWatchdog() {
        stopWatchdog?.cancel()
        stopWatchdog = nil
    }

    func complete(_ completion: @escaping Completion,
                  payload: [String: Any],
                  error: String? = nil) {
        DispatchQueue.main.async { completion(payload, error) }
    }
}

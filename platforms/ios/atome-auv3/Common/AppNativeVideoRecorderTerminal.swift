//
//  AppNativeVideoRecorderTerminal.swift
//  Terminal validation, result caching, and retryable file cleanup.
//

import AVFoundation

extension AppNativeVideoRecorder {
    func handleCachedTerminal(_ payload: [String: Any],
                              discard: Bool,
                              completion: @escaping Completion) {
        if payload["discarded"] as? Bool == true {
            complete(completion, payload: payload)
            return
        }
        if discard {
            retryCachedCleanup(payload, returnDiscarded: true, completion: completion)
            return
        }
        if payload["success"] as? Bool == false,
           payload["terminal"] as? Bool == false {
            retryCachedCleanup(payload, returnDiscarded: false, completion: completion)
            return
        }
        complete(completion, payload: payload)
    }

    func retryCachedCleanup(_ payload: [String: Any],
                            returnDiscarded: Bool,
                            completion: @escaping Completion) {
        do {
            try removeFileIfPresent(at: payload["absolute_file_path"] as? String ?? "")
            FileSyncCoordinator.shared.syncAll(force: true)
            if returnDiscarded {
                let discarded = discardedPayload(from: payload)
                completedPayload = discarded
                completedAcknowledged = true
                complete(completion, payload: discarded)
            } else {
                var terminalFailure = payload
                terminalFailure["terminal"] = true
                completedPayload = terminalFailure
                completedAcknowledged = false
                complete(completion, payload: terminalFailure)
            }
        } catch {
            var retryable = payload
            retryable["success"] = false
            retryable["terminal"] = false
            retryable["error"] = "video_recording_cleanup_failed:\(error.localizedDescription)"
            completedPayload = retryable
            completedAcknowledged = false
            complete(completion, payload: retryable)
        }
    }

    func inspectAndComplete(fileURL: URL, error: Error?) {
        let attrs = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)) ?? [:]
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let inspection = inspectAsset(fileURL: fileURL)
        let duration = inspection.duration
        let resolvedFileName = fileName ?? fileURL.lastPathComponent
        let resolvedRelativePath = relativePath ?? ""
        let nsError = error as NSError?
        let acceptedError = (nsError?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) == true
        let recorderFinished = error == nil || acceptedError
        let videoValid = inspection.videoTrackCount > 0
            && inspection.width > 0
            && inspection.height > 0
            && !inspection.videoCodecs.isEmpty
        let audioValid = !expectsAudio
            || (inspection.audioTrackCount > 0 && !inspection.audioCodecs.isEmpty)
        let success = recorderFinished
            && size > 0
            && duration > 0
            && inspection.isReadable
            && inspection.isPlayable
            && videoValid
            && audioValid
        let videoCodec: Any = inspection.videoCodecs.first.map { $0 as Any } ?? NSNull()
        let audioCodec: Any = inspection.audioCodecs.first.map { $0 as Any } ?? NSNull()
        let successPayload: [String: Any] = [
            "success": true,
            "file_name": resolvedFileName,
            "file_path": resolvedRelativePath,
            "absolute_file_path": fileURL.path,
            "project_atome_id": projectAtomeId ?? "",
            "mime_type": "video/quicktime",
            "container": "mov",
            "is_readable": inspection.isReadable,
            "is_playable": inspection.isPlayable,
            "duration_sec": duration,
            "size_bytes": size,
            "byte_size": size,
            "width": inspection.width,
            "height": inspection.height,
            "orientation": inspection.orientation,
            "rotation_degrees": inspection.rotationDegrees,
            "mirrored": inspection.mirrored,
            "preferred_transform": inspection.preferredTransform,
            "camera_position": cameraPositionName(cameraPosition),
            "expects_audio": expectsAudio,
            "nominal_fps": inspection.nominalFPS,
            "capture_nominal_fps": theoreticalFPS,
            "video_codec": videoCodec,
            "audio_codec": audioCodec,
            "video_codecs": inspection.videoCodecs,
            "audio_codecs": inspection.audioCodecs,
            "video_track_count": inspection.videoTrackCount,
            "audio_track_count": inspection.audioTrackCount
        ]
        let pendingStart = startCompletion
        let pendingStops = stopCompletions

        defer {
            startCompletion = nil
            stopCompletions.removeAll()
            cleanupSessionOnly()
        }

        if discardOnStop {
            do {
                try removeFileIfPresent(at: fileURL.path)
                FileSyncCoordinator.shared.syncAll(force: true)
                finishTerminal(discardedPayload(from: successPayload), acknowledged: true,
                               pendingStart: pendingStart, pendingStops: pendingStops)
            } catch {
                let failure = cleanupFailurePayload(
                    base: successPayload,
                    code: "video_recording_discard_failed",
                    error: error
                )
                finishTerminal(failure, acknowledged: false,
                               pendingStart: pendingStart, pendingStops: pendingStops)
            }
            return
        }

        guard success else {
            let failure = validationFailure(
                recorderFinished: recorderFinished,
                size: size,
                inspection: inspection,
                recordingError: error
            )
            var payload: [String: Any] = [
                "success": false,
                "terminal": true,
                "error": failure,
                "file_name": resolvedFileName,
                "file_path": resolvedRelativePath,
                "absolute_file_path": fileURL.path,
                "project_atome_id": projectAtomeId ?? "",
                "mime_type": "video/quicktime"
            ]
            do {
                try removeFileIfPresent(at: fileURL.path)
            } catch {
                payload["terminal"] = false
                payload["error"] = "\(failure):cleanup_failed:\(error.localizedDescription)"
            }
            log("video_done ERROR file=\(resolvedFileName) bytes=\(size) duration=\(duration) error=\(payload["error"] ?? failure)")
            finishTerminal(payload, acknowledged: false,
                           pendingStart: pendingStart, pendingStops: pendingStops)
            return
        }

        FileSyncCoordinator.shared.syncAll(force: true)
        log("video_done file=\(resolvedFileName) bytes=\(size) duration=\(duration) resolution=\(inspection.width)x\(inspection.height) video_tracks=\(inspection.videoTrackCount) audio_tracks=\(inspection.audioTrackCount) video_codecs=\(inspection.videoCodecs) audio_codecs=\(inspection.audioCodecs)")
        finishTerminal(successPayload, acknowledged: false,
                       pendingStart: pendingStart, pendingStops: pendingStops)
    }

    func validationFailure(recorderFinished: Bool,
                           size: Int,
                           inspection: AppNativeVideoAssetInspection,
                           recordingError: Error?) -> String {
        if !recorderFinished { return recordingError?.localizedDescription ?? "video_recording_failed" }
        if size <= 0 { return "video_recording_empty_file" }
        if inspection.duration <= 0 { return "video_recording_duration_invalid" }
        if !inspection.isReadable { return "video_recording_container_unreadable" }
        if !inspection.isPlayable { return "video_recording_container_not_playable" }
        if inspection.videoTrackCount <= 0 { return "video_recording_video_track_missing" }
        if inspection.width <= 0 || inspection.height <= 0 {
            return "video_recording_dimensions_invalid"
        }
        if inspection.videoCodecs.isEmpty { return "video_recording_video_codec_missing" }
        if expectsAudio && inspection.audioTrackCount <= 0 {
            return "video_recording_audio_track_missing"
        }
        if expectsAudio && inspection.audioCodecs.isEmpty {
            return "video_recording_audio_codec_missing"
        }
        return "video_recording_validation_failed"
    }

    func finishTerminal(_ payload: [String: Any],
                        acknowledged: Bool,
                        pendingStart: Completion?,
                        pendingStops: [Completion]) {
        completedPayload = payload
        completedAcknowledged = acknowledged
        if let pendingStart { complete(pendingStart, payload: payload) }
        pendingStops.forEach { complete($0, payload: payload) }
    }

    func discardedPayload(from payload: [String: Any]) -> [String: Any] {
        return [
            "success": true,
            "discarded": true,
            "terminal": true,
            "file_name": payload["file_name"] as? String ?? "",
            "project_atome_id": payload["project_atome_id"] as? String ?? "",
            "mime_type": payload["mime_type"] as? String ?? "video/quicktime"
        ]
    }

    func cleanupFailurePayload(base: [String: Any], code: String, error: Error) -> [String: Any] {
        return [
            "success": false,
            "terminal": false,
            "error": "\(code):\(error.localizedDescription)",
            "file_name": base["file_name"] as? String ?? "",
            "file_path": base["file_path"] as? String ?? "",
            "absolute_file_path": base["absolute_file_path"] as? String ?? "",
            "project_atome_id": base["project_atome_id"] as? String ?? "",
            "mime_type": base["mime_type"] as? String ?? "video/quicktime"
        ]
    }

    func removeFileIfPresent(at path: String) throws {
        guard !path.isEmpty, FileManager.default.fileExists(atPath: path) else { return }
        try FileManager.default.removeItem(atPath: path)
    }
}

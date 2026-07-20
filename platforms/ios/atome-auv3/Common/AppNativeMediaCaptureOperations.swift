//
//  AppNativeMediaCaptureOperations.swift
//  Photo capture, camera selection, and video recording command bridge.
//

import Foundation
import AVFoundation

extension AppNativeMediaCaptureController: AVCapturePhotoCaptureDelegate {
    func switchCamera(payload: [String: Any],
                      completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if self.videoRecorder.isRecording {
                self.complete(completion, payload: ["success": false], error: "camera_switch_blocked_while_recording")
                return
            }
            let raw = self.resolveString(payload, ["cameraPosition", "camera_position", "camera", "facingMode", "facing_mode"])
            let requested = self.resolveCameraPosition(from: payload)
            self.activeCameraPosition = raw.isEmpty
                ? (self.activeCameraPosition == .front ? .back : .front)
                : requested
            print("[MEDIA_NATIVE] camera_switch position=\(self.cameraPositionName(self.activeCameraPosition))")
            self.complete(completion, payload: [
                "success": true,
                "camera_position": self.cameraPositionName(self.activeCameraPosition)
            ])
        }
    }

    func capturePhoto(payload: [String: Any],
                      completion: @escaping ([String: Any], String?) -> Void) {
        print("[MEDIA_NATIVE] photo_start request payload_keys=\(Array(payload.keys).sorted())")
        requestAccess(video: true, audio: false) { granted, reason in
            guard granted else {
                self.complete(completion, payload: ["success": false], error: reason ?? "camera_permission_denied")
                return
            }
            do {
                guard !self.videoRecorder.isRecording else {
                    self.complete(completion, payload: ["success": false], error: "photo_capture_blocked_while_recording")
                    return
                }
                guard self.photoCompletion == nil else {
                    self.complete(completion, payload: ["success": false], error: "photo_capture_in_progress")
                    return
                }
                let requestedName = self.resolveString(payload, ["fileName", "file_name"])
                let fileName = requestedName.isEmpty
                    ? "photo_\(Int(Date().timeIntervalSince1970)).jpg"
                    : requestedName
                let filePath = self.resolveString(payload, ["filePath", "file_path", "path"])
                let userId = self.resolveString(payload, ["userId", "user_id"])
                let cameraPosition = self.resolveCameraPosition(from: payload)
                self.activeCameraPosition = cameraPosition
                let (url, relativePath) = try self.outputURL(
                    fileName: fileName,
                    filePath: filePath,
                    userId: userId,
                    folder: "captures"
                )
                let (session, photoOutput) = try self.makePhotoSession(position: cameraPosition)
                self.configureVideoConnection(photoOutput.connection(with: .video), position: cameraPosition)
                self.photoSession = session
                self.photoOutput = photoOutput
                self.photoCompletion = completion
                self.photoOutputURL = url
                self.photoRelativePath = relativePath
                self.photoFileName = fileName
                session.startRunning()
                photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
            } catch {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }

    func startVideoRecording(payload: [String: Any],
                             completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if payload["requireSampleAccurate"] as? Bool == true
                || payload["require_sample_accurate"] as? Bool == true {
                self.complete(
                    completion,
                    payload: [
                        "success": false,
                        "code": "av_sample_accurate_overdub_unsupported",
                        "media_kind": "video"
                    ],
                    error: "av_sample_accurate_overdub_unsupported"
                )
                return
            }
            guard self.photoCompletion == nil else {
                self.complete(completion, payload: ["success": false], error: "video_recording_blocked_while_photo_capture")
                return
            }
            self.videoRecorder.start(payload: payload, completion: completion)
        }
    }

    func stopVideoRecording(payload: [String: Any],
                            completion: @escaping ([String: Any], String?) -> Void) {
        let projectAtomeId = resolveString(payload, ["projectAtomeId", "project_atome_id"])
        videoRecorder.stop(
            discard: payload["discard"] as? Bool == true,
            expectedProjectAtomeId: projectAtomeId,
            completion: completion
        )
    }

    func readVideoRecordingState(completion: @escaping ([String: Any], String?) -> Void) {
        videoRecorder.readState(completion: completion)
    }

    func readVideoPreviewFrame(completion: @escaping ([String: Any], String?) -> Void) {
        videoRecorder.readPreviewFrame(completion: completion)
    }

    func cancelVideoRecording(payload: [String: Any],
                              completion: @escaping ([String: Any], String?) -> Void) {
        let projectAtomeId = resolveString(payload, ["projectAtomeId", "project_atome_id"])
        videoRecorder.cancel(expectedProjectAtomeId: projectAtomeId, completion: completion)
    }

    func acknowledgeVideoRecording(payload: [String: Any],
                                   completion: @escaping ([String: Any], String?) -> Void) {
        let projectAtomeId = resolveString(payload, ["projectAtomeId", "project_atome_id"])
        videoRecorder.acknowledgeTerminal(
            expectedProjectAtomeId: projectAtomeId,
            completion: completion
        )
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        sessionQueue.async {
            defer {
                self.photoSession?.stopRunning()
                self.photoSession = nil
                self.photoOutput = nil
                self.photoCompletion = nil
                self.photoOutputURL = nil
                self.photoRelativePath = nil
                self.photoFileName = nil
            }
            guard let completion = self.photoCompletion else { return }
            if let error {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                return
            }
            guard let data = photo.fileDataRepresentation(),
                  let url = self.photoOutputURL else {
                self.complete(completion, payload: ["success": false], error: "photo_data_unavailable")
                return
            }
            do {
                try data.write(to: url, options: [.atomic])
                FileSyncCoordinator.shared.syncAll(force: true)
                let dimensions = photo.resolvedSettings.photoDimensions
                self.complete(completion, payload: [
                    "success": true,
                    "file_name": self.photoFileName ?? url.lastPathComponent,
                    "file_path": self.photoRelativePath ?? "",
                    "absolute_file_path": url.path,
                    "mime_type": "image/jpeg",
                    "width": Int(dimensions.width),
                    "height": Int(dimensions.height),
                    "size_bytes": data.count
                ])
            } catch {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }
}

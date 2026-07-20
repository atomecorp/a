//
//  AppNativeMediaCaptureSupport.swift
//  Permission, orientation, path, and AVCaptureSession construction support.
//

import UIKit
import AVFoundation

extension AppNativeMediaCaptureController {
    func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                          payload: [String: Any],
                          error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    func resolveString(_ payload: [String: Any], _ keys: [String]) -> String {
        for key in keys {
            if let value = payload[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return ""
    }

    func resolveCameraPosition(from payload: [String: Any]) -> AVCaptureDevice.Position {
        let raw = resolveString(payload, ["cameraPosition", "camera_position", "camera", "facingMode", "facing_mode"])
            .lowercased()
        switch raw {
        case "front", "user", "selfie":
            return .front
        case "back", "rear", "environment":
            return .back
        default:
            return activeCameraPosition
        }
    }

    func cameraPositionName(_ position: AVCaptureDevice.Position) -> String {
        switch position {
        case .front:
            return "front"
        case .back:
            return "back"
        default:
            return "unspecified"
        }
    }

    private func currentInterfaceOrientation() -> UIInterfaceOrientation? {
        let resolveOrientation = { () -> UIInterfaceOrientation? in
            if let orientation = self.previewWebView?.window?.windowScene?.interfaceOrientation {
                return orientation
            }
            return nil
        }

        if Thread.isMainThread {
            return resolveOrientation()
        }

        return DispatchQueue.main.sync(execute: resolveOrientation)
    }

    private func currentVideoOrientation() -> AVCaptureVideoOrientation {
        if let orientation = currentInterfaceOrientation() {
            switch orientation {
            case .landscapeLeft:
                return .landscapeLeft
            case .landscapeRight:
                return .landscapeRight
            case .portraitUpsideDown:
                return .portraitUpsideDown
            default:
                return .portrait
            }
        }

        switch UIDevice.current.orientation {
        case .landscapeLeft:
            return .landscapeRight
        case .landscapeRight:
            return .landscapeLeft
        case .portraitUpsideDown:
            return .portraitUpsideDown
        default:
            return .portrait
        }
    }

    func configureVideoConnection(_ connection: AVCaptureConnection?,
                                          position: AVCaptureDevice.Position) {
        guard let connection else { return }
        if connection.isVideoOrientationSupported {
            connection.videoOrientation = currentVideoOrientation()
        }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = position == .front
        }
    }

    func outputURL(fileName: String,
                           filePath: String,
                           userId: String,
                           folder: String) throws -> (URL, String) {
        let safeFileName = fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "capture_\(Int(Date().timeIntervalSince1970))"
            : (fileName as NSString).lastPathComponent
        let relativePath: String
        if !filePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            relativePath = filePath
        } else {
            let safeUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "anonymous" : userId
            relativePath = "data/users/\(safeUserId)/\(folder)/\(safeFileName)"
        }
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath),
              let root = SandboxPathValidator.primaryRoot() else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Invalid media capture path"
            ])
        }
        let url = root.appendingPathComponent(sanitized, isDirectory: false)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return (url, sanitized)
    }

    private func authorizationStatusName(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized:
            return "authorized"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        case .notDetermined:
            return "not_determined"
        @unknown default:
            return "unknown"
        }
    }

    private func permissionPayload(video: Bool, audio: Bool) -> [String: Any] {
        var payload: [String: Any] = [
            "success": true,
            "video_requested": video,
            "audio_requested": audio
        ]
        if video {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            payload["camera_status"] = authorizationStatusName(status)
            payload["camera_granted"] = status == .authorized
        }
        if audio {
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            payload["microphone_status"] = authorizationStatusName(status)
            payload["microphone_granted"] = status == .authorized
        }
        return payload
    }

    private func deniedReason(video: Bool, audio: Bool) -> String? {
        if video {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            if status == .denied || status == .restricted {
                return "camera_permission_denied"
            }
        }
        if audio {
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            if status == .denied || status == .restricted {
                return "microphone_permission_denied"
            }
        }
        return nil
    }

    func prepareCapturePermissions(payload: [String: Any],
                                           completion: @escaping ([String: Any], String?) -> Void) {
        let wantsVideo = (payload["video"] as? Bool) != false
        let wantsAudio = (payload["audio"] as? Bool) != false
        let reason = resolveString(payload, ["reason"])
        print("[AUV3_PERM] prepare request reason=\(reason.isEmpty ? "<none>" : reason) video=\(wantsVideo) audio=\(wantsAudio) camera_status=\(authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .video))) microphone_status=\(authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .audio)))")
        requestAccess(video: wantsVideo, audio: wantsAudio) { granted, denied in
            var result = self.permissionPayload(video: wantsVideo, audio: wantsAudio)
            result["success"] = granted
            result["reason"] = reason
            if let denied {
                result["error"] = denied
            }
            print("[AUV3_PERM] prepare result success=\(granted) error=\(denied ?? "<none>") camera_status=\(result["camera_status"] ?? "<skip>") microphone_status=\(result["microphone_status"] ?? "<skip>")")
            self.complete(completion, payload: result, error: granted ? nil : denied)
        }
    }

    func requestAccess(video: Bool,
                               audio: Bool,
                               completion: @escaping (Bool, String?) -> Void) {
        let group = DispatchGroup()
        var denied: String?
        if video {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            switch status {
            case .authorized:
                break
            case .denied, .restricted:
                denied = denied ?? "camera_permission_denied"
            case .notDetermined:
                group.enter()
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    if !granted { denied = denied ?? "camera_permission_denied" }
                    group.leave()
                }
            @unknown default:
                denied = denied ?? "camera_permission_unknown"
            }
        }
        if audio {
            let status = AVCaptureDevice.authorizationStatus(for: .audio)
            switch status {
            case .authorized:
                break
            case .denied, .restricted:
                denied = denied ?? "microphone_permission_denied"
            case .notDetermined:
                group.enter()
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    if !granted { denied = denied ?? "microphone_permission_denied" }
                    group.leave()
                }
            @unknown default:
                denied = denied ?? "microphone_permission_unknown"
            }
        }
        group.notify(queue: sessionQueue) {
            completion(self.deniedReason(video: video, audio: audio) == nil && denied == nil, denied ?? self.deniedReason(video: video, audio: audio))
        }
    }

    func makePhotoSession(position: AVCaptureDevice.Position) throws -> (AVCaptureSession, AVCapturePhotoOutput) {
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .photo

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position == .front ? .back : .front)
            ?? AVCaptureDevice.default(for: .video) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "camera_unavailable"
            ])
        }
        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "camera_input_unavailable"
            ])
        }
        session.addInput(videoInput)

        let photoOutput = AVCapturePhotoOutput()
        guard session.canAddOutput(photoOutput) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "photo_output_unavailable"
            ])
        }
        session.addOutput(photoOutput)

        session.commitConfiguration()
        return (session, photoOutput)
    }

}

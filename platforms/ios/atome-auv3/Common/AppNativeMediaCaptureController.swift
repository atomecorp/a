//
//  AppNativeMediaCaptureController.swift
//  Shared native media capture controller (camera/microphone) used by both the
//  standalone application target and the AUv3 extension target. Handles the
//  set of `media_*` commands dispatched through the WKWebView native invoke
//  bridge (`window.__ATOME_IOS_NATIVE_INVOKE`).
//
//  The native preview pipeline (`media_camera_preview_show/hide/update`) is kept
//  for explicit native camera-preview commands. During video recording, the
//  recorder owns the single camera session and publishes throttled preview
//  frames to the web layer, where the tool renders them with WebGPU.
//

import UIKit
import WebKit
import AVFoundation
import CoreImage

final class AppNativeMediaCaptureController: NSObject, AVCapturePhotoCaptureDelegate {
    static let shared = AppNativeMediaCaptureController()

    private let sessionQueue = DispatchQueue(label: "atome.app.native_media_capture", qos: .userInitiated)
    private let videoRecorder = AppNativeVideoRecorder()
    private var photoSession: AVCaptureSession?
    private var photoOutput: AVCapturePhotoOutput?
    private var photoCompletion: (([String: Any], String?) -> Void)?
    private var photoOutputURL: URL?
    private var photoRelativePath: String?
    private var photoFileName: String?

    private var activeCameraPosition: AVCaptureDevice.Position = .back
    private weak var previewWebView: WKWebView?
    private var previewView: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var previewSession: AVCaptureSession?
    private var previewMovieOutput: AVCaptureMovieFileOutput?
    private var previewPhotoOutput: AVCapturePhotoOutput?
    private var previewCameraPosition: AVCaptureDevice.Position = .back
    private var previewFrame: CGRect = .zero
    private var previewVisible = false
    private var photoUsesPreviewSession = false

    static func canHandle(command: String) -> Bool {
        switch command {
        case "media_capture_photo",
             "media_capture_permissions_prepare",
             "media_video_record_start",
             "media_video_record_stop",
             "media_camera_switch",
             "media_camera_preview_show",
             "media_camera_preview_update",
             "media_camera_preview_hide":
            return true
        default:
            return false
        }
    }

    func attachPreviewHost(webView: WKWebView) {
        DispatchQueue.main.async {
            self.previewWebView = webView
        }
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "media_capture_photo":
            capturePhoto(payload: payload, completion: completion)
        case "media_capture_permissions_prepare":
            prepareCapturePermissions(payload: payload, completion: completion)
        case "media_video_record_start":
            startVideoRecording(payload: payload, completion: completion)
        case "media_video_record_stop":
            stopVideoRecording(completion: completion)
        case "media_camera_switch":
            switchCamera(payload: payload, completion: completion)
        case "media_camera_preview_show":
            showCameraPreview(payload: payload, completion: completion)
        case "media_camera_preview_update":
            updateCameraPreview(payload: payload, completion: completion)
        case "media_camera_preview_hide":
            hideCameraPreview(completion: completion)
        default:
            completion(["success": false], "Unsupported native media command: \(command)")
        }
    }

    private func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                          payload: [String: Any],
                          error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    private func resolveString(_ payload: [String: Any], _ keys: [String]) -> String {
        for key in keys {
            if let value = payload[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return ""
    }

    private func resolveCameraPosition(from payload: [String: Any]) -> AVCaptureDevice.Position {
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

    private func cameraPositionName(_ position: AVCaptureDevice.Position) -> String {
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
            if let orientation = self.previewView?.window?.windowScene?.interfaceOrientation {
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

    private func configureVideoConnection(_ connection: AVCaptureConnection?,
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

    private func outputURL(fileName: String,
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

    private func prepareCapturePermissions(payload: [String: Any],
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

    private func requestAccess(video: Bool,
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

    private func makeSession(includeAudio: Bool,
                             photo: Bool,
                             position: AVCaptureDevice.Position) throws -> (AVCaptureSession, AVCaptureOutput) {
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = photo ? .photo : .high

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

        if includeAudio, let audioDevice = AVCaptureDevice.default(for: .audio) {
            let audioInput = try AVCaptureDeviceInput(device: audioDevice)
            if session.canAddInput(audioInput) {
                session.addInput(audioInput)
            }
        }

        let output: AVCaptureOutput
        if photo {
            let photoOutput = AVCapturePhotoOutput()
            guard session.canAddOutput(photoOutput) else {
                throw NSError(domain: "AppNativeMediaCaptureController", code: 4, userInfo: [
                    NSLocalizedDescriptionKey: "photo_output_unavailable"
                ])
            }
            session.addOutput(photoOutput)
            output = photoOutput
        } else {
            let movieOutput = AVCaptureMovieFileOutput()
            guard session.canAddOutput(movieOutput) else {
                throw NSError(domain: "AppNativeMediaCaptureController", code: 5, userInfo: [
                    NSLocalizedDescriptionKey: "video_output_unavailable"
                ])
            }
            session.addOutput(movieOutput)
            output = movieOutput
        }

        session.commitConfiguration()
        return (session, output)
    }

    private func makePreviewSession(includeAudio: Bool,
                                    position: AVCaptureDevice.Position) throws -> (AVCaptureSession, AVCaptureMovieFileOutput, AVCapturePhotoOutput) {
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .high

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position == .front ? .back : .front)
            ?? AVCaptureDevice.default(for: .video) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "camera_unavailable"
            ])
        }
        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 7, userInfo: [
                NSLocalizedDescriptionKey: "camera_input_unavailable"
            ])
        }
        session.addInput(videoInput)

        if includeAudio, let audioDevice = AVCaptureDevice.default(for: .audio) {
            let audioInput = try AVCaptureDeviceInput(device: audioDevice)
            if session.canAddInput(audioInput) {
                session.addInput(audioInput)
            }
        }

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(domain: "AppNativeMediaCaptureController", code: 8, userInfo: [
                NSLocalizedDescriptionKey: "video_output_unavailable"
            ])
        }
        session.addOutput(movieOutput)

        let photoOutput = AVCapturePhotoOutput()
        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }

        session.commitConfiguration()
        configureVideoConnection(movieOutput.connection(with: .video), position: position)
        configureVideoConnection(photoOutput.connection(with: .video), position: position)
        return (session, movieOutput, photoOutput)
    }

    private func sessionHasAudioInput(_ session: AVCaptureSession) -> Bool {
        return session.inputs.contains { input in
            guard let deviceInput = input as? AVCaptureDeviceInput else { return false }
            return deviceInput.device.hasMediaType(.audio)
        }
    }

    private func ensureAudioInputIfNeeded(_ session: AVCaptureSession, includeAudio: Bool) throws -> AVCaptureDeviceInput? {
        guard includeAudio, !sessionHasAudioInput(session),
              let audioDevice = AVCaptureDevice.default(for: .audio) else {
            return nil
        }
        let audioInput = try AVCaptureDeviceInput(device: audioDevice)
        guard session.canAddInput(audioInput) else { return nil }
        session.beginConfiguration()
        session.addInput(audioInput)
        session.commitConfiguration()
        return audioInput
    }

    private func configureVideoRecordingAudioSession(includeAudio: Bool) throws {
        guard includeAudio else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker])
        try session.setActive(true)
    }

    private func cgFloatValue(_ value: Any?, fallback: CGFloat = 0) -> CGFloat {
        if let number = value as? NSNumber {
            return CGFloat(number.doubleValue)
        }
        if let string = value as? String,
           let doubleValue = Double(string) {
            return CGFloat(doubleValue)
        }
        return fallback
    }

    private func resolvePreviewFrame(from payload: [String: Any]) -> CGRect {
        let source = payload["frame"] as? [String: Any] ?? payload
        let x = cgFloatValue(source["x"], fallback: cgFloatValue(source["left"]))
        let y = cgFloatValue(source["y"], fallback: cgFloatValue(source["top"]))
        let width = cgFloatValue(source["width"])
        let height = cgFloatValue(source["height"])
        return CGRect(x: x, y: y, width: max(1, width), height: max(1, height))
    }

    private func resolveOptionalPreviewFrame(from payload: [String: Any]) -> CGRect? {
        guard let source = payload["previewFrame"] as? [String: Any]
            ?? payload["preview_frame"] as? [String: Any] else {
            return nil
        }
        let x = cgFloatValue(source["x"], fallback: cgFloatValue(source["left"]))
        let y = cgFloatValue(source["y"], fallback: cgFloatValue(source["top"]))
        let width = cgFloatValue(source["width"])
        let height = cgFloatValue(source["height"])
        guard width > 0, height > 0 else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private func previewSourceName(from payload: [String: Any]) -> String {
        let source = resolveString(payload, ["source", "previewSource", "preview_source"])
        return source.isEmpty ? "unknown" : source
    }

    private func frameDescription(_ frame: CGRect) -> String {
        return "\(Int(frame.minX)),\(Int(frame.minY)),\(Int(frame.width)),\(Int(frame.height))"
    }

    private func ensureNativePreviewView(frame: CGRect,
                                         session: AVCaptureSession,
                                         position: AVCaptureDevice.Position,
                                         completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard let webView = self.previewWebView,
                  webView.superview != nil else {
                completion(false)
                return
            }

            let previewView = self.previewView ?? UIView(frame: .zero)
            previewView.isUserInteractionEnabled = false
            previewView.backgroundColor = .black
            previewView.clipsToBounds = true
            if previewView.superview !== webView {
                previewView.removeFromSuperview()
                webView.addSubview(previewView)
            } else {
                webView.bringSubviewToFront(previewView)
            }

            previewView.frame = frame

            let layer = self.previewLayer ?? AVCaptureVideoPreviewLayer(session: session)
            if layer.superlayer == nil {
                previewView.layer.addSublayer(layer)
            }
            layer.session = session
            layer.videoGravity = .resizeAspectFill
            layer.frame = previewView.bounds
            self.configureVideoConnection(layer.connection, position: position)

            self.previewView = previewView
            self.previewLayer = layer
            self.previewVisible = true
            completion(true)
        }
    }

    private func stopPreviewSessionLocked() {
        self.previewSession?.stopRunning()
        self.previewSession = nil
        self.previewMovieOutput = nil
        self.previewPhotoOutput = nil
    }

    private func showCameraPreview(payload: [String: Any],
                                   completion: @escaping ([String: Any], String?) -> Void) {
        requestAccess(video: true, audio: false) { granted, reason in
            guard granted else {
                self.complete(completion, payload: ["success": false], error: reason ?? "camera_permission_denied")
                return
            }
            do {
                let frame = self.resolvePreviewFrame(from: payload)
                let source = self.previewSourceName(from: payload)
                let requestedPosition = self.resolveCameraPosition(from: payload)

                if self.previewSession == nil || self.previewCameraPosition != requestedPosition {
                    self.stopPreviewSessionLocked()
                    let (session, movieOutput, photoOutput) = try self.makePreviewSession(includeAudio: false, position: requestedPosition)
                    self.previewSession = session
                    self.previewMovieOutput = movieOutput
                    self.previewPhotoOutput = photoOutput
                    self.previewCameraPosition = requestedPosition
                    self.activeCameraPosition = requestedPosition
                    session.startRunning()
                }

                guard let session = self.previewSession else {
                    self.complete(completion, payload: ["success": false], error: "camera_preview_session_unavailable")
                    return
                }

                self.previewFrame = frame
                self.ensureNativePreviewView(frame: frame, session: session, position: requestedPosition) { ok in
                    if ok {
                        let actual = self.previewView?.frame ?? .zero
                        print("[MEDIA_NATIVE] preview_show source=\(source) session=preview camera=\(self.cameraPositionName(requestedPosition)) requested=\(self.frameDescription(frame)) actual=\(self.frameDescription(actual))")
                    }
                    self.complete(completion, payload: [
                        "success": ok,
                        "camera_position": self.cameraPositionName(requestedPosition),
                        "preview_native": true
                    ], error: ok ? nil : "camera_preview_host_unavailable")
                }
            } catch {
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }

    private func updateCameraPreview(payload: [String: Any],
                                     completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            let frame = self.resolvePreviewFrame(from: payload)
            let source = self.previewSourceName(from: payload)
            self.previewFrame = frame
            guard let session = self.previewSession else {
                self.complete(completion, payload: ["success": false], error: "camera_preview_session_unavailable")
                return
            }
            let position = self.previewCameraPosition
            self.ensureNativePreviewView(frame: frame, session: session, position: position) { ok in
                if ok {
                    print("[MEDIA_NATIVE] preview_update source=\(source) session=preview requested=\(self.frameDescription(frame))")
                }
                self.complete(completion, payload: [
                    "success": ok,
                    "preview_native": true
                ], error: ok ? nil : "camera_preview_host_unavailable")
            }
        }
    }

    private func hideCameraPreview(completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            self.previewVisible = false
            self.stopPreviewSessionLocked()
            DispatchQueue.main.async {
                self.previewLayer?.removeFromSuperlayer()
                self.previewLayer = nil
                self.previewView?.removeFromSuperview()
                self.previewView = nil
                completion(["success": true], nil)
            }
        }
    }

    private func switchCamera(payload: [String: Any],
                              completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if self.videoRecorder.isRecording {
                self.complete(completion, payload: ["success": false], error: "camera_switch_blocked_while_recording")
                return
            }
            let raw = self.resolveString(payload, ["cameraPosition", "camera_position", "camera", "facingMode", "facing_mode"])
            let requested = self.resolveCameraPosition(from: payload)
            let next: AVCaptureDevice.Position
            if raw.isEmpty {
                next = self.activeCameraPosition == .front ? .back : .front
            } else {
                next = requested
            }
            self.activeCameraPosition = next
            if self.previewVisible {
                self.previewVisible = false
                self.stopPreviewSessionLocked()
                DispatchQueue.main.async {
                    self.previewLayer?.removeFromSuperlayer()
                    self.previewLayer = nil
                    self.previewView?.removeFromSuperview()
                    self.previewView = nil
                }
            }
            print("[MEDIA_NATIVE] camera_switch position=\(self.cameraPositionName(next))")
            self.complete(completion, payload: [
                "success": true,
                "camera_position": self.cameraPositionName(next)
            ])
        }
    }

    private func capturePhoto(payload: [String: Any],
                              completion: @escaping ([String: Any], String?) -> Void) {
        print("[MEDIA_NATIVE] photo_start request payload_keys=\(Array(payload.keys).sorted())")
        requestAccess(video: true, audio: false) { granted, reason in
            guard granted else {
                print("[MEDIA_NATIVE] photo_start denied reason=\(reason ?? "camera_permission_denied")")
                self.complete(completion, payload: ["success": false], error: reason ?? "camera_permission_denied")
                return
            }
            do {
                if self.photoCompletion != nil {
                    self.complete(completion, payload: ["success": false], error: "photo_capture_in_progress")
                    return
                }
                let fileName = self.resolveString(payload, ["fileName", "file_name"]).isEmpty
                    ? "photo_\(Int(Date().timeIntervalSince1970)).jpg"
                    : self.resolveString(payload, ["fileName", "file_name"])
                let filePath = self.resolveString(payload, ["filePath", "file_path", "path"])
                let userId = self.resolveString(payload, ["userId", "user_id"])
                let cameraPosition = self.resolveCameraPosition(from: payload)
                self.activeCameraPosition = cameraPosition
                let (url, relativePath) = try self.outputURL(fileName: fileName, filePath: filePath, userId: userId, folder: "captures")
                print("[MEDIA_NATIVE] photo_start resolved file=\(fileName) user=\(userId.isEmpty ? "<none>" : userId) camera=\(self.cameraPositionName(cameraPosition)) request_path=\(filePath.isEmpty ? "<none>" : filePath) relative=\(relativePath) absolute=\(url.path)")
                let session: AVCaptureSession
                let photoOutput: AVCapturePhotoOutput
                if let previewSession = self.previewSession,
                   let previewPhotoOutput = self.previewPhotoOutput,
                   self.previewCameraPosition == cameraPosition {
                    session = previewSession
                    photoOutput = previewPhotoOutput
                    self.photoUsesPreviewSession = true
                } else {
                    let made = try self.makeSession(includeAudio: false, photo: true, position: cameraPosition)
                    guard let madePhotoOutput = made.1 as? AVCapturePhotoOutput else {
                        self.complete(completion, payload: ["success": false], error: "photo_output_unavailable")
                        return
                    }
                    session = made.0
                    photoOutput = madePhotoOutput
                    self.photoUsesPreviewSession = false
                }
                self.configureVideoConnection(photoOutput.connection(with: .video), position: cameraPosition)
                self.photoSession = session
                self.photoOutput = photoOutput
                self.photoCompletion = completion
                self.photoOutputURL = url
                self.photoRelativePath = relativePath
                self.photoFileName = fileName
                if !session.isRunning {
                    session.startRunning()
                }
                self.configureVideoConnection(photoOutput.connection(with: .video), position: cameraPosition)
                photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
            } catch {
                print("[MEDIA_NATIVE] photo_start ERROR \(error.localizedDescription)")
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }

    private func startVideoRecording(payload: [String: Any],
                                     completion: @escaping ([String: Any], String?) -> Void) {
        print("[REC_PREVIEW_NATIVE] video_start_request audio=\((payload["audio"] as? Bool) != false) camera=\(cameraPositionName(resolveCameraPosition(from: payload))) native_preview_session=\(previewSession != nil) native_preview_visible=\(previewVisible)")
        sessionQueue.async {
            self.photoSession?.stopRunning()
            self.photoSession = nil
            self.photoOutput = nil
            self.photoCompletion = nil
            self.photoOutputURL = nil
            self.photoRelativePath = nil
            self.photoFileName = nil
            if self.previewSession != nil {
                print("[REC_PREVIEW_NATIVE] stopping_native_preview_before_record camera=\(self.cameraPositionName(self.previewCameraPosition))")
                self.previewVisible = false
                self.stopPreviewSessionLocked()
                DispatchQueue.main.async {
                    self.previewLayer?.removeFromSuperlayer()
                    self.previewLayer = nil
                    self.previewView?.removeFromSuperview()
                    self.previewView = nil
                }
            }
            self.videoRecorder.start(payload: payload, completion: completion)
        }
    }

    private func stopVideoRecording(completion: @escaping ([String: Any], String?) -> Void) {
        videoRecorder.stop(completion: completion)
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        sessionQueue.async {
            defer {
                if !self.photoUsesPreviewSession {
                    self.photoSession?.stopRunning()
                }
                self.photoSession = nil
                self.photoOutput = nil
                self.photoCompletion = nil
                self.photoOutputURL = nil
                self.photoRelativePath = nil
                self.photoFileName = nil
                self.photoUsesPreviewSession = false
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
                print("[MEDIA_NATIVE] photo_done file=\(self.photoFileName ?? url.lastPathComponent) relative=\(self.photoRelativePath ?? "") absolute=\(url.path) bytes=\(data.count) width=\(Int(dimensions.width)) height=\(Int(dimensions.height))")
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
                print("[MEDIA_NATIVE] photo_done ERROR \(error.localizedDescription)")
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }

}

private final class AppNativeVideoRecorder: NSObject, AVCaptureFileOutputRecordingDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let sessionQueue = DispatchQueue(label: "atome.app.native_video_recorder.session", qos: .userInitiated)
    private let previewFrameQueue = DispatchQueue(label: "atome.app.native_video_recorder.preview", qos: .userInteractive)
    private let previewCIContext = CIContext()

    private var session: AVCaptureSession?
    private var movieOutput: AVCaptureMovieFileOutput?
    private var videoOutput: AVCaptureVideoDataOutput?
    private var outputURL: URL?
    private var relativePath: String?
    private var fileName: String?
    private var cameraPosition: AVCaptureDevice.Position = .back
    private var startCompletion: (([String: Any], String?) -> Void)?
    private var stopCompletion: (([String: Any], String?) -> Void)?
    private var completedPayload: [String: Any]?
    private var completedError: String?
    private var startedAt: Date?
    private var activeDevice: AVCaptureDevice?
    private var theoreticalFPS: Double = 0
    private var requestedOrientation = "portrait"
    private var previewSourceId: String?
    private var previewFramesEnabled = false
    private var previewFrameInFlight = false
    private var previewFrameIndex = 0
    private var lastPreviewFrameTime: CFTimeInterval = 0
    private let previewFrameInterval: CFTimeInterval = 1.0 / 12.0
    private let previewMaxEdge: CGFloat = 640

    var isRecording: Bool {
        sessionQueue.sync {
            movieOutput?.isRecording == true || startCompletion != nil || stopCompletion != nil
        }
    }

    func start(payload: [String: Any],
               completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            guard self.movieOutput?.isRecording != true,
                  self.startCompletion == nil,
                  self.stopCompletion == nil else {
                self.complete(completion, payload: ["success": false], error: "video_recording_in_progress")
                return
            }
            self.resetCounters()
            self.startCompletion = completion
            self.completedPayload = nil
            self.completedError = nil
            self.logPermissionsAndDevices()
            let wantsAudio = (payload["audio"] as? Bool) != false
            self.requestPermissions(audio: wantsAudio) { granted, reason in
                guard granted else {
                    self.finishEarly(error: reason ?? "media_permission_denied")
                    return
                }
                self.sessionQueue.async {
                    do {
                        self.cleanupSessionOnly(removePreview: true)
                        self.cameraPosition = self.resolveCameraPosition(from: payload)
                        self.requestedOrientation = self.resolveString(payload, ["orientation"]).lowercased()
                        try self.configureOutputPath(payload: payload)
                        try self.configureSession(includeAudio: wantsAudio, payload: payload)
                        self.startRecording()
                    } catch {
                        self.finishEarly(error: error.localizedDescription)
                    }
                }
            }
        }
    }

    func stop(completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if let payload = self.completedPayload {
                let error = self.completedError
                self.completedPayload = nil
                self.completedError = nil
                self.complete(completion, payload: payload, error: error)
                return
            }
            guard let output = self.movieOutput, output.isRecording else {
                self.complete(completion, payload: ["success": false], error: "no_active_video_recording")
                return
            }
            self.stopCompletion = completion
            self.log("recording_stop_requested")
            output.stopRecording()
        }
    }

    private func resetCounters() {
        startedAt = nil
        theoreticalFPS = 0
        previewFramesEnabled = false
        previewFrameInFlight = false
        previewFrameIndex = 0
        lastPreviewFrameTime = 0
    }

    private func configureOutputPath(payload: [String: Any]) throws {
        let explicitName = resolveString(payload, ["fileName", "file_name"])
        let resolvedName = explicitName.isEmpty ? "video_\(Int(Date().timeIntervalSince1970)).mov" : explicitName
        let filePath = resolveString(payload, ["filePath", "file_path", "path"])
        let userId = resolveString(payload, ["userId", "user_id"])
        let (url, sanitizedRelativePath) = try outputURL(fileName: resolvedName, filePath: filePath, userId: userId)
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        fileName = resolvedName
        relativePath = sanitizedRelativePath
        outputURL = url
        previewSourceId = "native_record_preview_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())"
        log("video_start resolved file=\(resolvedName) user=\(userId.isEmpty ? "<none>" : userId) camera=\(cameraPositionName(cameraPosition)) request_path=\(filePath.isEmpty ? "<none>" : filePath) relative=\(sanitizedRelativePath) absolute=\(url.path)")
    }

    private func configureSession(includeAudio: Bool, payload: [String: Any]) throws {
        let session = AVCaptureSession()
        session.automaticallyConfiguresApplicationAudioSession = true
        session.beginConfiguration()
        session.sessionPreset = .high

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: cameraPosition)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: cameraPosition == .front ? .back : .front)
            ?? AVCaptureDevice.default(for: .video) else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "camera_unavailable"])
        }
        activeDevice = videoDevice
        theoreticalFPS = fpsFromDevice(videoDevice)
        logDevice(videoDevice, media: "video")

        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "camera_input_unavailable"])
        }
        session.addInput(videoInput)

        if includeAudio, let audioDevice = AVCaptureDevice.default(for: .audio) {
            logDevice(audioDevice, media: "audio")
            do {
                let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                if session.canAddInput(audioInput) {
                    session.addInput(audioInput)
                } else {
                    log("audio_input_unavailable reason=session_cannot_add_input")
                }
            } catch {
                log("audio_input_error \(error.localizedDescription)")
            }
        } else if includeAudio {
            log("audio_device_unavailable")
        }

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "video_output_unavailable"])
        }
        session.addOutput(movieOutput)

        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        videoOutput.setSampleBufferDelegate(self, queue: previewFrameQueue)
        guard session.canAddOutput(videoOutput) else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 5, userInfo: [NSLocalizedDescriptionKey: "video_preview_output_unavailable"])
        }
        session.addOutput(videoOutput)

        configureConnection(movieOutput.connection(with: .video))
        configureConnection(videoOutput.connection(with: .video))
        session.commitConfiguration()

        self.session = session
        self.movieOutput = movieOutput
        self.videoOutput = videoOutput

        log("session_configured preset=\(session.sessionPreset.rawValue) inputs=\(session.inputs.count) outputs=\(session.outputs.count) theoretical_fps=\(theoreticalFPS) movie_audio_connection=\(movieOutput.connection(with: .audio) != nil) preview_data_output=true orientation=\(requestedOrientation)")
    }

    private func configureConnection(_ connection: AVCaptureConnection?) {
        guard let connection else { return }
        if connection.isVideoOrientationSupported {
            connection.videoOrientation = videoOrientation(from: requestedOrientation)
        }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = cameraPosition == .front
        }
    }

    private func startRecording() {
        guard let session, let movieOutput, let url = outputURL else {
            finishEarly(error: "video_recording_session_missing")
            return
        }
        startedAt = Date()
        if !session.isRunning {
            session.startRunning()
        }
        log("recording_session_running=\(session.isRunning)")
        log("recording_start path=\(url.path)")
        movieOutput.startRecording(to: url, recordingDelegate: self)
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didStartRecordingTo fileURL: URL,
                    from connections: [AVCaptureConnection]) {
        sessionQueue.async {
            let completion = self.startCompletion
            self.startCompletion = nil
            self.previewFramesEnabled = true
            self.log("video_recording_started file=\(self.fileName ?? fileURL.lastPathComponent) absolute=\(fileURL.path) connections=\(connections.count)")
            print("[REC_PREVIEW_NATIVE] recording_started file=\(self.fileName ?? fileURL.lastPathComponent) preview_source=\(self.previewSourceId ?? "<none>") connections=\(connections.count) session_running=\(self.session?.isRunning == true) output_recording=\(self.movieOutput?.isRecording == true)")
            if let completion {
                self.complete(completion, payload: [
                    "success": true,
                    "file_name": self.fileName ?? fileURL.lastPathComponent,
                    "file_path": self.relativePath ?? "",
                    "absolute_file_path": fileURL.path,
                    "camera_position": self.cameraPositionName(self.cameraPosition),
                    "preview_source_id": self.previewSourceId ?? "",
                    "mime_type": "video/quicktime"
                ])
            }
        }
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard previewFramesEnabled,
              movieOutput?.isRecording == true,
              let sourceId = previewSourceId,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }
        let now = CACurrentMediaTime()
        guard now - lastPreviewFrameTime >= previewFrameInterval else { return }
        guard !previewFrameInFlight else { return }
        lastPreviewFrameTime = now
        previewFrameInFlight = true
        previewFrameIndex += 1
        let sequence = previewFrameIndex

        let image = CIImage(cvPixelBuffer: pixelBuffer)
        let extent = image.extent.integral
        let sourceWidth = max(1, Int(extent.width))
        let sourceHeight = max(1, Int(extent.height))
        let scale = min(1.0, previewMaxEdge / max(extent.width, extent.height))
        let scaledImage = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let scaledExtent = scaledImage.extent.integral
        guard let cgImage = previewCIContext.createCGImage(scaledImage, from: scaledExtent),
              let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.56) else {
            previewFrameInFlight = false
            return
        }

        let payload: [String: Any] = [
            "source_id": sourceId,
            "sequence": sequence,
            "mime_type": "image/jpeg",
            "width": cgImage.width,
            "height": cgImage.height,
            "source_width": sourceWidth,
            "source_height": sourceHeight,
            "timestamp": CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds,
            "data": jpeg.base64EncodedString()
        ]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: jsonData, encoding: .utf8) else {
            previewFrameInFlight = false
            return
        }
        let js = "try{window.__ATOME_NATIVE_VIDEO_PREVIEW_FRAME&&window.__ATOME_NATIVE_VIDEO_PREVIEW_FRAME(\(json));}catch(e){console.log('[REC_PREVIEW_NATIVE] frame_dispatch_js_error', String(e));}"
        WebViewManager.evaluateJS(js, label: "nativeVideoPreview.frame", priority: .normal) { [weak self] _, _ in
            self?.previewFrameQueue.async {
                self?.previewFrameInFlight = false
            }
        }
        previewFrameQueue.asyncAfter(deadline: .now() + 0.65) { [weak self] in
            guard let self,
                  self.previewFrameInFlight,
                  self.previewFrameIndex == sequence else { return }
            self.previewFrameInFlight = false
        }
        if sequence == 1 || sequence % 60 == 0 {
            print("[REC_PREVIEW_NATIVE] frame_sent source=\(sourceId) seq=\(sequence) size=\(jpeg.count) dims=\(cgImage.width)x\(cgImage.height)")
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection],
                    error: Error?) {
        sessionQueue.async {
            self.log("recording_did_finish file=\(outputFileURL.path) error=\(error?.localizedDescription ?? "<none>")")
            self.inspectAndComplete(fileURL: outputFileURL, error: error)
        }
    }

    private func inspectAndComplete(fileURL: URL, error: Error?) {
        let attrs = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)) ?? [:]
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let duration = assetDuration(fileURL: fileURL)
        let measuredFPS = duration > 0 ? theoreticalFPS : 0
        let reportedFrameCount = Int(max(0, (duration * max(theoreticalFPS, 0)).rounded()))
        let fileName = self.fileName ?? fileURL.lastPathComponent
        let relativePath = self.relativePath ?? ""
        let nsError = error as NSError?
        let acceptedError = (nsError?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) == true
        let success = error == nil || acceptedError || size > 0
        let successPayload: [String: Any] = [
            "success": true,
            "file_name": fileName,
            "file_path": relativePath,
            "absolute_file_path": fileURL.path,
            "mime_type": "video/quicktime",
            "duration_sec": duration,
            "size_bytes": size,
            "camera_position": cameraPositionName(cameraPosition),
            "preview_source_id": previewSourceId ?? "",
            "frame_count": reportedFrameCount,
            "captured_fps": measuredFPS,
            "video_track_count": trackCounts(fileURL: fileURL).video,
            "audio_track_count": trackCounts(fileURL: fileURL).audio
        ]
        let completion = stopCompletion
        let pendingStartCompletion = startCompletion

        defer {
            startCompletion = nil
            stopCompletion = nil
            cleanupSessionOnly(removePreview: true)
        }

        guard success else {
            let message = error?.localizedDescription ?? "video_recording_failed"
            let payload: [String: Any] = ["success": false]
            log("video_done ERROR file=\(fileName) absolute=\(fileURL.path) bytes=\(size) duration=\(duration) frames=\(reportedFrameCount) error=\(message)")
            if let completion {
                complete(completion, payload: payload, error: message)
            } else if let pendingStartCompletion {
                complete(pendingStartCompletion, payload: payload, error: message)
            } else {
                completedPayload = payload
                completedError = message
            }
            return
        }

        FileSyncCoordinator.shared.syncAll(force: true)
        let tracks = trackCounts(fileURL: fileURL)
        log("video_done file=\(fileName) relative=\(relativePath) absolute=\(fileURL.path) bytes=\(size) duration=\(duration) frames=\(reportedFrameCount) captured_fps=\(measuredFPS) video_tracks=\(tracks.video) audio_tracks=\(tracks.audio) error=\(error?.localizedDescription ?? "<none>") accepted=\(acceptedError)")
        if let completion {
            complete(completion, payload: successPayload)
        } else if let pendingStartCompletion {
            complete(pendingStartCompletion, payload: [
                "success": true,
                "file_name": fileName,
                "file_path": relativePath,
                "absolute_file_path": fileURL.path,
                "camera_position": cameraPositionName(cameraPosition),
                "preview_source_id": previewSourceId ?? "",
                "mime_type": "video/quicktime"
            ])
            completedPayload = successPayload
            completedError = nil
        } else {
            completedPayload = successPayload
            completedError = nil
        }
    }

    private func cleanupSessionOnly(removePreview: Bool) {
        let sourceId = previewSourceId
        previewFramesEnabled = false
        if movieOutput?.isRecording == true {
            movieOutput?.stopRecording()
        }
        videoOutput?.setSampleBufferDelegate(nil, queue: nil)
        session?.stopRunning()
        session = nil
        movieOutput = nil
        videoOutput = nil
        activeDevice = nil
        outputURL = nil
        relativePath = nil
        fileName = nil
        startedAt = nil
        previewSourceId = nil
        previewFrameInFlight = false
        if let sourceId {
            WebViewManager.evaluateJS(
                "try{window.__ATOME_NATIVE_VIDEO_PREVIEW_STOPPED&&window.__ATOME_NATIVE_VIDEO_PREVIEW_STOPPED('\(sourceId)');}catch(e){}",
                label: "nativeVideoPreview.stop",
                priority: .normal
            )
        }
    }

    private func finishEarly(error: String) {
        log("video_start ERROR \(error)")
        let completion = startCompletion
        startCompletion = nil
        stopCompletion = nil
        cleanupSessionOnly(removePreview: true)
        if let completion {
            complete(completion, payload: ["success": false], error: error)
        }
    }

    private func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                          payload: [String: Any],
                          error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    private func requestPermissions(audio: Bool, _ completion: @escaping (Bool, String?) -> Void) {
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        log("permissions_before camera=\(authorizationStatusName(cameraStatus)) microphone=\(authorizationStatusName(microphoneStatus))")
        let group = DispatchGroup()
        var cameraGranted = cameraStatus == .authorized
        var microphoneGranted = microphoneStatus == .authorized || !audio

        if cameraStatus == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .video) { granted in
                cameraGranted = granted
                self.log("camera_permission_prompt_result granted=\(granted)")
                group.leave()
            }
        }
        if audio && microphoneStatus == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                microphoneGranted = granted
                self.log("microphone_permission_prompt_result granted=\(granted)")
                group.leave()
            }
        }

        group.notify(queue: sessionQueue) {
            self.log("permissions_after camera=\(self.authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .video))) microphone=\(self.authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .audio)))")
            if AVCaptureDevice.authorizationStatus(for: .video) == .denied || AVCaptureDevice.authorizationStatus(for: .video) == .restricted || !cameraGranted {
                completion(false, "camera_permission_denied")
                return
            }
            if audio && (AVCaptureDevice.authorizationStatus(for: .audio) == .denied || AVCaptureDevice.authorizationStatus(for: .audio) == .restricted || !microphoneGranted) {
                completion(false, "microphone_permission_denied")
                return
            }
            completion(true, nil)
        }
    }

    private func outputURL(fileName: String, filePath: String, userId: String) throws -> (URL, String) {
        let safeFileName = fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "video_\(Int(Date().timeIntervalSince1970)).mov"
            : (fileName as NSString).lastPathComponent
        let relativePath: String
        if !filePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            relativePath = filePath
        } else {
            let safeUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "anonymous" : userId
            relativePath = "data/users/\(safeUserId)/recordings/\(safeFileName)"
        }
        guard let sanitized = SandboxPathValidator.sanitizedRelativePath(relativePath),
              let root = SandboxPathValidator.primaryRoot() else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid media capture path"])
        }
        let url = root.appendingPathComponent(sanitized, isDirectory: false)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        return (url, sanitized)
    }

    private func resolveString(_ payload: [String: Any], _ keys: [String]) -> String {
        for key in keys {
            if let value = payload[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return ""
    }

    private func resolveCameraPosition(from payload: [String: Any]) -> AVCaptureDevice.Position {
        let raw = resolveString(payload, ["cameraPosition", "camera_position", "camera", "facingMode", "facing_mode"]).lowercased()
        switch raw {
        case "front", "user", "selfie":
            return .front
        case "back", "rear", "environment":
            return .back
        default:
            return .back
        }
    }

    private func cameraPositionName(_ position: AVCaptureDevice.Position) -> String {
        switch position {
        case .front:
            return "front"
        case .back:
            return "back"
        default:
            return "unspecified"
        }
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

    private func frameDescription(_ frame: CGRect) -> String {
        return "\(Int(frame.minX)),\(Int(frame.minY)),\(Int(frame.width)),\(Int(frame.height))"
    }

    private func videoOrientation(from raw: String) -> AVCaptureVideoOrientation {
        switch raw {
        case "landscape-left":
            return .landscapeLeft
        case "landscape-right":
            return .landscapeRight
        case "portrait-upside-down", "portrait_upsidedown", "portrait-upsidedown":
            return .portraitUpsideDown
        default:
            return .portrait
        }
    }

    private func fpsFromDevice(_ device: AVCaptureDevice) -> Double {
        let duration = device.activeVideoMinFrameDuration.seconds
        if duration.isFinite && duration > 0 {
            return 1.0 / duration
        }
        return device.activeFormat.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 0
    }

    private func assetDuration(fileURL: URL) -> Double {
        let asset = AVURLAsset(url: fileURL)
        let duration = asset.duration.seconds
        if duration.isFinite && duration > 0 {
            return duration
        }
        return startedAt.map { max(0, Date().timeIntervalSince($0)) } ?? 0
    }

    private func trackCounts(fileURL: URL) -> (video: Int, audio: Int) {
        let asset = AVURLAsset(url: fileURL)
        return (
            asset.tracks(withMediaType: .video).count,
            asset.tracks(withMediaType: .audio).count
        )
    }

    private func logPermissionsAndDevices() {
        log("permission_status camera=\(authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .video))) microphone=\(authorizationStatusName(AVCaptureDevice.authorizationStatus(for: .audio)))")
        let videoDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera],
            mediaType: .video,
            position: .unspecified
        ).devices
        log("video_devices count=\(videoDevices.count) names=\(videoDevices.map { $0.localizedName })")
        let audioAvailable = AVCaptureDevice.default(for: .audio) != nil
        log("audio_device_available=\(audioAvailable)")
    }

    private func logDevice(_ device: AVCaptureDevice, media: String) {
        let format = device.activeFormat
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        let ranges = format.videoSupportedFrameRateRanges.map { "\($0.minFrameRate)-\($0.maxFrameRate)" }.joined(separator: ",")
        let subtype = CMFormatDescriptionGetMediaSubType(format.formatDescription)
        log("\(media)_device name=\(device.localizedName) unique_id=\(device.uniqueID) format_subtype=\(fourCC(subtype)) resolution=\(dimensions.width)x\(dimensions.height) fps_ranges=[\(ranges)] active_min_frame_duration=\(device.activeVideoMinFrameDuration.seconds) active_max_frame_duration=\(device.activeVideoMaxFrameDuration.seconds)")
    }

    private func fourCC(_ value: FourCharCode) -> String {
        let chars: [CChar] = [
            CChar((value >> 24) & 0xff),
            CChar((value >> 16) & 0xff),
            CChar((value >> 8) & 0xff),
            CChar(value & 0xff),
            0
        ]
        return String(cString: chars)
    }

    private func log(_ message: String) {
        print("[MEDIA_NATIVE_VIDEO] \(message)")
    }
}

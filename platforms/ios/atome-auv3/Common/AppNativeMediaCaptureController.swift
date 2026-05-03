//
//  AppNativeMediaCaptureController.swift
//  Shared native media capture controller (camera/microphone) used by both the
//  standalone application target and the AUv3 extension target. Handles the
//  set of `media_*` commands dispatched through the WKWebView native invoke
//  bridge (`window.__ATOME_IOS_NATIVE_INVOKE`).
//
//  The previous in-process preview pipeline (`media_camera_preview_show/hide/update`)
//  remains exported for backwards compatibility but is no longer invoked from
//  the JS layer: previews are driven by `navigator.mediaDevices.getUserMedia`
//  directly inside the WebView. Only the recording path (`media_video_record_*`,
//  `media_capture_photo`) is on the active code path.
//

import UIKit
import WebKit
import AVFoundation

final class AppNativeMediaCaptureController: NSObject, AVCapturePhotoCaptureDelegate, AVCaptureFileOutputRecordingDelegate {
    static let shared = AppNativeMediaCaptureController()

    private let sessionQueue = DispatchQueue(label: "atome.app.native_media_capture", qos: .userInitiated)
    private var photoSession: AVCaptureSession?
    private var photoOutput: AVCapturePhotoOutput?
    private var photoCompletion: (([String: Any], String?) -> Void)?
    private var photoOutputURL: URL?
    private var photoRelativePath: String?
    private var photoFileName: String?

    private var videoSession: AVCaptureSession?
    private var movieOutput: AVCaptureMovieFileOutput?
    private var videoCompletion: (([String: Any], String?) -> Void)?
    private var videoStopCompletion: (([String: Any], String?) -> Void)?
    private var videoOutputURL: URL?
    private var videoRelativePath: String?
    private var videoFileName: String?
    private var videoStartedAt: Date?
    private var completedVideoPayload: [String: Any]?
    private var completedVideoError: String?
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
    private var videoUsesPreviewSession = false
    private var photoUsesPreviewSession = false

    static func canHandle(command: String) -> Bool {
        switch command {
        case "media_capture_photo",
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

    private func requestAccess(video: Bool,
                               audio: Bool,
                               completion: @escaping (Bool, String?) -> Void) {
        let group = DispatchGroup()
        var denied: String?
        if video {
            group.enter()
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if !granted { denied = "camera_permission_denied" }
                group.leave()
            }
        }
        if audio {
            group.enter()
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if !granted { denied = "microphone_permission_denied" }
                group.leave()
            }
        }
        group.notify(queue: sessionQueue) {
            completion(denied == nil, denied)
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

    private func ensureNativePreviewView(frame: CGRect,
                                         session: AVCaptureSession,
                                         position: AVCaptureDevice.Position,
                                         completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard let webView = self.previewWebView,
                  let container = webView.superview else {
                completion(false)
                return
            }

            let previewView = self.previewView ?? UIView(frame: .zero)
            previewView.isUserInteractionEnabled = false
            previewView.backgroundColor = .black
            previewView.clipsToBounds = true
            if previewView.superview !== container {
                previewView.removeFromSuperview()
                container.insertSubview(previewView, belowSubview: webView)
            } else {
                container.insertSubview(previewView, belowSubview: webView)
            }

            let webFrame = webView.frame
            previewView.frame = CGRect(
                x: webFrame.minX + frame.minX,
                y: webFrame.minY + frame.minY,
                width: frame.width,
                height: frame.height
            )

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
        guard self.movieOutput?.isRecording != true else { return }
        self.previewSession?.stopRunning()
        self.previewSession = nil
        self.previewMovieOutput = nil
        self.previewPhotoOutput = nil
    }

    private func showCameraPreview(payload: [String: Any],
                                   completion: @escaping ([String: Any], String?) -> Void) {
        let wantsAudio = (payload["audio"] as? Bool) != false
        requestAccess(video: true, audio: wantsAudio) { granted, reason in
            guard granted else {
                self.complete(completion, payload: ["success": false], error: reason ?? "media_permission_denied")
                return
            }
            do {
                let frame = self.resolvePreviewFrame(from: payload)
                let cameraPosition = self.resolveCameraPosition(from: payload)
                if self.previewSession == nil || self.previewCameraPosition != cameraPosition {
                    self.stopPreviewSessionLocked()
                    let (session, movieOutput, photoOutput) = try self.makePreviewSession(includeAudio: wantsAudio, position: cameraPosition)
                    self.previewSession = session
                    self.previewMovieOutput = movieOutput
                    self.previewPhotoOutput = photoOutput
                    self.previewCameraPosition = cameraPosition
                    self.activeCameraPosition = cameraPosition
                    session.startRunning()
                }
                guard let session = self.previewSession else {
                    self.complete(completion, payload: ["success": false], error: "camera_preview_session_unavailable")
                    return
                }
                self.previewFrame = frame
                self.ensureNativePreviewView(frame: frame, session: session, position: cameraPosition) { ok in
                    if ok {
                        print("[MEDIA_NATIVE] preview_show camera=\(self.cameraPositionName(cameraPosition)) frame=\(Int(frame.origin.x)),\(Int(frame.origin.y)),\(Int(frame.width)),\(Int(frame.height))")
                    }
                    self.complete(completion, payload: [
                        "success": ok,
                        "camera_position": self.cameraPositionName(cameraPosition)
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
            guard let session = self.previewSession else {
                self.complete(completion, payload: ["success": false], error: "camera_preview_session_unavailable")
                return
            }
            let frame = self.resolvePreviewFrame(from: payload)
            self.previewFrame = frame
            let position = self.previewCameraPosition
            self.ensureNativePreviewView(frame: frame, session: session, position: position) { ok in
                self.complete(completion, payload: ["success": ok], error: ok ? nil : "camera_preview_host_unavailable")
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
                print("[MEDIA_NATIVE] preview_hide")
                completion(["success": true], nil)
            }
        }
    }

    private func switchCamera(payload: [String: Any],
                              completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if self.movieOutput?.isRecording == true {
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
                do {
                    self.stopPreviewSessionLocked()
                    let (session, movieOutput, photoOutput) = try self.makePreviewSession(includeAudio: true, position: next)
                    self.previewSession = session
                    self.previewMovieOutput = movieOutput
                    self.previewPhotoOutput = photoOutput
                    self.previewCameraPosition = next
                    session.startRunning()
                    self.ensureNativePreviewView(frame: self.previewFrame, session: session, position: next) { _ in }
                } catch {
                    self.complete(completion, payload: ["success": false], error: error.localizedDescription)
                    return
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
                   self.previewCameraPosition == cameraPosition,
                   self.movieOutput?.isRecording != true {
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
        print("[MEDIA_NATIVE] video_start request payload_keys=\(Array(payload.keys).sorted())")
        requestAccess(video: true, audio: true) { granted, reason in
            guard granted else {
                print("[MEDIA_NATIVE] video_start denied reason=\(reason ?? "media_permission_denied")")
                self.complete(completion, payload: ["success": false], error: reason ?? "media_permission_denied")
                return
            }
            do {
                if self.movieOutput?.isRecording == true || self.videoCompletion != nil || self.videoStopCompletion != nil {
                    self.complete(completion, payload: ["success": false], error: "video_recording_in_progress")
                    return
                }
                self.completedVideoPayload = nil
                self.completedVideoError = nil
                self.photoSession?.stopRunning()
                self.photoSession = nil
                self.photoOutput = nil
                self.photoCompletion = nil
                self.photoOutputURL = nil
                self.photoRelativePath = nil
                self.photoFileName = nil
                let fileName = self.resolveString(payload, ["fileName", "file_name"]).isEmpty
                    ? "video_\(Int(Date().timeIntervalSince1970)).mov"
                    : self.resolveString(payload, ["fileName", "file_name"])
                let filePath = self.resolveString(payload, ["filePath", "file_path", "path"])
                let userId = self.resolveString(payload, ["userId", "user_id"])
                let cameraPosition = self.resolveCameraPosition(from: payload)
                self.activeCameraPosition = cameraPosition
                let (url, relativePath) = try self.outputURL(fileName: fileName, filePath: filePath, userId: userId, folder: "recordings")
                print("[MEDIA_NATIVE] video_start resolved file=\(fileName) user=\(userId.isEmpty ? "<none>" : userId) camera=\(self.cameraPositionName(cameraPosition)) request_path=\(filePath.isEmpty ? "<none>" : filePath) relative=\(relativePath) absolute=\(url.path)")
                if FileManager.default.fileExists(atPath: url.path) {
                    try FileManager.default.removeItem(at: url)
                }
                let session: AVCaptureSession
                let movieOutput: AVCaptureMovieFileOutput
                if let previewSession = self.previewSession,
                   let previewMovieOutput = self.previewMovieOutput,
                   self.previewCameraPosition == cameraPosition {
                    session = previewSession
                    movieOutput = previewMovieOutput
                    self.videoUsesPreviewSession = true
                } else {
                    let made = try self.makeSession(includeAudio: true, photo: false, position: cameraPosition)
                    guard let madeMovieOutput = made.1 as? AVCaptureMovieFileOutput else {
                        self.complete(completion, payload: ["success": false], error: "video_output_unavailable")
                        return
                    }
                    session = made.0
                    movieOutput = madeMovieOutput
                    self.videoUsesPreviewSession = false
                }
                self.configureVideoConnection(movieOutput.connection(with: .video), position: cameraPosition)
                self.videoSession = session
                self.movieOutput = movieOutput
                self.videoCompletion = completion
                self.videoOutputURL = url
                self.videoRelativePath = relativePath
                self.videoFileName = fileName
                self.videoStartedAt = Date()
                if !session.isRunning {
                    session.startRunning()
                }
                self.configureVideoConnection(movieOutput.connection(with: .video), position: cameraPosition)
                movieOutput.startRecording(to: url, recordingDelegate: self)
            } catch {
                print("[MEDIA_NATIVE] video_start ERROR \(error.localizedDescription)")
                self.complete(completion, payload: ["success": false], error: error.localizedDescription)
            }
        }
    }

    private func stopVideoRecording(completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            if let payload = self.completedVideoPayload {
                let error = self.completedVideoError
                self.completedVideoPayload = nil
                self.completedVideoError = nil
                self.complete(completion, payload: payload, error: error)
                return
            }
            guard let output = self.movieOutput, output.isRecording else {
                self.complete(completion, payload: ["success": false], error: "no_active_video_recording")
                return
            }
            self.videoStopCompletion = completion
            output.stopRecording()
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didStartRecordingTo fileURL: URL,
                    from connections: [AVCaptureConnection]) {
        sessionQueue.async {
            guard let completion = self.videoCompletion else { return }
            self.videoCompletion = nil
            print("[MEDIA_NATIVE] video_recording_started file=\(self.videoFileName ?? fileURL.lastPathComponent) absolute=\(fileURL.path)")
            self.complete(completion, payload: [
                "success": true,
                "file_name": self.videoFileName ?? fileURL.lastPathComponent,
                "file_path": self.videoRelativePath ?? "",
                "absolute_file_path": fileURL.path,
                "camera_position": self.cameraPositionName(self.activeCameraPosition),
                "mime_type": "video/quicktime"
            ])
        }
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

    func fileOutput(_ output: AVCaptureFileOutput,
                    didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection],
                    error: Error?) {
        sessionQueue.async {
            let completion = self.videoStopCompletion
            let startCompletion = self.videoCompletion
            let attrs = (try? FileManager.default.attributesOfItem(atPath: outputFileURL.path)) ?? [:]
            let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
            let duration = self.videoStartedAt.map { max(0, Date().timeIntervalSince($0)) } ?? 0
            let fileName = self.videoFileName ?? outputFileURL.lastPathComponent
            let relativePath = self.videoRelativePath ?? ""
            let successPayload: [String: Any] = [
                "success": true,
                "file_name": fileName,
                "file_path": relativePath,
                "absolute_file_path": outputFileURL.path,
                "mime_type": "video/quicktime",
                "duration_sec": duration,
                "size_bytes": size,
                "camera_position": self.cameraPositionName(self.activeCameraPosition)
            ]
            defer {
                if !self.videoUsesPreviewSession {
                    self.videoSession?.stopRunning()
                }
                self.videoSession = nil
                self.movieOutput = nil
                self.videoCompletion = nil
                self.videoStopCompletion = nil
                self.videoOutputURL = nil
                self.videoRelativePath = nil
                self.videoFileName = nil
                self.videoStartedAt = nil
                self.videoUsesPreviewSession = false
            }
            if let error {
                let message = error.localizedDescription
                let nsError = error as NSError
                let recordingFinished = (nsError.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) == true
                if recordingFinished || size > 0 {
                    FileSyncCoordinator.shared.syncAll(force: true)
                    print("[MEDIA_NATIVE] video_done file=\(fileName) relative=\(relativePath) absolute=\(outputFileURL.path) bytes=\(size) duration=\(duration) error=\(message) accepted=true")
                    if let completion {
                        self.complete(completion, payload: successPayload)
                    } else if let startCompletion {
                        self.complete(startCompletion, payload: [
                            "success": true,
                            "file_name": fileName,
                            "file_path": relativePath,
                            "absolute_file_path": outputFileURL.path,
                            "camera_position": self.cameraPositionName(self.activeCameraPosition),
                            "mime_type": "video/quicktime"
                        ])
                        self.completedVideoPayload = successPayload
                        self.completedVideoError = nil
                    } else {
                        self.completedVideoPayload = successPayload
                        self.completedVideoError = nil
                    }
                    return
                }
                let payload: [String: Any] = ["success": false]
                print("[MEDIA_NATIVE] video_done ERROR file=\(fileName) absolute=\(outputFileURL.path) bytes=\(size) error=\(message)")
                if let completion {
                    self.complete(completion, payload: payload, error: message)
                } else if let startCompletion {
                    self.complete(startCompletion, payload: payload, error: message)
                } else {
                    self.completedVideoPayload = payload
                    self.completedVideoError = message
                }
                return
            }
            FileSyncCoordinator.shared.syncAll(force: true)
            print("[MEDIA_NATIVE] video_done file=\(fileName) relative=\(relativePath) absolute=\(outputFileURL.path) bytes=\(size) duration=\(duration) error=<none>")
            if let completion {
                self.complete(completion, payload: successPayload)
            } else if let startCompletion {
                self.complete(startCompletion, payload: [
                    "success": true,
                    "file_name": fileName,
                    "file_path": relativePath,
                    "absolute_file_path": outputFileURL.path,
                    "camera_position": self.cameraPositionName(self.activeCameraPosition),
                    "mime_type": "video/quicktime"
                ])
                self.completedVideoPayload = successPayload
                self.completedVideoError = nil
            } else {
                self.completedVideoPayload = successPayload
                self.completedVideoError = nil
            }
        }
    }
}

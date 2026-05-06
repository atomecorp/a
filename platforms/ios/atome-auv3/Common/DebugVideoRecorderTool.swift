// DEBUG VIDEO TOOL - START
// DebugVideoRecorderTool.swift
// Temporary iOS camera/video diagnostics.
// Temporary debug tool. Remove this file and the matching DEBUG VIDEO TOOL
// blocks in WebViewManager.swift, ViewController.swift, AudioUnitViewController.swift,
// and eVeIntuition.js once the video capture/playback issue is resolved.

import UIKit
import WebKit
import AVFoundation

final class DebugVideoRecorderTool: NSObject, AVCaptureFileOutputRecordingDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    static let shared = DebugVideoRecorderTool()

    private let sessionQueue = DispatchQueue(label: "atome.debug_video_recorder.session", qos: .userInitiated)
    private let sampleQueue = DispatchQueue(label: "atome.debug_video_recorder.samples", qos: .userInitiated)

    private weak var webView: WKWebView?
    private weak var hostView: UIView?
    private var overlayView: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var playerLayer: AVPlayerLayer?
    private var player: AVPlayer?

    private var session: AVCaptureSession?
    private var movieOutput: AVCaptureMovieFileOutput?
    private var videoOutput: AVCaptureVideoDataOutput?
    private var outputURL: URL?
    private var runCompletion: (([String: Any], String?) -> Void)?
    private var startedAt: Date?
    private var firstFramePTS: CMTime?
    private var lastFramePTS: CMTime?
    private var frameCount = 0
    private var frameTimestamps: [Double] = []
    private var activeDevice: AVCaptureDevice?
    private var theoreticalFPS: Double = 0
    private var requestedStop = false

    static func canHandle(command: String) -> Bool {
        command == "debug_video_recorder_run" || command == "debug_video_recorder_cleanup"
    }

    func attach(webView: WKWebView) {
        DispatchQueue.main.async {
            self.webView = webView
            self.hostView = webView.superview
        }
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "debug_video_recorder_run":
            run(payload: payload, completion: completion)
        case "debug_video_recorder_cleanup":
            cleanup()
            completion(["success": true], nil)
        default:
            completion(["success": false], "Unsupported DebugVideoRecorderTool command: \(command)")
        }
    }

    private func run(payload: [String: Any],
                     completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            guard self.runCompletion == nil else {
                self.complete(completion, payload: ["success": false], error: "debug_video_recorder_already_running")
                return
            }
            self.resetCounters()
            self.runCompletion = completion
            self.log("run_start payload_keys=\(Array(payload.keys).sorted())")
            self.logPermissionsAndDevices()
            self.requestPermissions { granted, reason in
                guard granted else {
                    self.finishEarly(error: reason ?? "debug_video_recorder_permission_denied")
                    return
                }
                self.sessionQueue.async {
                    do {
                        try self.configureSession()
                        self.startRecording()
                    } catch {
                        self.finishEarly(error: error.localizedDescription)
                    }
                }
            }
        }
    }

    private func resetCounters() {
        frameCount = 0
        frameTimestamps = []
        firstFramePTS = nil
        lastFramePTS = nil
        startedAt = nil
        requestedStop = false
    }

    private func requestPermissions(_ completion: @escaping (Bool, String?) -> Void) {
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        log("permissions_before camera=\(statusName(cameraStatus)) microphone=\(statusName(microphoneStatus))")

        let group = DispatchGroup()
        var cameraGranted = cameraStatus == .authorized
        var microphoneGranted = microphoneStatus == .authorized

        if cameraStatus == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .video) { granted in
                cameraGranted = granted
                self.log("camera_permission_prompt_result granted=\(granted)")
                group.leave()
            }
        }
        if microphoneStatus == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                microphoneGranted = granted
                self.log("microphone_permission_prompt_result granted=\(granted)")
                group.leave()
            }
        }

        group.notify(queue: sessionQueue) {
            self.log("permissions_after camera=\(self.statusName(AVCaptureDevice.authorizationStatus(for: .video))) microphone=\(self.statusName(AVCaptureDevice.authorizationStatus(for: .audio)))")
            guard cameraGranted else {
                completion(false, "debug_video_recorder_camera_permission_denied")
                return
            }
            completion(true, microphoneGranted ? nil : "debug_video_recorder_microphone_permission_denied")
        }
    }

    private func configureSession() throws {
        cleanupSessionOnly()

        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .high

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video) else {
            throw NSError(domain: "DebugVideoRecorderTool", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video device available"])
        }
        activeDevice = videoDevice
        theoreticalFPS = fpsFromDevice(videoDevice)
        logDevice(videoDevice, media: "video")

        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw NSError(domain: "DebugVideoRecorderTool", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"])
        }
        session.addInput(videoInput)

        if let audioDevice = AVCaptureDevice.default(for: .audio) {
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
        } else {
            log("audio_device_unavailable")
        }

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(domain: "DebugVideoRecorderTool", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot add movie output"])
        }
        session.addOutput(movieOutput)

        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.videoSettings = [:]
        videoOutput.setSampleBufferDelegate(self, queue: sampleQueue)
        if session.canAddOutput(videoOutput) {
            session.addOutput(videoOutput)
        } else {
            log("video_data_output_unavailable reason=session_cannot_add_output")
        }

        configureConnection(movieOutput.connection(with: .video))
        configureConnection(videoOutput.connection(with: .video))
        session.commitConfiguration()

        self.session = session
        self.movieOutput = movieOutput
        self.videoOutput = videoOutput

        DispatchQueue.main.async {
            self.installPreview(session: session)
        }

        log("session_configured preset=\(session.sessionPreset.rawValue) inputs=\(session.inputs.count) outputs=\(session.outputs.count) theoretical_fps=\(theoreticalFPS)")
        log("video_output_settings=\(videoOutput.videoSettings ?? [:]) available_pixel_formats=\(videoOutput.availableVideoPixelFormatTypes)")
    }

    private func configureConnection(_ connection: AVCaptureConnection?) {
        guard let connection else { return }
        if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = false
        }
    }

    private func startRecording() {
        guard let session, let movieOutput else {
            finishEarly(error: "debug_video_recorder_session_missing")
            return
        }

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("DebugVideoRecorderTool", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            finishEarly(error: error.localizedDescription)
            return
        }
        let url = directory.appendingPathComponent("debug_video_recorder_\(Int(Date().timeIntervalSince1970)).mov")
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: url)
        }
        outputURL = url
        startedAt = Date()

        if !session.isRunning {
            session.startRunning()
        }
        log("preview_state_before_recording isPreviewing=\(previewLayer?.isPreviewing == true) session_running=\(session.isRunning)")
        log("recording_start path=\(url.path)")
        movieOutput.startRecording(to: url, recordingDelegate: self)

        sessionQueue.asyncAfter(deadline: .now() + 5.0) {
            guard self.movieOutput?.isRecording == true else { return }
            self.requestedStop = true
            self.log("recording_stop_requested_after_5s frames=\(self.frameCount)")
            self.movieOutput?.stopRecording()
        }
    }

    private func installPreview(session: AVCaptureSession) {
        guard let host = hostView ?? webView?.superview ?? webView else {
            log("preview_install_failed host_view_missing")
            return
        }

        let overlay = overlayView ?? UIView()
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.85)
        overlay.layer.borderColor = UIColor.systemYellow.cgColor
        overlay.layer.borderWidth = 2
        overlay.layer.cornerRadius = 6
        overlay.clipsToBounds = true
        overlay.frame = CGRect(x: 14, y: max(14, host.safeAreaInsets.top + 14), width: min(260, host.bounds.width - 28), height: 360)
        overlay.autoresizingMask = [.flexibleRightMargin, .flexibleBottomMargin]
        if overlay.superview == nil {
            host.addSubview(overlay)
        }

        let layer = previewLayer ?? AVCaptureVideoPreviewLayer(session: session)
        layer.session = session
        layer.videoGravity = .resizeAspectFill
        layer.frame = overlay.bounds
        if layer.superlayer == nil {
            overlay.layer.insertSublayer(layer, at: 0)
        }
        overlayView = overlay
        previewLayer = layer
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil
        player = nil
        log("preview_installed frame=\(overlay.frame.debugDescription) layer_previewing=\(layer.isPreviewing)")
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didStartRecordingTo fileURL: URL,
                    from connections: [AVCaptureConnection]) {
        log("recording_did_start file=\(fileURL.path) connections=\(connections.count) previewing=\(previewLayer?.isPreviewing == true)")
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection],
                    error: Error?) {
        sessionQueue.async {
            self.log("recording_did_finish file=\(outputFileURL.path) error=\(error?.localizedDescription ?? "<none>") previewing=\(self.previewLayer?.isPreviewing == true)")
            self.session?.stopRunning()
            self.inspectAndComplete(fileURL: outputFileURL, error: error)
        }
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let seconds = pts.seconds.isFinite ? pts.seconds : 0
        if firstFramePTS == nil {
            firstFramePTS = pts
            log("first_frame pts=\(seconds)")
        }
        lastFramePTS = pts
        frameCount += 1
        if frameTimestamps.count < 240 {
            frameTimestamps.append(seconds)
        }
        if frameCount % 30 == 0 {
            log("frame_sample count=\(frameCount) pts=\(seconds)")
        }
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didDrop sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        log("frame_dropped pts=\(pts.seconds)")
    }

    private func inspectAndComplete(fileURL: URL, error: Error?) {
        let attrs = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)) ?? [:]
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let fileExists = FileManager.default.fileExists(atPath: fileURL.path)
        let frameDuration = frameDurationSeconds()
        let measuredFPS = frameDuration > 0 ? Double(max(0, frameCount - 1)) / frameDuration : 0
        let asset = AVURLAsset(url: fileURL)
        let tracks = asset.tracks(withMediaType: .video)
        let audioTracks = asset.tracks(withMediaType: .audio)
        let videoTrack = tracks.first
        let codec = codecName(from: videoTrack)
        let naturalSize = videoTrack?.naturalSize ?? .zero
        let readable = asset.isReadable
        let playable = asset.isPlayable
        let duration = asset.duration.seconds.isFinite ? asset.duration.seconds : 0
        let finalized = fileExists && size > 0 && readable && !tracks.isEmpty
        let avError = error as NSError?
        let finishedFlag = avError?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool

        let payload: [String: Any] = [
            "success": finalized,
            "tool": "DebugVideoRecorderTool",
            "file_exists": fileExists,
            "file_finalized": finalized,
            "file_path": fileURL.path,
            "size_bytes": size,
            "duration_sec": duration,
            "codec": codec,
            "width": Int(abs(naturalSize.width)),
            "height": Int(abs(naturalSize.height)),
            "theoretical_fps": theoreticalFPS,
            "captured_fps": measuredFPS,
            "frame_count": frameCount,
            "frame_timestamps": frameTimestamps,
            "preview_was_installed": previewLayer != nil,
            "preview_is_previewing_after_finish": previewLayer?.isPreviewing == true,
            "asset_readable": readable,
            "asset_playable": playable,
            "video_track_count": tracks.count,
            "audio_track_count": audioTracks.count,
            "avfoundation_error": error?.localizedDescription ?? "",
            "averror_recording_successfully_finished": finishedFlag as Any
        ]

        log("file_state exists=\(fileExists) finalized=\(finalized) bytes=\(size) path=\(fileURL.path)")
        log("asset_state readable=\(readable) playable=\(playable) duration=\(duration) video_tracks=\(tracks.count) audio_tracks=\(audioTracks.count) codec=\(codec) size=\(naturalSize)")
        log("fps theoretical=\(theoreticalFPS) captured=\(measuredFPS) frames=\(frameCount) frame_duration=\(frameDuration)")
        log("timestamps \(frameTimestamps)")

        DispatchQueue.main.async {
            self.tryReplay(fileURL: fileURL)
        }

        let completion = runCompletion
        runCompletion = nil
        cleanupSessionOnly()
        if let completion {
            complete(completion, payload: payload, error: finalized ? nil : (error?.localizedDescription ?? "debug_video_recorder_file_not_finalized"))
        }
    }

    private func tryReplay(fileURL: URL) {
        guard let overlay = overlayView else {
            log("replay_failed overlay_missing")
            return
        }
        previewLayer?.removeFromSuperlayer()
        previewLayer = nil
        let player = AVPlayer(url: fileURL)
        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.videoGravity = .resizeAspect
        playerLayer.frame = overlay.bounds
        overlay.layer.insertSublayer(playerLayer, at: 0)
        self.player = player
        self.playerLayer = playerLayer
        log("replay_attempt_started path=\(fileURL.path)")
        player.play()
    }

    private func cleanup() {
        sessionQueue.async {
            self.cleanupSessionOnly()
            DispatchQueue.main.async {
                self.player?.pause()
                self.player = nil
                self.playerLayer?.removeFromSuperlayer()
                self.playerLayer = nil
                self.previewLayer?.removeFromSuperlayer()
                self.previewLayer = nil
                self.overlayView?.removeFromSuperview()
                self.overlayView = nil
                self.log("cleanup_complete")
            }
        }
    }

    private func cleanupSessionOnly() {
        if movieOutput?.isRecording == true {
            movieOutput?.stopRecording()
        }
        session?.stopRunning()
        videoOutput?.setSampleBufferDelegate(nil, queue: nil)
        session = nil
        movieOutput = nil
        videoOutput = nil
        activeDevice = nil
    }

    private func finishEarly(error: String) {
        log("run_error \(error)")
        let completion = runCompletion
        runCompletion = nil
        cleanupSessionOnly()
        if let completion {
            complete(completion, payload: [
                "success": false,
                "tool": "DebugVideoRecorderTool",
                "error": error,
                "frame_count": frameCount,
                "frame_timestamps": frameTimestamps
            ], error: error)
        }
    }

    private func complete(_ completion: @escaping ([String: Any], String?) -> Void,
                          payload: [String: Any],
                          error: String? = nil) {
        DispatchQueue.main.async {
            completion(payload, error)
        }
    }

    private func logPermissionsAndDevices() {
        log("permission_status camera=\(statusName(AVCaptureDevice.authorizationStatus(for: .video))) microphone=\(statusName(AVCaptureDevice.authorizationStatus(for: .audio)))")
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

    private func fpsFromDevice(_ device: AVCaptureDevice) -> Double {
        let duration = device.activeVideoMinFrameDuration.seconds
        if duration.isFinite && duration > 0 {
            return 1.0 / duration
        }
        return device.activeFormat.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 0
    }

    private func frameDurationSeconds() -> Double {
        guard let firstFramePTS, let lastFramePTS else { return 0 }
        let delta = CMTimeSubtract(lastFramePTS, firstFramePTS).seconds
        return delta.isFinite ? max(0, delta) : 0
    }

    private func codecName(from track: AVAssetTrack?) -> String {
        guard let description = track?.formatDescriptions.first else { return "unknown" }
        let format = description as! CMFormatDescription
        return fourCC(CMFormatDescriptionGetMediaSubType(format))
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

    private func statusName(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not_determined"
        @unknown default: return "unknown"
        }
    }

    private func log(_ message: String) {
        let line = "[DEBUG_VIDEO_TOOL] \(message)"
        print(line)
        DispatchQueue.main.async {
            let escaped = line
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "`", with: "\\`")
                .replacingOccurrences(of: "$", with: "\\$")
                .replacingOccurrences(of: "\n", with: "\\n")
            WebViewManager.evaluateJS(
                "try{window.__DEBUG_VIDEO_RECORDER_LOG && window.__DEBUG_VIDEO_RECORDER_LOG(`\(escaped)`);}catch(e){console.log('[DEBUG_VIDEO_TOOL] webview_log_error', e);}",
                label: "debugVideo.log",
                priority: .normal,
                targetWebView: self.webView
            )
        }
    }
}

// DEBUG VIDEO TOOL - END

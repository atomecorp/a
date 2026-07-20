//
//  AppNativeVideoRecorder.swift
//  AVCaptureMovieFileOutput recording lifecycle and terminal validation.
//

import AVFoundation

final class AppNativeVideoRecorder: NSObject, AVCaptureFileOutputRecordingDelegate {
    typealias Completion = ([String: Any], String?) -> Void

    let sessionQueue = DispatchQueue(label: "atome.app.native_video_recorder.session", qos: .userInitiated)

    var session: AVCaptureSession?
    var movieOutput: AVCaptureMovieFileOutput?
    let previewState = AppNativeVideoPreviewState()
    var outputURL: URL?
    var relativePath: String?
    var fileName: String?
    var projectAtomeId: String?
    var cameraPosition: AVCaptureDevice.Position = .back
    var startCompletion: Completion?
    var stopCompletions: [Completion] = []
    var completedPayload: [String: Any]?
    var completedAcknowledged = false
    var startedAt: Date?
    var activeDevice: AVCaptureDevice?
    var theoreticalFPS: Double = 0
    var requestedOrientation = "portrait"
    var expectsAudio = false
    var discardOnStop = false
    var stopRequestedBeforeStart = false
    var lifecycleGeneration: UInt64 = 0
    var startWatchdog: DispatchWorkItem?
    var stopWatchdog: DispatchWorkItem?

    let startWatchdogDelay: TimeInterval = 35
    let stopWatchdogDelay: TimeInterval = 15

    var isRecording: Bool {
        sessionQueue.sync {
            movieOutput?.isRecording == true || startCompletion != nil || !stopCompletions.isEmpty
        }
    }

    func start(payload: [String: Any],
               completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            guard self.movieOutput?.isRecording != true,
                  self.startCompletion == nil,
                  self.stopCompletions.isEmpty else {
                self.complete(completion, payload: ["success": false], error: "video_recording_in_progress")
                return
            }
            guard !self.hasBlockingTerminalResult else {
                self.complete(completion, payload: [
                    "success": false,
                    "terminal": false,
                    "error": "video_recording_recovery_required"
                ])
                return
            }
            self.clearNonBlockingTerminalResult()
            self.cleanupSessionOnly()
            self.resetCounters()
            let requestedProjectAtomeId = self.resolveString(
                payload,
                ["projectAtomeId", "project_atome_id", "atomeId", "atome_id"]
            )
            self.projectAtomeId = requestedProjectAtomeId.isEmpty
                ? "video_recording_\(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: ""))"
                : requestedProjectAtomeId
            self.lifecycleGeneration &+= 1
            let generation = self.lifecycleGeneration
            self.startCompletion = completion
            self.scheduleStartWatchdog(generation: generation)
            self.logPermissionsAndDevices()
            let wantsAudio = (payload["audio"] as? Bool) != false
            self.expectsAudio = wantsAudio
            self.requestPermissions(audio: wantsAudio) { granted, reason in
                guard self.lifecycleGeneration == generation,
                      self.startCompletion != nil else { return }
                guard granted else {
                    self.finishEarly(error: reason ?? "media_permission_denied")
                    return
                }
                self.sessionQueue.async {
                    guard self.lifecycleGeneration == generation,
                          self.startCompletion != nil else { return }
                    do {
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
        log("video_start resolved file=\(resolvedName) user=\(userId.isEmpty ? "<none>" : userId) camera=\(cameraPositionName(cameraPosition)) request_path=\(filePath.isEmpty ? "<none>" : filePath) relative=\(sanitizedRelativePath) absolute=\(url.path)")
    }

    private func configureSession(includeAudio: Bool, payload: [String: Any]) throws {
        expectsAudio = includeAudio
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

        if includeAudio {
            guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
                throw NSError(domain: "AppNativeVideoRecorder", code: 4, userInfo: [NSLocalizedDescriptionKey: "microphone_unavailable"])
            }
            logDevice(audioDevice, media: "audio")
            let audioInput = try AVCaptureDeviceInput(device: audioDevice)
            guard session.canAddInput(audioInput) else {
                throw NSError(domain: "AppNativeVideoRecorder", code: 5, userInfo: [NSLocalizedDescriptionKey: "microphone_input_unavailable"])
            }
            session.addInput(audioInput)
        }

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(domain: "AppNativeVideoRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "video_output_unavailable"])
        }
        session.addOutput(movieOutput)

        let previewOutput = previewState.makeOutput(
            orientation: requestedOrientation,
            mirrored: cameraPosition == .front
        )
        guard session.canAddOutput(previewOutput) else {
            previewState.stop()
            throw NSError(domain: "AppNativeVideoRecorder", code: 6, userInfo: [
                NSLocalizedDescriptionKey: "video_preview_output_unavailable"
            ])
        }
        session.addOutput(previewOutput)

        configureConnection(movieOutput.connection(with: .video))
        configureConnection(previewOutput.connection(with: .video))
        session.commitConfiguration()

        self.session = session
        self.movieOutput = movieOutput

        log("session_configured preset=\(session.sessionPreset.rawValue) inputs=\(session.inputs.count) outputs=\(session.outputs.count) theoretical_fps=\(theoreticalFPS) movie_audio_connection=\(movieOutput.connection(with: .audio) != nil) orientation=\(requestedOrientation)")
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
            guard output === self.movieOutput else { return }
            self.cancelStartWatchdog()
            let completion = self.startCompletion
            self.startCompletion = nil
            self.log("video_recording_started file=\(self.fileName ?? fileURL.lastPathComponent) absolute=\(fileURL.path) connections=\(connections.count)")
            if let completion {
                self.complete(completion, payload: [
                    "success": true,
                    "file_name": self.fileName ?? fileURL.lastPathComponent,
                    "file_path": self.relativePath ?? "",
                    "absolute_file_path": fileURL.path,
                    "project_atome_id": self.projectAtomeId ?? "",
                    "camera_position": self.cameraPositionName(self.cameraPosition),
                    "mime_type": "video/quicktime",
                    "preview_source_id": self.previewSourceId,
                    "preview_command": "media_video_preview_frame",
                    "preview_pixel_format": "bgra8",
                    "preview_max_dimension": AppNativeVideoPreviewState.maximumDimension,
                    "preview_max_fps": 15
                ])
            }
            if self.stopRequestedBeforeStart {
                self.requestActiveOutputStop(output)
            }
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput,
                    didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection],
                    error: Error?) {
        sessionQueue.async {
            guard output === self.movieOutput else { return }
            self.cancelStopWatchdog()
            self.log("recording_did_finish file=\(outputFileURL.path) error=\(error?.localizedDescription ?? "<none>")")
            self.inspectAndComplete(fileURL: outputFileURL, error: error)
        }
    }

}

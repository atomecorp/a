//
//  AppNativeVideoRecorderSupport.swift
//  Permissions, sandbox paths, media inspection, orientation, and diagnostics.
//

import AVFoundation

struct AppNativeVideoAssetInspection {
    let duration: Double
    let isReadable: Bool
    let isPlayable: Bool
    let videoTrackCount: Int
    let audioTrackCount: Int
    let width: Int
    let height: Int
    let orientation: String
    let rotationDegrees: Int
    let mirrored: Bool
    let preferredTransform: [String: Double]
    let nominalFPS: Double
    let videoCodecs: [String]
    let audioCodecs: [String]
}

extension AppNativeVideoRecorder {
    func requestPermissions(audio: Bool, _ completion: @escaping (Bool, String?) -> Void) {
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

    func outputURL(fileName: String, filePath: String, userId: String) throws -> (URL, String) {
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

    func videoOrientation(from raw: String) -> AVCaptureVideoOrientation {
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

    func fpsFromDevice(_ device: AVCaptureDevice) -> Double {
        let duration = device.activeVideoMinFrameDuration.seconds
        if duration.isFinite && duration > 0 {
            return 1.0 / duration
        }
        return device.activeFormat.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 0
    }

    func inspectAsset(fileURL: URL) -> AppNativeVideoAssetInspection {
        let asset = AVURLAsset(url: fileURL)
        let durationSeconds = asset.duration.seconds
        let duration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0
        let videoTracks = asset.tracks(withMediaType: .video)
        let audioTracks = asset.tracks(withMediaType: .audio)
        let display = displayMetadata(for: videoTracks.first)
        let nominalFPS = videoTracks
            .map { Double($0.nominalFrameRate) }
            .filter { $0.isFinite && $0 > 0 }
            .max() ?? 0
        return AppNativeVideoAssetInspection(
            duration: duration,
            isReadable: asset.isReadable,
            isPlayable: asset.isPlayable,
            videoTrackCount: videoTracks.count,
            audioTrackCount: audioTracks.count,
            width: display.width,
            height: display.height,
            orientation: display.orientation,
            rotationDegrees: display.rotationDegrees,
            mirrored: display.mirrored,
            preferredTransform: display.transform,
            nominalFPS: nominalFPS,
            videoCodecs: codecs(for: videoTracks),
            audioCodecs: codecs(for: audioTracks)
        )
    }

    private func displayMetadata(for track: AVAssetTrack?) -> (
        width: Int,
        height: Int,
        orientation: String,
        rotationDegrees: Int,
        mirrored: Bool,
        transform: [String: Double]
    ) {
        guard let track else {
            return (0, 0, "unknown", 0, false, [:])
        }
        let transform = track.preferredTransform
        let displayRect = CGRect(origin: .zero, size: track.naturalSize)
            .applying(transform)
            .standardized
        let width = max(0, Int(displayRect.width.rounded()))
        let height = max(0, Int(displayRect.height.rounded()))
        let determinant = (transform.a * transform.d) - (transform.b * transform.c)
        let rotationRadians = determinant < 0
            ? atan2(Double(-transform.c), Double(transform.d))
            : atan2(Double(transform.b), Double(transform.a))
        let rawRotation = rotationRadians * 180.0 / Double.pi
        let normalizedRotation = (rawRotation.truncatingRemainder(dividingBy: 360.0) + 360.0)
            .truncatingRemainder(dividingBy: 360.0)
        let quarterTurns = Int((normalizedRotation / 90.0).rounded()) % 4
        let rotationDegrees = quarterTurns * 90
        let orientation: String
        switch quarterTurns {
        case 1:
            orientation = "portrait"
        case 2:
            orientation = "landscape-left"
        case 3:
            orientation = "portrait-upside-down"
        default:
            orientation = width >= height ? "landscape-right" : "portrait"
        }
        return (
            width,
            height,
            orientation,
            rotationDegrees,
            determinant < 0,
            [
                "a": Double(transform.a),
                "b": Double(transform.b),
                "c": Double(transform.c),
                "d": Double(transform.d),
                "tx": Double(transform.tx),
                "ty": Double(transform.ty)
            ]
        )
    }

    private func codecs(for tracks: [AVAssetTrack]) -> [String] {
        var codecs: [String] = []
        for track in tracks {
            for description in track.formatDescriptions {
                // AVAssetTrack guarantees CMFormatDescription values in this collection.
                let formatDescription = description as! CMFormatDescription
                let subtype = CMFormatDescriptionGetMediaSubType(formatDescription)
                let codec = fourCC(subtype)
                if !codec.isEmpty, !codecs.contains(codec) {
                    codecs.append(codec)
                }
            }
        }
        return codecs
    }

    func logPermissionsAndDevices() {
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

    func logDevice(_ device: AVCaptureDevice, media: String) {
        let format = device.activeFormat
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        let ranges = format.videoSupportedFrameRateRanges.map { "\($0.minFrameRate)-\($0.maxFrameRate)" }.joined(separator: ",")
        let subtype = CMFormatDescriptionGetMediaSubType(format.formatDescription)
        log("\(media)_device name=\(device.localizedName) unique_id=\(device.uniqueID) format_subtype=\(fourCC(subtype)) resolution=\(dimensions.width)x\(dimensions.height) fps_ranges=[\(ranges)] active_min_frame_duration=\(device.activeVideoMinFrameDuration.seconds) active_max_frame_duration=\(device.activeVideoMaxFrameDuration.seconds)")
    }

    private func fourCC(_ value: FourCharCode) -> String {
        let bytes = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff)
        ]
        guard bytes.allSatisfy({ $0 >= 0x20 && $0 <= 0x7e }) else {
            return String(format: "0x%08X", value)
        }
        return String(bytes: bytes, encoding: .ascii) ?? String(format: "0x%08X", value)
    }

    func log(_ message: String) {
        print("[MEDIA_NATIVE_VIDEO] \(message)")
    }
}

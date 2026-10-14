//
//  AppNativeVideoRecorderPreview.swift
//  Bounded latest-frame adapter for the live camera preview.
//
//  The WebView receives JPEG frames (960 px long edge, up to 30 fps) and turns
//  them into a MediaStream that the shared Bevy video route presents as an
//  external texture. Raw 96 px BGRA frames at 15 fps were upscaled to the
//  whole preview: blurry and choppy.
//

import AVFoundation
import CoreImage
import CoreMedia
import QuartzCore
import os.lock

private final class AppNativeVideoPreviewSlot {
    var jpeg = Data()
    var width = 0
    var height = 0
    var sequence: UInt64 = 0
    var timestampSeconds: Double = 0
    var orientation = "portrait"
    var mirrored = false
}

final class AppNativeVideoPreviewState: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    static let maximumDimension = 960
    static let maximumFps = 30
    static let jpegQuality = 0.72
    // A few milliseconds of tolerance: a 30 fps camera keeps every frame instead
    // of dropping the ones that arrive a hair early; 60 fps keeps one in two.
    static let minimumFrameInterval = 1.0 / Double(maximumFps) - 0.004

    private let captureQueue = DispatchQueue(
        label: "atome.app.native_video_preview.capture",
        qos: .userInitiated
    )
    private let conversionQueue = DispatchQueue(
        label: "atome.app.native_video_preview.convert",
        qos: .userInitiated
    )
    private let slots = [
        AppNativeVideoPreviewSlot(),
        AppNativeVideoPreviewSlot(),
        AppNativeVideoPreviewSlot()
    ]
    // GPU-backed encoder shared by every frame of the session.
    private let imageContext = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

    private var stateLock = os_unfair_lock()
    private var active = false
    private var generation: UInt64 = 0
    private var pendingPixelBuffer: CVPixelBuffer?
    private var conversionScheduled = false
    private var lastAcceptedTime: CFTimeInterval = 0
    private var publishedSlot = -1
    private var sequence: UInt64 = 0
    private var orientation = "portrait"
    private var mirrored = false
    private weak var output: AVCaptureVideoDataOutput?

    func makeOutput(orientation: String, mirrored: Bool) -> AVCaptureVideoDataOutput {
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
        ]
        os_unfair_lock_lock(&stateLock)
        generation &+= 1
        active = true
        pendingPixelBuffer = nil
        conversionScheduled = false
        lastAcceptedTime = 0
        publishedSlot = -1
        sequence = 0
        self.orientation = orientation
        self.mirrored = mirrored
        self.output = output
        os_unfair_lock_unlock(&stateLock)
        output.setSampleBufferDelegate(self, queue: captureQueue)
        return output
    }

    func stop() {
        output?.setSampleBufferDelegate(nil, queue: nil)
        os_unfair_lock_lock(&stateLock)
        generation &+= 1
        active = false
        pendingPixelBuffer = nil
        conversionScheduled = false
        lastAcceptedTime = 0
        publishedSlot = -1
        output = nil
        os_unfair_lock_unlock(&stateLock)
    }

    func statusPayload() -> [String: Any] {
        os_unfair_lock_lock(&stateLock)
        let isActive = active
        let isAvailable = isActive && publishedSlot >= 0
        let currentSequence = publishedSlot >= 0 ? slots[publishedSlot].sequence : 0
        os_unfair_lock_unlock(&stateLock)
        return [
            "preview_active": isActive,
            "preview_available": isAvailable,
            "preview_sequence": NSNumber(value: currentSequence),
            "preview_pixel_format": "jpeg",
            "preview_max_dimension": Self.maximumDimension,
            "preview_max_fps": Self.maximumFps
        ]
    }

    func framePayload(sourceId: String) -> [String: Any] {
        os_unfair_lock_lock(&stateLock)
        guard active, publishedSlot >= 0 else {
            os_unfair_lock_unlock(&stateLock)
            return [
                "success": true,
                "available": false,
                "source_id": sourceId
            ]
        }
        let slot = slots[publishedSlot]
        let jpeg = slot.jpeg
        let metadata: [String: Any] = [
            "success": true,
            "available": true,
            "source_id": sourceId,
            "sequence": NSNumber(value: slot.sequence),
            "width": slot.width,
            "height": slot.height,
            "byte_length": jpeg.count,
            "pixel_format": "jpeg",
            "encoding": "base64",
            "timestamp_sec": slot.timestampSeconds,
            "orientation": slot.orientation,
            "mirrored": slot.mirrored
        ]
        os_unfair_lock_unlock(&stateLock)
        var payload = metadata
        payload["bytes_base64"] = jpeg.base64EncodedString()
        return payload
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let mediaTime = CMTimeGetSeconds(presentationTime)
        let now = mediaTime.isFinite && mediaTime >= 0 ? mediaTime : CACurrentMediaTime()
        var shouldSchedule = false
        var acceptedGeneration: UInt64 = 0
        os_unfair_lock_lock(&stateLock)
        if active && (lastAcceptedTime == 0 || now - lastAcceptedTime >= Self.minimumFrameInterval) {
            lastAcceptedTime = now
            pendingPixelBuffer = pixelBuffer
            acceptedGeneration = generation
            if !conversionScheduled {
                conversionScheduled = true
                shouldSchedule = true
            }
        }
        os_unfair_lock_unlock(&stateLock)
        if shouldSchedule {
            conversionQueue.async { [weak self] in
                self?.drainLatestFrame(generation: acceptedGeneration)
            }
        }
    }

    private func drainLatestFrame(generation expectedGeneration: UInt64) {
        while true {
            os_unfair_lock_lock(&stateLock)
            guard active, generation == expectedGeneration else {
                pendingPixelBuffer = nil
                conversionScheduled = false
                os_unfair_lock_unlock(&stateLock)
                return
            }
            guard let pixelBuffer = pendingPixelBuffer else {
                conversionScheduled = false
                os_unfair_lock_unlock(&stateLock)
                return
            }
            pendingPixelBuffer = nil
            os_unfair_lock_unlock(&stateLock)
            convertAndPublish(pixelBuffer, generation: expectedGeneration)
        }
    }

    private func convertAndPublish(_ pixelBuffer: CVPixelBuffer, generation expectedGeneration: UInt64) {
        let sourceWidth = CVPixelBufferGetWidth(pixelBuffer)
        let sourceHeight = CVPixelBufferGetHeight(pixelBuffer)
        guard sourceWidth > 0, sourceHeight > 0 else { return }
        let scale = min(
            1.0,
            Double(Self.maximumDimension) / Double(max(sourceWidth, sourceHeight))
        )
        let width = max(1, Int((Double(sourceWidth) * scale).rounded()))
        let height = max(1, Int((Double(sourceHeight) * scale).rounded()))

        os_unfair_lock_lock(&stateLock)
        guard active, generation == expectedGeneration else {
            os_unfair_lock_unlock(&stateLock)
            return
        }
        let targetSlot = (publishedSlot + 1 + slots.count) % slots.count
        os_unfair_lock_unlock(&stateLock)

        let image = CIImage(cvPixelBuffer: pixelBuffer)
            .transformed(by: CGAffineTransform(scaleX: CGFloat(scale), y: CGFloat(scale)))
        let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        guard let jpeg = imageContext.jpegRepresentation(
            of: image,
            colorSpace: colorSpace,
            options: [quality: Self.jpegQuality]
        ) else { return }

        os_unfair_lock_lock(&stateLock)
        guard active, generation == expectedGeneration else {
            os_unfair_lock_unlock(&stateLock)
            return
        }
        sequence &+= 1
        let slot = slots[targetSlot]
        slot.jpeg = jpeg
        slot.width = width
        slot.height = height
        slot.sequence = sequence
        slot.timestampSeconds = CACurrentMediaTime()
        slot.orientation = orientation
        slot.mirrored = mirrored
        publishedSlot = targetSlot
        os_unfair_lock_unlock(&stateLock)
    }
}

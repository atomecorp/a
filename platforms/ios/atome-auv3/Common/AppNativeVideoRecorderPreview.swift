//
//  AppNativeVideoRecorderPreview.swift
//  Bounded latest-frame adapter for the shared Bevy recording-tool texture.
//

import Accelerate
import AVFoundation
import CoreMedia
import QuartzCore
import os.lock

private final class AppNativeVideoPreviewSlot {
    var bytes = Data(count: AppNativeVideoPreviewState.maximumByteCount)
    var width = 0
    var height = 0
    var byteCount = 0
    var sequence: UInt64 = 0
    var timestampSeconds: Double = 0
    var orientation = "portrait"
    var mirrored = false
}

final class AppNativeVideoPreviewState: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    static let maximumDimension = 96
    static let maximumByteCount = maximumDimension * maximumDimension * 4
    static let minimumFrameInterval = 1.0 / 15.0

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
            "preview_pixel_format": "bgra8",
            "preview_max_dimension": Self.maximumDimension,
            "preview_max_fps": 15
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
        let byteCount = slot.byteCount
        let bytes = Data(slot.bytes.prefix(byteCount))
        let metadata: [String: Any] = [
            "success": true,
            "available": true,
            "source_id": sourceId,
            "sequence": NSNumber(value: slot.sequence),
            "width": slot.width,
            "height": slot.height,
            "byte_length": byteCount,
            "pixel_format": "bgra8",
            "encoding": "base64",
            "timestamp_sec": slot.timestampSeconds,
            "orientation": slot.orientation,
            "mirrored": slot.mirrored
        ]
        os_unfair_lock_unlock(&stateLock)
        var payload = metadata
        payload["bytes_base64"] = bytes.base64EncodedString()
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
            Double(Self.maximumDimension) / Double(sourceWidth),
            Double(Self.maximumDimension) / Double(sourceHeight)
        )
        let width = max(1, min(Self.maximumDimension, Int((Double(sourceWidth) * scale).rounded())))
        let height = max(1, min(Self.maximumDimension, Int((Double(sourceHeight) * scale).rounded())))

        os_unfair_lock_lock(&stateLock)
        guard active, generation == expectedGeneration else {
            os_unfair_lock_unlock(&stateLock)
            return
        }
        let targetSlot = (publishedSlot + 1 + slots.count) % slots.count
        os_unfair_lock_unlock(&stateLock)

        let slot = slots[targetSlot]
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        guard let sourceAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
            return
        }
        var source = vImage_Buffer(
            data: sourceAddress,
            height: vImagePixelCount(sourceHeight),
            width: vImagePixelCount(sourceWidth),
            rowBytes: CVPixelBufferGetBytesPerRow(pixelBuffer)
        )
        let scaleError = slot.bytes.withUnsafeMutableBytes { bytes -> vImage_Error in
            guard let destinationAddress = bytes.baseAddress else { return kvImageNullPointerArgument }
            var destination = vImage_Buffer(
                data: destinationAddress,
                height: vImagePixelCount(height),
                width: vImagePixelCount(width),
                rowBytes: width * 4
            )
            return vImageScale_ARGB8888(
                &source,
                &destination,
                nil,
                vImage_Flags(kvImageHighQualityResampling)
            )
        }
        CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
        guard scaleError == kvImageNoError else { return }

        os_unfair_lock_lock(&stateLock)
        guard active, generation == expectedGeneration else {
            os_unfair_lock_unlock(&stateLock)
            return
        }
        sequence &+= 1
        slot.width = width
        slot.height = height
        slot.byteCount = width * height * 4
        slot.sequence = sequence
        slot.timestampSeconds = CACurrentMediaTime()
        slot.orientation = orientation
        slot.mirrored = mirrored
        publishedSlot = targetSlot
        os_unfair_lock_unlock(&stateLock)
    }
}

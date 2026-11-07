//
//  AppNativeBarcodeScanner.swift
//  In-store barcode reading for food.scan (eVe/domains/media/api/barcode_scan.js).
//  The live camera preview's photo session gains a metadata output for retail
//  codes and a medicine box's GS1 DataMatrix (D24) while a scan runs; JavaScript
//  keeps the codes its caller accepts; the newest code waits to be read once by JavaScript,
//  which polls it like the preview frames. No second camera session is opened.
//  While a scan runs the back camera is set for a code held close (AppNativeBarcodeFocus).
//

import AVFoundation

// A wide camera does not focus nearer than its minimum focus distance (about 20 cm on an
// iPhone Pro): a code brought closer to fill the image stays blurred and is never read. As
// Apple's barcode sample does, the image is zoomed just enough that a code filling part of it
// stands beyond that distance, focus kept continuous and on near subjects; the camera's own
// zoom and focus range are given back when the scan stops (user report, 7 Nov. 2026).
final class AppNativeBarcodeFocus {
    // A retail code about 30 mm wide, filling half the image's width.
    private static let codeWidthMm: Float = 30
    private static let imageFill: Float = 0.5
    private static let maximumZoom: CGFloat = 3

    private var saved: (device: String, zoom: CGFloat, range: AVCaptureDevice.AutoFocusRangeRestriction)?

    static func zoom(for device: AVCaptureDevice) -> CGFloat {
        let minimumFocusMm = Float(device.minimumFocusDistance)
        let halfField = device.activeFormat.videoFieldOfView / 2 * .pi / 180
        guard minimumFocusMm > 0, halfField > 0 else { return 1 }
        let codeDistanceMm = (codeWidthMm / imageFill) / tan(halfField)
        let wanted = CGFloat(minimumFocusMm / codeDistanceMm)
        return min(max(wanted, 1), maximumZoom, device.activeFormat.videoMaxZoomFactor)
    }

    func apply(to device: AVCaptureDevice) {
        guard device.position == .back, (try? device.lockForConfiguration()) != nil else { return }
        defer { device.unlockForConfiguration() }
        if saved?.device != device.uniqueID {
            saved = (device.uniqueID, device.videoZoomFactor, device.autoFocusRangeRestriction)
        }
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
        if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5) }
        device.videoZoomFactor = Self.zoom(for: device)
    }

    func restore(on device: AVCaptureDevice?) {
        guard let saved else { return }
        self.saved = nil
        guard let device, device.uniqueID == saved.device, (try? device.lockForConfiguration()) != nil else { return }
        defer { device.unlockForConfiguration() }
        if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = saved.range }
        device.videoZoomFactor = min(max(saved.zoom, 1), device.activeFormat.videoMaxZoomFactor)
    }
}

final class AppNativeBarcodeReader: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    private let lock = NSLock()
    private var latest: String?
    var output: AVCaptureMetadataOutput?
    let focus = AppNativeBarcodeFocus()

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        let code = metadataObjects
            .compactMap { $0 as? AVMetadataMachineReadableCodeObject }
            .compactMap { object -> String? in
                guard let value = object.stringValue else { return nil }
                if object.type == .dataMatrix { return value }
                return value.range(of: "^[0-9]{8,14}$", options: .regularExpression) != nil ? value : nil
            }
            .first
        guard let code else { return }
        lock.lock(); latest = code; lock.unlock()
    }

    func take() -> String? {
        lock.lock(); defer { latest = nil; lock.unlock() }
        return latest
    }
}

extension AppNativeMediaCaptureController {
    static let barcodeReader = AppNativeBarcodeReader()
    static let barcodeCommands: Set<String> = ["media_barcode_scan_start", "media_barcode_scan_read", "media_barcode_scan_stop"]

    // The camera the preview's photo session reads.
    private static func videoDevice(of session: AVCaptureSession?) -> AVCaptureDevice? {
        session?.inputs
            .compactMap { ($0 as? AVCaptureDeviceInput)?.device }
            .first { $0.hasMediaType(.video) }
    }

    func handleBarcode(command: String, completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "media_barcode_scan_start": startBarcodeScan(completion: completion)
        case "media_barcode_scan_read":
            complete(completion, payload: ["success": true, "barcode": Self.barcodeReader.take() ?? NSNull()])
        default: stopBarcodeScan(completion: completion)
        }
    }

    private func startBarcodeScan(completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            let reader = Self.barcodeReader
            guard self.cameraPreviewActive, let session = self.photoSession else {
                self.complete(completion, payload: ["success": false, "error": "camera_preview_inactive"], error: "camera_preview_inactive")
                return
            }
            if let device = Self.videoDevice(of: session) { reader.focus.apply(to: device) }
            if let current = reader.output, session.outputs.contains(current) {
                _ = reader.take()
                self.complete(completion, payload: ["success": true])
                return
            }
            let output = AVCaptureMetadataOutput()
            session.beginConfiguration()
            guard session.canAddOutput(output) else {
                session.commitConfiguration()
                self.complete(completion, payload: ["success": false, "error": "barcode_output_unavailable"], error: "barcode_output_unavailable")
                return
            }
            session.addOutput(output)
            session.commitConfiguration()
            output.setMetadataObjectsDelegate(reader, queue: self.sessionQueue)
            let retail: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .dataMatrix]
            output.metadataObjectTypes = retail.filter { output.availableMetadataObjectTypes.contains($0) }
            reader.output = output
            _ = reader.take()
            self.complete(completion, payload: ["success": true])
        }
    }

    private func stopBarcodeScan(completion: @escaping ([String: Any], String?) -> Void) {
        sessionQueue.async {
            let reader = Self.barcodeReader
            if let output = reader.output, let session = self.photoSession, session.outputs.contains(output) {
                session.beginConfiguration()
                session.removeOutput(output)
                session.commitConfiguration()
            }
            reader.output = nil
            reader.focus.restore(on: Self.videoDevice(of: self.photoSession))
            _ = reader.take()
            self.complete(completion, payload: ["success": true])
        }
    }
}

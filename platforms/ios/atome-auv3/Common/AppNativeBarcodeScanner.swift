//
//  AppNativeBarcodeScanner.swift
//  In-store barcode reading for food.scan (eVe/domains/media/api/barcode_scan.js).
//  The live camera preview's photo session gains a metadata output for retail
//  codes while a scan runs; the newest code waits to be read once by JavaScript,
//  which polls it like the preview frames. No second camera session is opened.
//

import AVFoundation

final class AppNativeBarcodeReader: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    private let lock = NSLock()
    private var latest: String?
    var output: AVCaptureMetadataOutput?

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        let code = metadataObjects
            .compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
            .first { $0.range(of: "^[0-9]{8,14}$", options: .regularExpression) != nil }
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
            let retail: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce]
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
            _ = reader.take()
            self.complete(completion, payload: ["success": true])
        }
    }
}

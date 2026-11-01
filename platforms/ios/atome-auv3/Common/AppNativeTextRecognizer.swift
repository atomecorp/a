//
//  AppNativeTextRecognizer.swift
//  On-device text recognition of a picture (a received result photographed, a scanned page), for the Health record's
//  result import (eVe/domains/health_record/result_reading.js): Vision's VNRecognizeTextRequest, accurate, French and
//  English, no language correction (a value is read as written), run on this device only — nothing leaves it.
//  `media_text_recognize { base64 }` answers `{ success, runs }`: the recognized runs in reading order — top to bottom, a
//  visual line's runs left to right, its last one marked `eol` — in the picture's pixels from its top-left corner (`y` the
//  run's foot, as a text layer's baseline), each with Vision's confidence (0…1).
//

import Foundation
import ImageIO
import Vision

final class AppNativeTextRecognizer {
    static let shared = AppNativeTextRecognizer()
    private let queue = DispatchQueue(label: "atome.app.text_recognition", qos: .userInitiated)
    private init() {}

    static func canHandle(command: String) -> Bool { command == "media_text_recognize" }

    private struct Run { let text: String; let x: Double; let top: Double; let width: Double; let height: Double; let confidence: Float }

    func handle(command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        let finish: ([String: Any]) -> Void = { result in DispatchQueue.main.async { completion(result, nil) } }
        guard let base64 = payload["base64"] as? String, let data = Data(base64Encoded: base64),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            finish(["success": false, "error": "text_recognition_image_invalid"])
            return
        }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let raw = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
        let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up
        queue.async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["fr-FR", "en-US"]
            do {
                try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
            } catch {
                finish(["success": false, "error": "text_recognition_failed"])
                return
            }
            // The boxes are normalized on the picture as it is shown (its orientation applied), from its bottom-left corner.
            let turned = (5...8).contains(raw)
            let width = Double(turned ? image.height : image.width), height = Double(turned ? image.width : image.height)
            let runs: [Run] = (request.results ?? []).compactMap { observation in
                guard let best = observation.topCandidates(1).first, !best.string.isEmpty else { return nil }
                let box = observation.boundingBox
                return Run(text: best.string, x: Double(box.minX) * width, top: (1 - Double(box.maxY)) * height,
                           width: Double(box.width) * width, height: Double(box.height) * height, confidence: best.confidence)
            }
            finish(["success": true, "runs": Self.readingOrder(runs)])
        }
    }

    /// Lines top to bottom: a run joins the line whose band holds its middle; each line left to right, its last run `eol`.
    private static func readingOrder(_ runs: [Run]) -> [[String: Any]] {
        var lines: [[Run]] = []
        for run in runs.sorted(by: { $0.top < $1.top }) {
            let middle = run.top + run.height / 2
            if let index = lines.lastIndex(where: { line in line.contains { middle >= $0.top && middle <= $0.top + $0.height } }) {
                lines[index].append(run)
            } else {
                lines.append([run])
            }
        }
        return lines.flatMap { line -> [[String: Any]] in
            let ordered = line.sorted { $0.x < $1.x }
            return ordered.enumerated().map { index, run in
                ["text": run.text, "x": run.x, "y": run.top + run.height, "width": run.width, "height": run.height,
                 "confidence": Double(run.confidence), "eol": index == ordered.count - 1]
            }
        }
    }
}

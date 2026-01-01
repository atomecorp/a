import UIKit
import WebKit
import AVFoundation

class AUViewController: UIViewController, WKScriptMessageHandler, UIDocumentPickerDelegate {
    var webView: WKWebView!
    var au: AUv3Interface? // Placeholder protocol to AU parameters

    private enum RecordingState {
        case idle
        case recording
        case stopping
    }

    private var recordingState: RecordingState = .idle
    private var recordingEngine: AVAudioEngine?
    private var recordingFile: AVAudioFile?
    private var recordingConverter: AVAudioConverter?
    private var recordingTargetFormat: AVAudioFormat?
    private var recordingTotalFrames: Int64 = 0
    private var recordingFileName: String?
    
    // Emit an event into JS: both as DOM CustomEvent('clip_ready') and as __fromDSP({type:'clip_ready', payload}) if present
    private func emitClipReady(path: String, clipId: String?) {
        let id = clipId ?? URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        let js = """
        try{ if(typeof window.__fromDSP==='function'){ window.__fromDSP({ type:'clip_ready', payload: { clip_id: '\(id)', path: '\(path)' } }); }
             else { window.dispatchEvent(new CustomEvent('clip_ready', { detail: { clip_id: '\(id)', path: '\(path)' } })); } }catch(e){}
        """
        WebViewManager.evaluateJS(js, label: "clip_ready")
    }

    private func emitRecordingEvent(type: String, payloadJSON: String) {
        let js = """
        try{
          const payload = \(payloadJSON);
          if(typeof window.__fromDSP==='function'){ window.__fromDSP({ type: '\(type)', payload }); }
          window.dispatchEvent(new CustomEvent('iplug_recording', { detail: Object.assign({ type: '\(type)' }, payload) }));
        }catch(e){}
        """
        WebViewManager.evaluateJS(js, label: "iplug_recording")
    }

    private func sanitizeFileName(_ input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let replaced = trimmed.replacingOccurrences(of: "..", with: "_")
        let allowed = replaced.map { ch -> Character in
            if ch.isLetter || ch.isNumber { return ch }
            if ch == "_" || ch == "-" || ch == "." { return ch }
            return "_"
        }
        let name = String(allowed)
        if name.isEmpty { return "mic.wav" }
        if name.lowercased().hasSuffix(".wav") { return name }
        return name + ".wav"
    }

    private func ensureRecordingURL(fileName: String) throws -> URL {
        guard let base = appGroupURL() else {
            throw NSError(domain: "AUViewController", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group container unavailable"])
        }
        let recordingsDir = base.appendingPathComponent("Documents").appendingPathComponent("recordings")
        try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        return recordingsDir.appendingPathComponent(fileName)
    }

    private func startRecording(fileName: String, targetSampleRate: Double?, targetChannels: UInt32?) {
        if recordingState != .idle {
            emitRecordingEvent(type: "record_error", payloadJSON: "{ message: 'Recording already in progress' }")
            return
        }

        let safeName = sanitizeFileName(fileName)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, options: [.defaultToSpeaker, .mixWithOthers])
            try session.setActive(true)

            let engine = AVAudioEngine()
            let input = engine.inputNode
            let inputFormat = input.outputFormat(forBus: 0)
            let sr = targetSampleRate ?? inputFormat.sampleRate
            let ch = AVAudioChannelCount(max(1, min(2, Int(targetChannels ?? UInt32(inputFormat.channelCount)))))
            guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sr, channels: ch, interleaved: false) else {
                throw NSError(domain: "AUViewController", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create target audio format"])
            }

            let url = try ensureRecordingURL(fileName: safeName)
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: sr,
                AVNumberOfChannelsKey: ch,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false
            ]
            let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)

            let converter = AVAudioConverter(from: inputFormat, to: outFormat)
            if converter == nil {
                throw NSError(domain: "AUViewController", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to create audio converter"])
            }

            recordingEngine = engine
            recordingFile = file
            recordingConverter = converter
            recordingTargetFormat = outFormat
            recordingTotalFrames = 0
            recordingFileName = safeName

            input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
                guard let self = self else { return }
                guard self.recordingState == .recording else { return }
                guard let file = self.recordingFile,
                      let converter = self.recordingConverter,
                      let targetFormat = self.recordingTargetFormat else { return }

                let ratio = targetFormat.sampleRate / inputFormat.sampleRate
                let expected = max(1, Int(Double(buffer.frameLength) * ratio) + 16)
                guard let outBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: AVAudioFrameCount(expected)) else { return }

                var didSupply = false
                let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                    if didSupply {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    didSupply = true
                    outStatus.pointee = .haveData
                    return buffer
                }

                var error: NSError?
                converter.convert(to: outBuffer, error: &error, withInputFrom: inputBlock)
                if let error = error {
                    self.recordingState = .stopping
                    self.emitRecordingEvent(type: "record_error", payloadJSON: "{ message: '\(error.localizedDescription.replacingOccurrences(of: "'", with: "\\'"))' }")
                    return
                }

                do {
                    try file.write(from: outBuffer)
                    self.recordingTotalFrames += Int64(outBuffer.frameLength)
                } catch {
                    self.recordingState = .stopping
                    self.emitRecordingEvent(type: "record_error", payloadJSON: "{ message: 'WAV write failed' }")
                }
            }

            try engine.start()
            recordingState = .recording
            emitRecordingEvent(type: "record_started", payloadJSON: "{ fileName: '\(safeName)' }")
        } catch {
            recordingState = .idle
            recordingEngine = nil
            recordingFile = nil
            recordingConverter = nil
            recordingTargetFormat = nil
            recordingTotalFrames = 0
            recordingFileName = nil
            emitRecordingEvent(type: "record_error", payloadJSON: "{ message: '\(String(describing: error).replacingOccurrences(of: "'", with: "\\'"))' }")
        }
    }

    private func stopRecording() {
        if recordingState != .recording {
            emitRecordingEvent(type: "record_error", payloadJSON: "{ message: 'No active recording' }")
            return
        }

        recordingState = .stopping
        let engine = recordingEngine
        let file = recordingFile
        let targetFormat = recordingTargetFormat
        let safeName = recordingFileName

        do {
            engine?.inputNode.removeTap(onBus: 0)
        } catch {
            // Ignore tap removal errors.
        }
        engine?.stop()
        recordingEngine = nil
        recordingConverter = nil
        recordingTargetFormat = nil
        recordingFile = nil
        recordingFileName = nil

        let durationSec: Double
        if let targetFormat = targetFormat {
            durationSec = Double(recordingTotalFrames) / targetFormat.sampleRate
        } else {
            durationSec = 0
        }
        recordingTotalFrames = 0
        recordingState = .idle

        guard let file = file else {
            emitRecordingEvent(type: "record_error", payloadJSON: "{ message: 'Recording file unavailable' }")
            return
        }

        let path = file.url.path
        let payload = "{ path: '\(path.replacingOccurrences(of: "'", with: "\\'"))', fileName: '\(safeName ?? "")', duration_sec: \(durationSec) }"
        emitRecordingEvent(type: "record_done", payloadJSON: payload)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
    let contentController = WKUserContentController()
    contentController.add(self, name: "squirrel")
    contentController.add(self, name: "swiftBridge")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        webView = WKWebView(frame: self.view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        self.view.addSubview(webView)

        // Load local Squirrel UI index from bundle or injected string later
        // Intentionally not loading any HTML here; JS will create DOM elements via Squirrel
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "squirrel" || message.name == "swiftBridge" else { return }
        guard let body = message.body as? [String: Any] else { return }
        guard let type = body["type"] as? String else { return }
        if type == "param" {
            let id = body["id"] as? String ?? ""
            let value = (body["value"] as? NSNumber)?.floatValue ?? 0.0
            switch id {
            case "gain": au?.setParam(.gain, value: value)
            case "play": au?.setParam(.play, value: value)
            case "position": au?.setParam(.positionFrames, value: value)
            default: break
            }
        } else if (type == "loadFile") {
            presentFilePicker()
    } else if (type == "iplug") {
            let action = body["action"] as? String ?? ""
            if action == "loadLocalPath" {
                if let rel = body["relativePath"] as? String, let base = appGroupURL() {
                    // Normalize: allow relative paths like "Recordings/Name.m4a"
                    let full = base.appendingPathComponent("Documents").appendingPathComponent(rel)
                    au?.loadFile(full.path)
                }
            } else if action == "record_start" {
                let fileName = (body["fileName"] as? String) ?? "mic.wav"
                let sr = (body["sampleRate"] as? NSNumber)?.doubleValue
                let ch = (body["channels"] as? NSNumber)?.uint32Value
                startRecording(fileName: fileName, targetSampleRate: sr, targetChannels: ch)
            } else if action == "record_stop" {
                stopRecording()
            }
        }
    }

    func sendMeter(tag: String, level: Float) {
        let js = "window.dispatchEvent(new CustomEvent('meter', { detail: { tag: '" + tag + "', level: " + String(level) + " } }))"
        WebViewManager.evaluateJS(js, label: "meter", priority: .low)
    }
}

protocol AUv3Interface {
    func setParam(_ id: AUParamID, value: Float)
    func loadFile(_ pathInAppGroup: String)
}

enum AUParamID {
    case gain
    case play
    case positionFrames
}

// MARK: - File picker / App Group copy
extension AUViewController {
    func presentFilePicker() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.audio])
        picker.allowsMultipleSelection = false
        picker.delegate = self
        self.present(picker, animated: true, completion: nil)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        if let dest = copyToAppGroupIfNeeded(srcURL: url, relativePath: "Shared/input.wav") {
            au?.loadFile(dest.path)
        }
    }

    func appGroupURL() -> URL? {
        // Try preferred group IDs in order
        let ids = ["group.atome.one", "group.atome.shared"]
        for g in ids {
            if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) { return url }
        }
        return nil
    }

    func copyToAppGroupIfNeeded(srcURL: URL, relativePath: String) -> URL? {
        guard let container = appGroupURL() else { return nil }
        let dst = container.appendingPathComponent(relativePath)
        do {
            try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: dst.path) {
                try FileManager.default.removeItem(at: dst)
            }
            let access = srcURL.startAccessingSecurityScopedResource()
            defer { if access { srcURL.stopAccessingSecurityScopedResource() } }
            try FileManager.default.copyItem(at: srcURL, to: dst)
            return dst
        } catch {
            print("copyToAppGroupIfNeeded error: \(error)")
            return nil
        }
    }
}

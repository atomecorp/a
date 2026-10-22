import AVFoundation
import Foundation
import Speech

/// The app's speech recognition, behind the contract of the desktop STT plugin
/// (`plugin:stt|…` commands, `plugin:stt:*` events) that the voice service already
/// drives: Apple's recognizer fed by this app's own microphone. WebKit's recognition
/// holds the microphone in voice-processing mode, which lowers every sound this app
/// plays (eVe's voice) by about 12 dB, and stays deaf for a while after it restarts.
///
/// One listening keeps the microphone open. A recognition request runs while eVe is
/// silent: a sentence is the words heard since the previous one, ended by a second
/// without a new word. When she speaks the request's audio is closed and it finishes
/// with what it heard; the next one opens when she stops, once the previous has
/// finished. (The on-device recognizer runs one request at a time: a request opened
/// while another finishes hears nothing for about twenty seconds, and a request whose
/// audio pauses for her sentences stops transcribing after the pause.)
final class AppNativeSpeechRecognizer {
    static let shared = AppNativeSpeechRecognizer()
    static func canHandle(_ command: String) -> Bool { command.hasPrefix(prefix) }

    private static let prefix = "plugin:stt|"
    private static let consumerId = "speech"
    /// A sentence ends after this long without a new word.
    private static let sentenceEndSeconds = 1.0
    /// Past this many words a request is renewed between two sentences, so a long
    /// listening (a television in the room) does not grow one transcription forever.
    private static let renewAfterWords = 400
    private static let levelIntervalSeconds = 0.08
    /// `kAFAssistantErrorDomain` 1110: a request heard no speech; 301: it was cancelled.
    private static let silentErrorCodes: Set<Int> = [1110, 301]

    private let queue = DispatchQueue(label: "atome.app.speech")
    private let engine = AVAudioEngine()
    /// The request the input tap feeds (none while eVe speaks) and whether she speaks
    /// (muted); both read by the input thread.
    private let requestLock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var muted = false
    /// The running request's task, until it has finished (its audio may already be closed).
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var recognition = 0
    private var latest: SFSpeechRecognitionResult?
    /// Words of the running transcription already given as sentences.
    private var emittedWords: [String] = []
    private var listening = false
    private var continuous = false
    private var interimResults = true
    /// Phrases this listening expects (the commands it can act on): favoured by the recognizer.
    private var contextualStrings: [String] = []
    /// On-device when asked (no network; answers at once). Apple's server recognizer
    /// hears some isolated words better, but holds its answers back for tens of
    /// seconds in a conversation that pauses while eVe speaks.
    private var onDevice = false
    private var sentenceEnd: DispatchWorkItem?
    private var lastLevelAt: TimeInterval = 0

    func handle(_ command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        switch String(command.dropFirst(Self.prefix.count)) {
        case "check_permission":
            completion(permissions(), nil)
        case "request_permission":
            requestPermissions { completion(self.permissions(), nil) }
        case "is_available":
            completion(["available": SFSpeechRecognizer()?.isAvailable == true], nil)
        case "prepare_model":
            completion(["ready": true], nil)
        case "start_listening":
            let config = payload["config"] as? [String: Any] ?? [:]
            requestPermissions { self.queue.async { self.start(config, completion) } }
        case "stop_listening":
            queue.async { self.stop(); completion(["stopped": true], nil) }
        case "set_muted":
            let muted = payload["muted"] as? Bool == true
            queue.async { self.setMuted(muted); completion(["muted": muted], nil) }
        default:
            completion(["success": false], "unsupported_stt_command")
        }
    }

    private func permissions() -> [String: Any] {
        let microphone: String
        switch AVAudioApplication.shared.recordPermission {
        case .granted: microphone = "granted"
        case .denied: microphone = "denied"
        default: microphone = "prompt"
        }
        let speech: String
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: speech = "granted"
        case .denied, .restricted: speech = "denied"
        default: speech = "prompt"
        }
        return ["microphone": microphone, "speechRecognition": speech]
    }

    /// Asks only what is still undetermined, then continues.
    private func requestPermissions(_ next: @escaping () -> Void) {
        let askMicrophone = {
            guard AVAudioApplication.shared.recordPermission == .undetermined else { next(); return }
            AVAudioApplication.requestRecordPermission { _ in next() }
        }
        guard SFSpeechRecognizer.authorizationStatus() == .notDetermined else { askMicrophone(); return }
        SFSpeechRecognizer.requestAuthorization { _ in askMicrophone() }
    }

    private func start(_ config: [String: Any], _ completion: @escaping ([String: Any], String?) -> Void) {
        guard !listening else { completion(["success": false], "already listening"); return }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              AVAudioApplication.shared.recordPermission == .granted else {
            completion(["success": false], "permission_denied"); return
        }
        let language = config["language"] as? String ?? "fr-FR"
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.isAvailable else {
            completion(["success": false], "speech_recognizer_unavailable"); return
        }
        self.recognizer = recognizer
        continuous = config["continuous"] as? Bool ?? false
        interimResults = config["interimResults"] as? Bool ?? true
        contextualStrings = config["contextualStrings"] as? [String] ?? []
        onDevice = config["onDevice"] as? Bool == true
        do {
            let audio = AppNativeAudioController.shared
            try audio.queue.sync { try audio.acquireAudioSessionConsumer(Self.consumerId, kind: .musicCapture) }
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { [weak self] buffer, _ in
                self?.receive(buffer)
            }
            engine.prepare()
            try engine.start()
        } catch {
            releaseMicrophone()
            completion(["success": false], error.localizedDescription)
            return
        }
        listening = true
        requestLock.lock(); muted = false; requestLock.unlock()
        beginRecognition()
        emit("plugin:stt:stateChange", ["state": "listening"])
        completion(["started": true], nil)
    }

    /// The request of the whole listening, on the microphone that keeps running.
    private func beginRecognition() {
        guard let recognizer else { return }
        recognition += 1
        let number = recognition
        let next = SFSpeechAudioBufferRecognitionRequest()
        next.shouldReportPartialResults = true
        next.contextualStrings = contextualStrings
        next.requiresOnDeviceRecognition = onDevice && recognizer.supportsOnDeviceRecognition
        requestLock.lock(); request = next; requestLock.unlock()
        latest = nil; emittedWords = []
        task = recognizer.recognitionTask(with: next) { [weak self] result, error in
            self?.queue.async { self?.receive(result, error, recognition: number) }
        }
    }

    /// The words of `result` heard since the last sentence. The on-device recognizer
    /// starts a new transcription after a pause: one that does not begin with the words
    /// already given is a new sentence, whole.
    private func pendingWords(_ result: SFSpeechRecognitionResult) -> String {
        let words = result.bestTranscription.segments.map(\.substring)
        let continues = words.count >= emittedWords.count && Array(words.prefix(emittedWords.count)) == emittedWords
        return (continues ? Array(words.dropFirst(emittedWords.count)) : words).joined(separator: " ")
    }

    private func receive(_ result: SFSpeechRecognitionResult?, _ error: Error?, recognition number: Int) {
        guard listening, number == recognition else { return }
        if let result {
            latest = result
            AppNativeAudioDiagnostics.log("speech result final=\(result.isFinal) text=\(result.bestTranscription.formattedString) emitted=\(emittedWords.count)")
            if result.isFinal { requestFinished(); return }
            let words = pendingWords(result)
            guard !words.isEmpty else { return }
            if interimResults { emitSentence(words, isFinal: false) }
            // A sentence never ends on an elision (« C' », « l' »): its word is still coming.
            if words.hasSuffix("'") || words.hasSuffix("’") { sentenceEnd?.cancel(); sentenceEnd = nil } else { scheduleSentenceEnd() }
            return
        }
        guard let error = error as NSError? else { return }
        // A request that heard nothing more: the microphone keeps listening.
        if Self.silentErrorCodes.contains(error.code) { requestFinished(); return }
        emit("plugin:stt:error", ["message": error.localizedDescription, "code": String(error.code)])
        stop()
    }

    /// While eVe speaks the microphone stays open but feeds no request: hers is closed,
    /// and the next opens when she stops (or when the closed one has finished).
    private func setMuted(_ next: Bool) {
        guard listening else { return }
        requestLock.lock(); let changed = muted != next; muted = next; requestLock.unlock()
        AppNativeAudioDiagnostics.log("speech muted=\(next)")
        guard changed else { return }
        if next { closeRequest() } else if task == nil { beginRecognition() }
    }

    /// Closes the running request's audio: it finishes with what it heard (`requestFinished`).
    private func closeRequest() {
        sentenceEnd?.cancel(); sentenceEnd = nil
        requestLock.lock(); request?.endAudio(); request = nil; requestLock.unlock()
    }

    /// The request ended: its last words make a sentence, and the next request opens
    /// now, or when eVe stops speaking.
    private func requestFinished() {
        endSentence()
        guard listening else { return }
        task = nil
        requestLock.lock(); request = nil; requestLock.unlock()
        if !muted { beginRecognition() }
    }

    private func scheduleSentenceEnd() {
        sentenceEnd?.cancel()
        let number = recognition
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.listening, number == self.recognition else { return }
            self.endSentence()
            if self.listening, self.emittedWords.count >= Self.renewAfterWords { self.closeRequest() }
        }
        sentenceEnd = work
        queue.asyncAfter(deadline: .now() + Self.sentenceEndSeconds, execute: work)
    }

    /// The words heard since the last sentence make one; a listening that wanted a
    /// single sentence ends with it.
    private func endSentence() {
        sentenceEnd?.cancel(); sentenceEnd = nil
        if let latest {
            let words = pendingWords(latest)
            emittedWords = latest.bestTranscription.segments.map(\.substring)
            if !words.isEmpty { emitSentence(words, isFinal: true) }
        }
        if !continuous { stop() }
    }

    private func stop() {
        guard listening else { return }
        listening = false
        recognition += 1
        sentenceEnd?.cancel(); sentenceEnd = nil
        task?.cancel(); task = nil
        requestLock.lock(); request?.endAudio(); request = nil; requestLock.unlock()
        releaseMicrophone()
        emit("plugin:stt:stateChange", ["state": "idle"])
    }

    private func releaseMicrophone() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        let audio = AppNativeAudioController.shared
        audio.queue.async { audio.releaseAudioSessionConsumer(Self.consumerId) }
    }

    /// Input thread: feeds the running request and measures the level (neither while muted).
    private func receive(_ buffer: AVAudioPCMBuffer) {
        requestLock.lock(); let current = request, silent = muted; requestLock.unlock()
        guard !silent else { return }
        current?.append(buffer)
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
        let count = Int(buffer.frameLength)
        var energy: Float = 0
        for index in 0..<count { energy += samples[index] * samples[index] }
        let rms = Double(sqrt(energy / Float(count)))
        queue.async { self.publishLevel(rms) }
    }

    private func publishLevel(_ rms: Double) {
        let now = ProcessInfo.processInfo.systemUptime
        guard listening, now - lastLevelAt >= Self.levelIntervalSeconds else { return }
        lastLevelAt = now
        emit("plugin:stt:audioLevel", ["rms": rms])
    }

    private func emitSentence(_ words: String, isFinal: Bool) {
        emit("plugin:stt:result", ["transcript": words, "isFinal": isFinal,
                                   "alternatives": [["transcript": words, "confidence": 0.0]]])
    }

    private func emit(_ name: String, _ detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        WebViewManager.evaluateJS("window.dispatchEvent(new CustomEvent('\(name)',{detail:\(json)}));",
                                  label: "app.stt", priority: .high)
    }
}

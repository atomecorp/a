import AVFoundation
import Foundation

/// The person's own alarm sounds (an mp3, the sound of an mp4: eVe/intuition/tools/calendar_alarm_sound.js).
///
/// AlarmKit (`AlertSound.named`) and the notification fallback (`UNNotificationSound(named:)`) play a sound
/// by its file name from the app bundle or from `Library/Sounds`, as linear PCM `.caf` of 30 s at most. The
/// page gives each sound once, under the name its alarms carry (`alarm_media_…`): it is converted here into
/// `Library/Sounds/<name>.caf`, its first 30 s, so NativeCalendarAlarm rings it exactly like a built-in one.
final class NativeAlarmSounds {
    static let shared = NativeAlarmSounds()

    private static let maxSeconds = 30.0
    private static let namePattern = try! NSRegularExpression(pattern: "^alarm_media_[A-Za-z0-9_]{1,80}$")
    private static let extensionPattern = try! NSRegularExpression(pattern: "^[a-z0-9]{2,5}$")

    private init() {}

    static func canHandle(command: String) -> Bool {
        command == "calendar_alarm_sound_has" || command == "calendar_alarm_sound_store"
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        Task.detached(priority: .userInitiated) {
            let reply: [String: Any]
            do {
                reply = command == "calendar_alarm_sound_has"
                    ? try Self.has(names: payload["names"] as? [String] ?? [])
                    : try await Self.store(payload: payload)
            } catch {
                reply = ["ok": false, "error": (error as? SoundError)?.code ?? "alarm_sound_store_failed"]
            }
            DispatchQueue.main.async { completion(reply, nil) }
        }
    }

    private struct SoundError: Error { let code: String }

    private static func matches(_ pattern: NSRegularExpression, _ value: String) -> Bool {
        pattern.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
    }

    private static func soundsDirectory() throws -> URL {
        let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let sounds = library.appendingPathComponent("Sounds", isDirectory: true)
        try FileManager.default.createDirectory(at: sounds, withIntermediateDirectories: true)
        return sounds
    }

    private static func has(names: [String]) throws -> [String: Any] {
        let sounds = try soundsDirectory()
        let held = names.filter { matches(namePattern, $0) && FileManager.default.fileExists(atPath: sounds.appendingPathComponent("\($0).caf").path) }
        return ["ok": true, "names": held]
    }

    private static func store(payload: [String: Any]) async throws -> [String: Any] {
        guard let name = payload["name"] as? String, matches(namePattern, name) else { throw SoundError(code: "alarm_sound_name_invalid") }
        guard let ext = (payload["extension"] as? String)?.lowercased(), matches(extensionPattern, ext) else { throw SoundError(code: "alarm_sound_kind_invalid") }
        guard let base64 = payload["data"] as? String, let data = Data(base64Encoded: base64), !data.isEmpty else { throw SoundError(code: "alarm_sound_data_invalid") }
        let source = FileManager.default.temporaryDirectory.appendingPathComponent("\(name)_\(UUID().uuidString).\(ext)")
        let target = try soundsDirectory().appendingPathComponent("\(name).caf")
        let partial = target.deletingLastPathComponent().appendingPathComponent("\(name).partial.caf")
        defer {
            try? FileManager.default.removeItem(at: source)
            try? FileManager.default.removeItem(at: partial)
        }
        try data.write(to: source)
        try await convert(source: source, to: partial)
        if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
        try FileManager.default.moveItem(at: partial, to: target)
        return ["ok": true, "name": name]
    }

    /// The first 30 s of the file's sound, as 16-bit interleaved linear PCM `.caf`.
    private static func convert(source: URL, to target: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .audio).first else { throw SoundError(code: "alarm_sound_without_audio") }
        let duration = try await asset.load(.duration)
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 2,
                                       AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
                                       AVLinearPCMIsNonInterleaved: false]
        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: .zero, duration: CMTimeMinimum(duration, CMTime(seconds: maxSeconds, preferredTimescale: 600)))
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
        guard reader.canAdd(output) else { throw SoundError(code: "alarm_sound_unreadable") }
        reader.add(output)
        if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
        let writer = try AVAssetWriter(outputURL: target, fileType: .caf)
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
        guard writer.canAdd(input) else { throw SoundError(code: "alarm_sound_unwritable") }
        writer.add(input)
        guard reader.startReading(), writer.startWriting() else { throw SoundError(code: "alarm_sound_unreadable") }
        writer.startSession(atSourceTime: .zero)
        while let buffer = output.copyNextSampleBuffer() {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
            guard input.append(buffer) else { throw SoundError(code: "alarm_sound_unwritable") }
        }
        input.markAsFinished()
        guard reader.status == .completed else { throw SoundError(code: "alarm_sound_unreadable") }
        await writer.finishWriting()
        guard writer.status == .completed else { throw SoundError(code: "alarm_sound_unwritable") }
    }
}

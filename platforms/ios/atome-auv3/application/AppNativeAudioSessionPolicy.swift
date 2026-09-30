import AVFoundation
import Foundation

/// Roles that may hold the standalone application audio session.
///
/// The AUv3 extension never uses this policy: its host owns the session, the
/// category, and the routing, so no file under `auv3/` configures
/// `AVAudioSession` for capture.
enum AppNativeAudioConsumerKind: String {
    /// Playback only. Requires no microphone and must never request one.
    case playback
    /// Musical or sound capture. Keeps the best available musical output.
    case musicCapture
    /// Two-way voice. Voice processing is reserved for this role; no product
    /// surface uses it yet in the standalone application.
    case communicationCapture
}

/// One consumer currently holding the application audio session.
struct AppNativeAudioConsumer: Equatable {
    let kind: AppNativeAudioConsumerKind
    /// Explicit selection of a Bluetooth input device. Never implied.
    let prefersBluetoothMicrophone: Bool
}

/// The session configuration required by the current set of consumers.
struct AppNativeAudioSessionPlan: Equatable {
    let category: AVAudioSession.Category
    let mode: AVAudioSession.Mode
    let options: AVAudioSession.CategoryOptions
    /// Stable English label explaining the transition; diagnostics only.
    let reason: String
}

/// Pure owner of "who needs audio, and does it need the microphone".
///
/// The policy is deliberately free of `AVAudioSession` side effects so its
/// transitions stay testable; `AppNativeAudioSessionCoordinator` applies the
/// plan to the shared session.
struct AppNativeAudioConsumerRegistry {
    private(set) var consumers: [String: AppNativeAudioConsumer] = [:]

    mutating func acquire(_ consumerId: String,
                          kind: AppNativeAudioConsumerKind,
                          prefersBluetoothMicrophone: Bool = false) {
        consumers[consumerId] = AppNativeAudioConsumer(
            kind: kind,
            prefersBluetoothMicrophone: prefersBluetoothMicrophone
        )
    }

    @discardableResult
    mutating func release(_ consumerId: String) -> Bool {
        consumers.removeValue(forKey: consumerId) != nil
    }

    mutating func releaseAll() {
        consumers.removeAll()
    }

    /// Capture consumers only; playback never owns the microphone.
    var captureConsumerIds: [String] {
        consumers.compactMap { entry in
            entry.value.kind == .playback ? nil : entry.key
        }.sorted()
    }

    var requiresMicrophone: Bool {
        consumers.values.contains { $0.kind != .playback }
    }

    var plan: AppNativeAudioSessionPlan {
        Self.plan(for: consumers)
    }

    /// Session rules, in priority order:
    /// 1. voice keeps its telephony profile, because voice processing belongs
    ///    to communication and never to music;
    /// 2. musical capture records through the local (built-in or wired) input
    ///    and keeps the musical Bluetooth output (A2DP) available, so a
    ///    connected headset is never silently turned into a degraded
    ///    microphone; only an explicitly selected Bluetooth input offers HFP,
    ///    with full-bandwidth capture when the OS and the device support it;
    /// 3. playback never carries an input route.
    static func plan(for consumers: [String: AppNativeAudioConsumer]) -> AppNativeAudioSessionPlan {
        if consumers.values.contains(where: { $0.kind == .communicationCapture }) {
            return AppNativeAudioSessionPlan(
                category: .playAndRecord,
                mode: .voiceChat,
                options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothHFP],
                reason: "communication_capture"
            )
        }
        if consumers.values.contains(where: { $0.kind == .musicCapture }) {
            let wantsBluetoothMicrophone = consumers.values.contains {
                $0.kind == .musicCapture && $0.prefersBluetoothMicrophone
            }
            var options: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker]
            if wantsBluetoothMicrophone {
                options.insert(.allowBluetoothHFP)
                if #available(iOS 26.0, *) {
                    // Documented as compatible with the default mode only, and
                    // as increasing input latency, so it stays out of the
                    // communication profile. It is ignored when the route does
                    // not support it; the negotiated route is logged.
                    options.insert(.bluetoothHighQualityRecording)
                }
                return AppNativeAudioSessionPlan(
                    category: .playAndRecord,
                    mode: .default,
                    options: options,
                    reason: "music_capture_bluetooth_input"
                )
            }
            options.insert(.allowBluetoothA2DP)
            return AppNativeAudioSessionPlan(
                category: .playAndRecord,
                mode: .default,
                options: options,
                reason: "music_capture_local_input"
            )
        }
        return AppNativeAudioSessionPlan(
            category: .playback,
            mode: .default,
            options: [.mixWithOthers],
            reason: "playback"
        )
    }
}

/// Guards an asynchronous capture acquisition (microphone permission) against
/// a later cancellation: a token only activates if nothing cancelled the
/// request while it was pending.
struct AppNativeAudioCaptureGate {
    private var generation: UInt64 = 0

    mutating func begin() -> UInt64 {
        generation &+= 1
        return generation
    }

    mutating func cancel() {
        generation &+= 1
    }

    func accepts(_ token: UInt64) -> Bool {
        token == generation
    }
}

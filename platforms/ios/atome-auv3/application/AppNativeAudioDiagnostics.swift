import Foundation

/// Gated diagnostic channel for the standalone application audio session.
///
/// Disabled by default; set `ATOME_APP_AUDIO_DIAGNOSTICS=1` in a debug build to
/// receive the session category, mode, options, routes, negotiated formats and
/// active microphone consumers on stderr. The same switch turns on the page's voice traces
/// (`[voice-trace]`, `window.__EVE_VOICE_DIAGNOSTICS__`, AppPageHost), so one launch shows the assistant end to end.
enum AppNativeAudioDiagnostics {
#if DEBUG
    static let enabled = ProcessInfo.processInfo.environment["ATOME_APP_AUDIO_DIAGNOSTICS"] == "1"
#else
    static let enabled = false
#endif

    static func log(_ message: @autoclosure () -> String) {
        guard enabled else { return }
        fputs("[APP_AUDIO] " + message() + "\n", stderr)
    }
}

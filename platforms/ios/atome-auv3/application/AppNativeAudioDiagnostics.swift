import Foundation

/// Gated diagnostic channel for the standalone application audio session.
///
/// Disabled by default; set `ATOME_APP_AUDIO_DIAGNOSTICS=1` in a debug build to
/// receive the session category, mode, options, routes, negotiated formats and
/// active microphone consumers on stderr.
enum AppNativeAudioDiagnostics {
#if DEBUG
    private static let enabled = ProcessInfo.processInfo.environment["ATOME_APP_AUDIO_DIAGNOSTICS"] == "1"
#else
    private static let enabled = false
#endif

    static func log(_ message: @autoclosure () -> String) {
        guard enabled else { return }
        fputs("[APP_AUDIO] " + message() + "\n", stderr)
    }
}

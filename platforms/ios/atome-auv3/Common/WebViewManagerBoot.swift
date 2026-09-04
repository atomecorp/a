import Foundation
import QuartzCore
import Darwin

final class BootStallWatchdog {
    private let coldWebKitGrace: TimeInterval = 20
    private let activeBootStallLimit: TimeInterval = 8
    private var workItem: DispatchWorkItem?
    private var active = false
    private var navigationStarted = false

    func start(onStall: @escaping () -> Void) {
        dispatchPrecondition(condition: .onQueue(.main))
        active = true
        navigationStarted = false
        schedule(after: coldWebKitGrace, onStall: onStall)
    }

    func noteProgress(_ milestone: String, onStall: @escaping () -> Void) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard active else { return }
        if milestone == "navigation_started" {
            navigationStarted = true
        }
        schedule(
            after: navigationStarted ? activeBootStallLimit : coldWebKitGrace,
            onStall: onStall
        )
    }

    func cancel() {
        dispatchPrecondition(condition: .onQueue(.main))
        active = false
        workItem?.cancel()
        workItem = nil
    }

    private func schedule(after interval: TimeInterval, onStall: @escaping () -> Void) {
        workItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.active else { return }
            self.active = false
            self.workItem = nil
            onStall()
        }
        workItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + interval, execute: work)
    }
}

extension WebViewManager {
    static func resetBootTelemetry() {
        dispatchPrecondition(condition: .onQueue(.main))
        bootWatchdog.cancel()
        bootStartedAt = CACurrentMediaTime()
        bootMilestones = [:]
        bootTerminalFailure = false
        AudioSchemeHandler.resetBootMetrics()
    }

    static func startBootWatchdog() {
        bootWatchdog.start { reportBootFailure(reason: "boot_stalled") }
    }

    static func markBootMilestone(_ name: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        bootMilestones[name] = Int((CACurrentMediaTime() - bootStartedAt) * 1_000)
        bootWatchdog.noteProgress(name) { reportBootFailure(reason: "boot_stalled") }
    }

    static func nativePeakMemoryMegabytes() -> Int? {
        var usage = rusage()
        guard getrusage(RUSAGE_SELF, &usage) == 0 else { return nil }
        return Int(usage.ru_maxrss / (1_024 * 1_024))
    }

    static func attachNativeBootSummary(to report: inout [String: Any]) {
        report["native_elapsed_ms"] = Int((CACurrentMediaTime() - bootStartedAt) * 1_000)
        report["native_milestones_ms"] = bootMilestones
        report["scheme"] = AudioSchemeHandler.bootMetrics()
        if let peakMemory = nativePeakMemoryMegabytes() {
            report["native_peak_memory_mb"] = peakMemory
        }
    }

    // One compact line per launch carrying exactly what the device campaign has to
    // report: outcome, elapsed time, served resources, bytes, native peak memory and
    // the last milestone reached. The full dictionaries stay above it for detail.
    static func bootSummaryLine(_ outcome: String, report: [String: Any]) -> String {
        let scheme = report["scheme"] as? [String: Any]
        let milestones = report["native_milestones_ms"] as? [String: Int] ?? [:]
        let last = milestones.max { lhs, rhs in
            lhs.value == rhs.value ? lhs.key > rhs.key : lhs.value < rhs.value
        }
        let fields: [String] = [
            "outcome=\(outcome)",
            "reason=\(report["reason"] as? String ?? "-")",
            "elapsed_ms=\(report["native_elapsed_ms"] as? Int ?? -1)",
            "requests=\(scheme?["request_count"] as? Int ?? -1)",
            "bytes=\(scheme?["byte_count"] as? Int ?? -1)",
            "missing=\(scheme?["missing_count"] as? Int ?? -1)",
            "native_peak_mb=\(report["native_peak_memory_mb"] as? Int ?? -1)",
            "wasm_heap_mb=\(milestones.keys.filter { $0.contains("wasm_heap") }.compactMap { Int($0.split(separator: ".").last ?? "") }.max().map(String.init) ?? "-")",
            "last_milestone=\(last?.key ?? "-")@\(last?.value ?? -1)"
        ]
        return "[BOOT_SUMMARY] " + fields.joined(separator: " ")
    }

    static func installBootPresentationHandlers(
        onReady: @escaping ([String: Any]) -> Void,
        onFailure: @escaping (String, [String: Any]) -> Void
    ) {
        bootPresentationHandler = onReady
        bootFailureHandler = onFailure
    }

    static func handleBootPresentationReady(_ body: [String: Any]) {
        guard !bootTerminalFailure else {
            shared.log.error("Ignoring late boot presentation after terminal failure")
            return
        }
        bootWatchdog.cancel()
        var report = body
        markBootMilestone("presentation_ready")
        attachNativeBootSummary(to: &report)
        shared.log.info("Boot presentation ready: \(String(describing: report), privacy: .public)")
        print(bootSummaryLine("presentation_ready", report: report))
        print("[BOOT_PRESENTATION] \(String(describing: report))")
        DispatchQueue.main.async { bootPresentationHandler?(report) }
    }

    static func handleBootAuthenticationReady(_ body: [String: Any]) {
        guard !bootTerminalFailure else {
            shared.log.error("Ignoring late authentication presentation after terminal failure")
            return
        }
        bootWatchdog.cancel()
        var report = body
        markBootMilestone("authentication_ready")
        attachNativeBootSummary(to: &report)
        shared.log.info("Boot authentication ready: \(String(describing: report), privacy: .public)")
        print(bootSummaryLine("authentication_ready", report: report))
        print("[BOOT_AUTHENTICATION] \(String(describing: report))")
        DispatchQueue.main.async { bootPresentationHandler?(report) }
    }

    static func reportBootFailure(reason: String) {
        guard !bootTerminalFailure else { return }
        bootWatchdog.cancel()
        bootTerminalFailure = true
        var report: [String: Any] = ["reason": reason]
        attachNativeBootSummary(to: &report)
        shared.log.error("Boot failed: \(String(describing: report), privacy: .public)")
        print(bootSummaryLine("failure", report: report))
        print("[BOOT_FAILURE] \(String(describing: report))")
        captureBootJavaScriptDiagnostics(reason: reason)
        DispatchQueue.main.async { bootFailureHandler?(reason, report) }
    }

    private static func captureBootJavaScriptDiagnostics(reason: String) {
        let script = """
        (function(){
          try {
            var menu = null;
            try { menu = window.new_menu_v2 && window.new_menu_v2.measure ? window.new_menu_v2.measure() : null; } catch (_) {}
            return {
              reason: \(String(reflecting: reason)),
              href: String(location.href || ''),
              ready_state: String(document.readyState || ''),
              auth_complete: window.__authCheckComplete === true,
              auth_result: window.__authCheckResult || null,
              workspace_mode: window.__eveWorkspaceMode || null,
              workspace_error: window.__eveWorkspaceBootOpenError || null,
              workspace_trace: window.__eveWorkspaceBootTrace || [],
              current_project_id: String(window.__currentProject && (window.__currentProject.id || window.__currentProject.atome_id) || ''),
              menu: menu
            };
          } catch (error) { return { diagnostic_error: String(error && error.message || error) }; }
        })();
        """
        webView?.evaluateJavaScript(script) { value, error in
            if let error {
                shared.log.error("Boot JS diagnostic failed: \(error.localizedDescription, privacy: .public)")
            } else {
                shared.log.error("Boot JS diagnostic: \(String(describing: value), privacy: .public)")
                print("[BOOT_DIAGNOSTIC] \(String(describing: value))")
            }
        }
    }
}

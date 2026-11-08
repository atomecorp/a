import Foundation
import QuartzCore
import Darwin

// A restore under way while the home awaits the account's profile: the share already here and the
// gauge's look, both given by the page (its text and its tokens; mockup validated 8 Nov. 2026).
struct BootRestoreProgress {
    let fraction: Double
    let label: String
    let ground: [Double]
    let accent: [Double]
    let fillDarken: Double
    let radius: Double
    let width: Double
    let height: Double
    // The ground's inner shadow: its colour (rgba), blur and vertical offset.
    let insetColor: [Double]
    let insetBlur: Double
    let insetOffset: Double

    init?(_ body: [String: Any]) {
        let numbers = { (key: String) in (body[key] as? [NSNumber])?.map(\.doubleValue) ?? [] }
        guard let fraction = (body["fraction"] as? NSNumber)?.doubleValue, (0...1).contains(fraction),
              let label = body["label"] as? String, !label.isEmpty,
              let fillDarken = (body["fillDarken"] as? NSNumber)?.doubleValue,
              let radius = (body["radius"] as? NSNumber)?.doubleValue,
              let width = (body["width"] as? NSNumber)?.doubleValue, width > 0,
              let height = (body["height"] as? NSNumber)?.doubleValue, height > 0 else { return nil }
        let ground = numbers("ground"), accent = numbers("accent")
        let inset = body["groundInset"] as? [String: Any]
        let insetColor = (inset?["color"] as? [NSNumber])?.map(\.doubleValue) ?? []
        let insetOffset = (inset?["offset"] as? [NSNumber])?.map(\.doubleValue) ?? []
        guard ground.count == 4, accent.count == 4, insetColor.count == 4, insetOffset.count == 2,
              let insetBlur = (inset?["blur"] as? NSNumber)?.doubleValue else { return nil }
        self.fraction = fraction
        self.label = String(label.prefix(120))
        self.ground = ground
        self.accent = accent
        self.fillDarken = fillDarken
        self.radius = radius
        self.width = width
        self.height = height
        self.insetColor = insetColor
        self.insetBlur = insetBlur
        self.insetOffset = insetOffset[1]
    }
}

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

    // The page can outlive a window (CarPlay boots it windowless): a window that
    // attaches after the presentation must neither wait for it nor report a stall.
    static var bootPresented: Bool {
        bootMilestones["presentation_ready"] != nil || bootMilestones["authentication_ready"] != nil
    }

    static func startBootWatchdog() {
        guard !bootPresented else { return }
        bootWatchdog.start { reportBootStall() }
    }

    static func markBootMilestone(_ name: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        bootMilestones[name] = Int((CACurrentMediaTime() - bootStartedAt) * 1_000)
        bootWatchdog.noteProgress(name) { reportBootStall() }
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
            // `byte_count` is stored as `Int64`; casting it straight to `Int`
            // through `Any` fails and silently reports `-1`, so bridge via NSNumber.
            "requests=\((scheme?["request_count"] as? NSNumber)?.intValue ?? -1)",
            "bytes=\((scheme?["byte_count"] as? NSNumber)?.intValue ?? -1)",
            "missing=\((scheme?["missing_count"] as? NSNumber)?.intValue ?? -1)",
            "native_peak_mb=\(report["native_peak_memory_mb"] as? Int ?? -1)",
            "wasm_heap_mb=\(milestones.keys.filter { $0.contains("wasm_heap") }.compactMap { Int($0.split(separator: ".").last ?? "") }.max().map(String.init) ?? "-")",
            "last_milestone=\(last?.key ?? "-")@\(last?.value ?? -1)"
        ]
        return "[BOOT_SUMMARY] " + fields.joined(separator: " ")
    }

    static func installBootPresentationHandlers(
        onReady: @escaping ([String: Any]) -> Void,
        onFailure: @escaping (String, [String: Any]) -> Void,
        onRestart: @escaping () -> Void,
        onRestore: @escaping (BootRestoreProgress) -> Void
    ) {
        bootRestoreHandler = onRestore
        bootPresentationHandler = onReady
        bootFailureHandler = onFailure
        bootRestartHandler = onRestart
        if bootPresented { DispatchQueue.main.async { onReady([:]) } }
    }

    // Boots the main page again: a retry the user asked for after a failure, or a
    // presented page the system terminated.
    static func reloadMainPage(reason: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let webView else { return }
        webView.stopLoading()
        mainLoadTimer?.invalidate()
        mainLoadTimer = nil
        mainLoadDone = false
        resetBootTelemetry()
        if FeatureFlags.startLocalHTTPServer { LocalServer.shared.start() }
        bootRestartHandler?()
        startBootWatchdog()
        markBootMilestone(reason)
        markPageLoading()
        if FeatureFlags.registerCustomScheme, let entry = URL(string: "atome:///src/index.html") {
            markBootMilestone("navigation_requested")
            webView.load(URLRequest(url: entry))
            mainLoadDone = true
        } else if let entry = Bundle.main.url(forResource: "src/index", withExtension: "html") {
            markBootMilestone("navigation_requested")
            webView.loadFileURL(entry, allowingReadAccessTo: Bundle.main.bundleURL)
            mainLoadDone = true
        }
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

    // A restore that advances is a boot at work: the watchdog waits again, and the cover reads it.
    static func handleBootRestoreProgress(_ progress: BootRestoreProgress) {
        guard !bootTerminalFailure, !bootPresented else { return }
        markBootMilestone("restore_progress")
        DispatchQueue.main.async { bootRestoreHandler?(progress) }
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

    static func reportBootStall() {
        guard !bootTerminalFailure else { return }
        bootWatchdog.cancel()
        var report: [String: Any] = ["reason": "boot_stalled"]
        attachNativeBootSummary(to: &report)
        shared.log.warning("Boot is still pending: \(String(describing: report), privacy: .public)")
        print(bootSummaryLine("warning", report: report))
        print("[BOOT_WARNING] \(String(describing: report))")
        captureBootJavaScriptDiagnostics(reason: "boot_stalled")
        DispatchQueue.main.async { bootFailureHandler?("boot_stalled", report) }
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

import AppIntents

/// Siri entry of the assistant: the app comes to the foreground and its page opens the
/// assistant on screen, the same request CarPlay makes (`AssistantRequestInbox`).
struct OpenAssistantIntent: AppIntent {
    static let title: LocalizedStringResource = "Open the assistant"
    static let description = IntentDescription("Opens atome and starts a voice conversation with the assistant.")
    static let openAppWhenRun = true

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .foreground(.immediate) }

    @MainActor
    func perform() async throws -> some IntentResult {
        AssistantRequestInbox.shared.request(action: "open", source: "siri", surface: "screen")
        return .result()
    }
}

/// Phrases Siri recognises without any setup; translations live in AppShortcuts.xcstrings.
struct AtomeAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenAssistantIntent(),
                    phrases: ["Talk to \(.applicationName)",
                              "Open the \(.applicationName) assistant",
                              "Start the \(.applicationName) assistant"],
                    shortTitle: "Assistant",
                    systemImageName: "waveform")
    }
}

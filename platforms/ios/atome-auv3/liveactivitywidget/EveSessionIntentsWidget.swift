import AppIntents

// The activity's tools run in the app's process (application/LiveActivityHost.swift): the extension declares them so that
// its buttons can name them, and never runs them itself.
enum EveSessionIntentError: Error {
    case appProcessOnly

    func raise() throws { throw self }
}

extension EveSessionPauseIntent {
    func perform() async throws -> some IntentResult {
        try EveSessionIntentError.appProcessOnly.raise()
        return .result()
    }
}

extension EveSessionStopIntent {
    func perform() async throws -> some IntentResult {
        try EveSessionIntentError.appProcessOnly.raise()
        return .result()
    }
}

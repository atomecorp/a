import SwiftUI

// The values set on the watch (Niveaux › Perso, a set's repetitions and load, a brick's length): one line each, half a tool
// high, its name at its start and its value at its end, every line whole and readable (R-221, the design of 2026-11-18,
// replacing the rollers cut by the screen's corner). The line touched takes the selected look and turns with the crown; the
// value is sent once the crown rests. More lines than room scroll, the next one cut at the edge.
struct WatchValueLines: View {
    let values: [WatchValue]
    let theme: WatchTheme
    let commit: (String, Double) -> Void
    @State private var focus: String?

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: theme.metric("gap")) {
                ForEach(values) { value in
                    WatchValueLine(value: value, theme: theme, focused: focus == value.key, commit: commit)
                        .onTapGesture { focus = value.key }
                }
            }
            .padding(.vertical, 4)
        }
        .onAppear { focus = focus ?? values.first?.key }
    }
}

struct WatchValueLine: View {
    let value: WatchValue
    let theme: WatchTheme
    let focused: Bool
    let commit: (String, Double) -> Void
    @State private var draft: Double = 0
    @State private var sent: Double = 0
    // The crown's rest: the value is sent this long after its last turn.
    private static let restSeconds: UInt64 = 600_000_000

    var body: some View {
        HStack(spacing: 0) {
            Text(value.label).font(.system(size: WatchText.base)).lineLimit(1)
            Spacer(minLength: theme.metric("pad"))
            Text(Self.format(draft, unit: value.unit)).font(.system(size: WatchText.base, weight: .semibold)).monospacedDigit().lineLimit(1)
        }
        .padding(.horizontal, theme.metric("pad"))
        .frame(height: theme.metric("half"))
        .background(WatchChoiceBackground(theme: theme, chosen: focused))
        .contentShape(Rectangle())
        .focusable(focused)
        .digitalCrownRotation($draft, from: value.min, through: value.max, by: value.step, sensitivity: .medium, isContinuous: false,
                               isHapticFeedbackEnabled: true)
        .onAppear { draft = value.value; sent = value.value }
        .onChange(of: value.value) { _, fresh in draft = fresh; sent = fresh }
        .onChange(of: draft) { _, turned in
            Task {
                do { try await Task.sleep(nanoseconds: Self.restSeconds) } catch { return }
                guard turned == draft, turned != sent else { return }
                sent = turned
                commit(value.key, turned)
            }
        }
    }

    // Seconds, minutes and kilograms say their unit; a count stands alone (its name says what it counts).
    static func format(_ number: Double, unit: String) -> String {
        let text = number.rounded() == number ? String(Int(number)) : String(format: "%.1f", number)
        return ["s", "min", "kg"].contains(unit) ? "\(text) \(unit)" : text
    }
}

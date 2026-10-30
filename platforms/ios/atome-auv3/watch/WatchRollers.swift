import SwiftUI

// The values set on the watch (Niveaux › Perso, a set's repetitions and load, a brick's length): rollers side by side, each a
// tool wide, its name on top, three half-tool rows — the value in the pressed-in window, its neighbours fading above and below
// (a touch on one steps once). The touched roller turns with the crown; the value is sent once the crown rests.
struct WatchRollers: View {
    let values: [WatchValue]
    let theme: WatchTheme
    let commit: (String, Double) -> Void
    @State private var focus: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.metric("gap")) {
                ForEach(values) { value in
                    WatchRoller(value: value, theme: theme, focused: focus == value.key, commit: commit)
                        .onTapGesture { focus = value.key }
                }
            }
            .padding(.horizontal, 8)
        }
        .onAppear { focus = focus ?? values.first?.key }
    }
}

struct WatchRoller: View {
    let value: WatchValue
    let theme: WatchTheme
    let focused: Bool
    let commit: (String, Double) -> Void
    @State private var draft: Double = 0
    @State private var sent: Double = 0
    // The crown's rest: the value is sent this long after its last turn.
    private static let restSeconds: UInt64 = 600_000_000

    var body: some View {
        let half = theme.metric("half"), tool = theme.metric("tool")
        VStack(spacing: 2) {
            Text(value.label).font(.system(size: 13)).lineLimit(1).frame(width: tool)
            VStack(spacing: 0) {
                row(draft - value.step, faded: true).onTapGesture { step(-1) }
                row(draft, faded: false)
                    .background(RoundedRectangle(cornerRadius: theme.metric("rowRadius")).fill(theme.color("selected")))
                row(draft + value.step, faded: true).onTapGesture { step(1) }
            }
            .frame(width: tool, height: half * 3)
            .background(RoundedRectangle(cornerRadius: theme.metric("toolRadius")).fill(theme.color("well")))
        }
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

    private func step(_ direction: Double) {
        draft = Swift.min(value.max, Swift.max(value.min, draft + direction * value.step))
    }

    @ViewBuilder private func row(_ number: Double, faded: Bool) -> some View {
        let shown = number >= value.min && number <= value.max
        Text(shown ? Self.format(number, unit: value.unit) : "")
            .font(.system(size: faded ? 13 : 17, weight: faded ? .regular : .medium))
            .opacity(faded ? 0.35 : 1)
            .frame(width: theme.metric("tool"), height: theme.metric("half"))
    }

    // Seconds, minutes and kilograms say their unit; a count stands alone (its name says what it counts).
    static func format(_ number: Double, unit: String) -> String {
        let text = number.rounded() == number ? String(Int(number)) : String(format: "%.1f", number)
        return ["s", "min", "kg"].contains(unit) ? "\(text) \(unit)" : text
    }
}

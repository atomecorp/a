import SwiftUI
import WatchKit

// The pieces every watch screen lays (the one design validated by the user on 2026-11-18, R-221, mockup
// temp/watch_2026-11-17/mockups/out/4_design_unique.png), in the screen's own points on the 45 mm frame (198 × 242). Three fixed
// zones: the title at the top left (the system's time at its right), the content, the band at the foot (the pulse on the left,
// the Atom alone in its corner). Nothing passes from one zone to another. No ← tool: a swipe from the left edge goes back.
// Values: the theme the page sends.
enum WatchFrame {
    // From the screen's sides: the title, the pulse and the Atom, clear of the rounded corners.
    static let inset: CGFloat = 22
    static let titleTop: CGFloat = 10
    static let titleWidth: CGFloat = 100
    // The Atom's glyph from the screen's foot.
    static let atomBottom: CGFloat = 12
    // A height of the validated design placed on this watch's screen.
    static func y(_ points: CGFloat, _ size: CGSize) -> CGFloat { points * size.height / 242 }
}

// The charter's one text scale on the watch (12, ×1.3: AGENTS.md rule 11).
enum WatchText {
    static let small: CGFloat = 12
    static let base: CGFloat = 15.6
}

struct WatchTitle: View {
    let text: String
    let theme: WatchTheme
    var body: some View {
        Text(text).font(.system(size: WatchText.base, weight: .semibold)).foregroundStyle(theme.color("label")).lineLimit(1).truncationMode(.tail)
            .frame(maxWidth: WatchFrame.titleWidth, alignment: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.leading, WatchFrame.inset).padding(.top, WatchFrame.titleTop)
    }
}

// A line of words centred under the title or under the disc, cut with « … » if it ever lacks room.
struct WatchCaption: View {
    let text: String
    var weight: Font.Weight = .semibold
    var body: some View {
        Text(text).font(.system(size: WatchText.small, weight: weight)).lineLimit(1).truncationMode(.tail)
            .padding(.horizontal, 14).frame(maxWidth: .infinity)
    }
}

// The way back: a swipe from the screen's left edge (a strip no wider than a fingertip, so the pages and tiles keep their own
// swipes everywhere else).
struct WatchEdgeBack: View {
    let action: () -> Void
    var body: some View {
        Color.clear.frame(width: 16).frame(maxHeight: .infinity).contentShape(Rectangle())
            .highPriorityGesture(DragGesture(minimumDistance: 12).onEnded { drag in if drag.translation.width > 40 { action() } })
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Rest: its glass and drop shadow; press: the pressed look, pressed in (AGENTS.md rule 15).
struct WatchPressStyle: ButtonStyle {
    let theme: WatchTheme
    let radius: CGFloat
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(RoundedRectangle(cornerRadius: radius).fill(configuration.isPressed
                ? AnyShapeStyle(theme.color("pressed").shadow(.inner(color: .black.opacity(0.6), radius: 2, y: 2))) : AnyShapeStyle(theme.color("glass"))))
            .shadow(color: .black.opacity(configuration.isPressed ? 0 : 0.45), radius: 4, y: 3)
    }
}

// A choice among several (a level, a value's line): at rest its glass and drop shadow, chosen the selected look pressed in.
struct WatchChoiceBackground: View {
    let theme: WatchTheme
    let chosen: Bool
    var body: some View {
        let radius = theme.metric("rowRadius")
        if chosen {
            RoundedRectangle(cornerRadius: radius).fill(theme.color("selected").shadow(.inner(color: .black.opacity(0.6), radius: 2, y: 2)))
        } else {
            RoundedRectangle(cornerRadius: radius).fill(theme.color("glass")).shadow(color: .black.opacity(0.4), radius: 3, y: 2)
        }
    }
}

// The Atom in its corner, its glyph alone; lit while the assistant listens or speaks (decision 5 A: a light on its strokes, no halo).
struct WatchAtom: View {
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    var body: some View {
        Button(action: link.toggleAssistant) {
            Group {
                if let atom = link.atom {
                    let glow = theme.color("atomLight")
                    Image(uiImage: atom).resizable().frame(width: theme.metric("atom"), height: theme.metric("atom"))
                        .shadow(color: link.assistantOn ? glow : .clear, radius: 2)
                        .shadow(color: link.assistantOn ? glow : .clear, radius: 5)
                        .shadow(color: link.assistantOn ? glow : .clear, radius: 9)
                }
            }
            .frame(width: theme.metric("tool"), height: theme.metric("tool"))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// The band: the pulse on the left while it is known, the Atom in the right corner, at the same height.
struct WatchBand: View {
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    var bpm: Double? = nil
    var body: some View {
        GeometryReader { geometry in
            let atom = theme.metric("atom"), middle = geometry.size.height - WatchFrame.atomBottom - atom / 2
            if let bpm {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").font(.system(size: 11)).foregroundStyle(theme.color("heart"))
                    Text("\(Int(bpm.rounded()))").font(.system(size: WatchText.small, weight: .semibold))
                }
                .fixedSize()
                .position(x: WatchFrame.inset + 20, y: middle)
            }
            WatchAtom(link: link, theme: theme).position(x: geometry.size.width - WatchFrame.inset - atom / 2, y: middle)
        }
    }
}

// Sport's orange disc: its drop shadow, or the ring of the step under way around it (#dashboard_training_disc.js).
struct WatchDisc<Content: View>: View {
    let theme: WatchTheme
    var ring: WatchRing? = nil
    let action: () -> Void
    @ViewBuilder let content: () -> Content
    var body: some View {
        let side = theme.metric("disc"), around = side + 2 * theme.metric("ringGap") + theme.metric("ringWidth")
        ZStack {
            if let ring {
                TimelineView(.periodic(from: .now, by: 0.25)) { context in
                    ZStack {
                        Circle().stroke(theme.color("ringTrack"), lineWidth: theme.metric("ringWidth"))
                        Circle().trim(from: 0, to: ring.progress(at: context.date))
                            .stroke(.white, style: StrokeStyle(lineWidth: theme.metric("ringWidth"), lineCap: .round)).rotationEffect(.degrees(-90))
                    }
                    .frame(width: around, height: around)
                }
            }
            Button(action: action) {
                content().foregroundStyle(.white).frame(width: side, height: side)
                    .background(Circle().fill(theme.color("disc")))
                    .shadow(color: .black.opacity(0.45), radius: 6, y: 8)
            }
            .buttonStyle(.plain)
        }
    }
}

// The disc's figure: a count as the page gives it, or a clock counted here from the instant it ends or began. The 3-2-1
// before a session (`whole`) reads as the phone's disc does: its whole seconds, never under 1. Paused, the pause sign takes
// the word's place; `bare` (the stop slider's small disc) shows the figure alone.
struct WatchFigureView: View {
    let figure: WatchFigure?
    var size: CGFloat = 44
    var whole = false
    var paused = false
    var bare = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 2) {
                Text(text(at: context.date)).font(.system(size: size, weight: .semibold)).monospacedDigit().minimumScaleFactor(1)
                if bare {
                    EmptyView()
                } else if paused {
                    Image(systemName: "pause.fill").font(.system(size: 13))
                } else if let word = figure?.word, !word.isEmpty {
                    Text(word).font(.system(size: WatchText.small, weight: .semibold))
                }
            }
        }
    }

    private func text(at date: Date) -> String {
        let now = date.timeIntervalSince1970 * 1000
        if let ends = figure?.ends_at {
            let left = max(0, (ends - now) / 1000).rounded(.up)
            return whole ? String(max(1, Int(left))) : Self.clock(left)
        }
        if let since = figure?.since { return Self.clock(max(0, (now - since) / 1000).rounded(.down)) }
        return figure?.count ?? ""
    }

    static func clock(_ seconds: Double) -> String {
        let whole = Int(seconds)
        return "\(whole / 60):" + String(format: "%02d", whole % 60)
    }
}

// A tile of the Activité rubric: its glass tinted pink, its hairline edge (the named tile exception), its label on top, its disc.
struct WatchTileView: View {
    let label: String
    let picture: UIImage?
    let theme: WatchTheme
    var lit = false
    var body: some View {
        let side = theme.metric("tile"), radius = theme.metric("tileRadius")
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: radius).fill(theme.color("glass"))
            RoundedRectangle(cornerRadius: radius).fill(theme.color("tileTint"))
            RoundedRectangle(cornerRadius: radius).strokeBorder(theme.color("tileEdge"), lineWidth: 1)
            Text(label).font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.color("label")).lineLimit(1).truncationMode(.tail)
                .padding(.horizontal, theme.metric("pad")).padding(.top, 9)
            if let picture {
                Image(uiImage: picture).resizable().frame(width: theme.metric("glyph"), height: theme.metric("glyph"))
                    .shadow(color: lit ? theme.color("litLight") : .clear, radius: 3)
                    .shadow(color: lit ? theme.color("litLight") : .clear, radius: 8)
                    .padding(.top, 42)
            }
        }
        .frame(width: side, height: side)
        .shadow(color: .black.opacity(0.45), radius: 5, y: 4)
    }
}

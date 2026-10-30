import SwiftUI
import WatchKit

// The pieces every watch screen lays (screens validated on 2026-10-30, temp/watch_companion/out/w0_*.png), in the screen's own
// points on the 45 mm frame (198 × 242): the title at the top left (the system's time at its right), the band at the foot (Back
// leftmost, the Atom alone in its corner), the pulse small in the bottom left facing the Atom. Values: the theme the page sends.
enum WatchFrame {
    static let titleTop: CGFloat = 7
    static let side: CGFloat = 14
    // From the screen's foot: the band's top, the pulse, the line above it.
    static let bandBottom: CGFloat = 16
    static let pulseBottom: CGFloat = 42
    static let lineBottom: CGFloat = 64
}

struct WatchTitle: View {
    let text: String
    let theme: WatchTheme
    var body: some View {
        Text(text).font(.system(size: 15, weight: .medium)).foregroundStyle(theme.color("label")).lineLimit(1).truncationMode(.tail)
            .frame(maxWidth: 112, alignment: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.leading, WatchFrame.side).padding(.top, WatchFrame.titleTop)
    }
}

// A tool of the band: the panels' glass, a tool's radius, its drop shadow; pressed in while touched.
struct WatchToolButton<Glyph: View>: View {
    let theme: WatchTheme
    var label: String = ""
    let action: () -> Void
    @ViewBuilder let glyph: () -> Glyph
    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                if !label.isEmpty { Text(label).font(.system(size: 12)) }
                glyph()
            }
            .frame(width: theme.metric("tool"), height: theme.metric("tool"))
        }
        .buttonStyle(WatchPressStyle(theme: theme, radius: theme.metric("toolRadius")))
    }
}

// Rest: its glass and drop shadow; press: the pressed look, pressed in (AGENTS.md rule 15).
struct WatchPressStyle: ButtonStyle {
    let theme: WatchTheme
    let radius: CGFloat
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(RoundedRectangle(cornerRadius: radius).fill(configuration.isPressed ? theme.color("pressed") : theme.color("glass")))
            .shadow(color: .black.opacity(configuration.isPressed ? 0 : 1), radius: 6)
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

// The band: Back leftmost when the screen has one, the tools after it, the Atom rightmost.
struct WatchBand<Tools: View>: View {
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    var back: (() -> Void)? = nil
    @ViewBuilder var tools: () -> Tools
    var body: some View {
        HStack(spacing: theme.metric("gap")) {
            if let back {
                WatchToolButton(theme: theme, action: back) { Image(systemName: "chevron.left").font(.system(size: 22, weight: .semibold)) }
            }
            tools()
            Spacer(minLength: 0)
            WatchAtom(link: link, theme: theme)
        }
        .padding(.horizontal, 6)
        .frame(maxHeight: .infinity, alignment: .bottom)
        .padding(.bottom, WatchFrame.bandBottom)
    }
}

extension WatchBand where Tools == EmptyView {
    init(link: WatchLink, theme: WatchTheme, back: (() -> Void)? = nil) {
        self.init(link: link, theme: theme, back: back) { EmptyView() }
    }
}

// The pulse, small, in the bottom left facing the Atom (decision 3, revised by the user on 2026-10-30).
struct WatchPulse: View {
    let bpm: Double?
    let theme: WatchTheme
    var body: some View {
        if let bpm {
            HStack(spacing: 4) {
                Image(systemName: "heart.fill").font(.system(size: 11)).foregroundStyle(theme.color("heart"))
                Text("\(Int(bpm.rounded()))").font(.system(size: 13, weight: .medium))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .padding(.leading, WatchFrame.side).padding(.bottom, WatchFrame.pulseBottom - 13)
        }
    }
}

// Sport's orange disc: its drop shadow, its halo at rest, or the ring of the step under way around it (#dashboard_training_disc.js).
struct WatchDisc<Content: View>: View {
    let theme: WatchTheme
    var size: CGFloat? = nil
    var ring: WatchRing? = nil
    let action: () -> Void
    @ViewBuilder let content: () -> Content
    var body: some View {
        let side = size ?? theme.metric("disc"), around = side + 2 * theme.metric("ringGap") + theme.metric("ringWidth")
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
                    .background(Circle().fill(theme.color("disc").opacity(ring == nil ? 0.16 : 0)).padding(-theme.metric("halo")))
                    .shadow(color: .black.opacity(0.5), radius: 11, y: 10)
            }
            .buttonStyle(.plain)
        }
    }
}

// The disc's figure: a count as the page gives it, or a clock counted here from the instant it ends or began.
struct WatchFigureView: View {
    let figure: WatchFigure?
    var size: CGFloat = 42
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 2) {
                Text(text(at: context.date)).font(.system(size: size, weight: .medium)).monospacedDigit().minimumScaleFactor(1)
                if let word = figure?.word, !word.isEmpty { Text(word).font(.system(size: 12, weight: .medium)) }
            }
        }
    }

    private func text(at date: Date) -> String {
        let now = date.timeIntervalSince1970 * 1000
        if let ends = figure?.ends_at { return Self.clock(max(0, (ends - now) / 1000).rounded(.up)) }
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
            Text(label).font(.system(size: 14, weight: .medium)).foregroundStyle(theme.color("label")).lineLimit(1).truncationMode(.tail)
                .padding(.horizontal, theme.metric("pad")).padding(.top, 10)
            if let picture {
                Image(uiImage: picture).resizable().frame(width: theme.metric("glyph"), height: theme.metric("glyph"))
                    .shadow(color: lit ? theme.color("litLight") : .clear, radius: 3)
                    .shadow(color: lit ? theme.color("litLight") : .clear, radius: 8)
                    .padding(.top, 44)
            }
        }
        .frame(width: side, height: side)
        .shadow(color: .black.opacity(0.9), radius: 6)
    }
}

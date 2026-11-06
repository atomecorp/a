import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// What the Live Activity draws (lot D13, temp/d18_native/mockups/d13_live_activity_*.png, validated « tel quel » on
// 2026-11-04), every value from the page's look (eVe/elements/skin/live_activity_skin.js). The frame — its size, its corners,
// the island's black — is iOS's. Clocks and the ring run alone from the instants the page gave.

extension EveSessionTheme {
    // The page sends every value the activity draws with: one missing is a broken payload, never a guess.
    func color(_ name: String) -> Color {
        guard let rgba = colors[name], rgba.count == 4 else { preconditionFailure("live_activity_theme_color_missing:\(name)") }
        return Color(.sRGB, red: rgba[0], green: rgba[1], blue: rgba[2], opacity: rgba[3])
    }

    func metric(_ name: String) -> CGFloat {
        guard let value = metrics[name] else { preconditionFailure("live_activity_theme_metric_missing:\(name)") }
        return CGFloat(value)
    }

    // eVe's embedded font (liveactivitywidget/Info.plist UIAppFonts).
    func font(_ step: String, medium: Bool = true) -> Font {
        .custom(medium ? "Roboto-Medium" : "Roboto-Regular", fixedSize: metric(step))
    }
}

// One of eVe's own glyphs (its SVG icons, copied into this extension's asset catalog as template vectors), drawn at a side.
struct EveGlyph: View {
    let name: String
    let side: CGFloat
    var body: some View {
        Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: side, height: side)
    }
}

// A clock as the page gives it: a count, or iOS counting down to `ends_at` or up from `since`.
struct EveSessionClock: View {
    let figure: EveSessionFigure?
    var body: some View {
        if let ends = figure?.ends_at {
            let end = Date(timeIntervalSince1970: ends / 1000)
            Text(timerInterval: min(Date(), end)...end, countsDown: true).monospacedDigit()
        } else if let since = figure?.since {
            Text(Date(timeIntervalSince1970: since / 1000), style: .timer).monospacedDigit()
        } else {
            Text(figure?.count ?? "").monospacedDigit()
        }
    }
}

// Sport's orange disc in its ring (the card's, smaller in the island): the step's figure inside, its word under it.
struct EveSessionDisc: View {
    let theme: EveSessionTheme
    let state: EveSessionAttributes.ContentState
    let side: CGFloat
    let figureStep: String
    var word = true

    var body: some View {
        let line = max(2, side * 0.055), gap = side * 0.065
        ZStack {
            Circle().stroke(theme.color("ringTrack"), lineWidth: line).padding(line / 2)
            ring(line: line)
            Circle().fill(theme.color("disc")).padding(line + gap)
            VStack(spacing: 2) {
                EveSessionClock(figure: state.figure).font(theme.font(figureStep)).minimumScaleFactor(0.5).lineLimit(1)
                    .multilineTextAlignment(.center)
                if word, let text = state.figure?.word, !text.isEmpty { Text(text).font(theme.font("text0", medium: false)) }
            }
            .foregroundStyle(.white).padding(line + gap)
        }
        .frame(width: side, height: side)
    }

    // A ring that moves runs alone over its interval; one that stands is drawn where it stands.
    @ViewBuilder private func ring(line: CGFloat) -> some View {
        if let ring = state.ring, let interval = ring.interval {
            ProgressView(timerInterval: interval, countsDown: ring.rate < 0, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.circular).tint(.white)
        } else if let ring = state.ring {
            Circle().trim(from: 0, to: ring.progress).stroke(.white, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90)).padding(line / 2)
        }
    }
}

// A tool of the card: the tools' glass and its drop shadow, its glyph alone (Pause lit while the session stands).
struct EveSessionTool<Intent: LiveActivityIntent>: View {
    let theme: EveSessionTheme
    let intent: Intent
    let symbol: String
    var lit = false

    var body: some View {
        let side = theme.metric("tool")
        Button(intent: intent) {
            EveGlyph(name: symbol, side: theme.metric("glyph"))
                .foregroundStyle(lit ? theme.color("lit") : .white)
                .shadow(color: lit ? theme.color("litLight") : .clear, radius: theme.metric("glyph") * 0.2)
                .frame(width: side, height: side)
                .background(RoundedRectangle(cornerRadius: theme.metric("radius")).fill(theme.color("tool"))
                    .shadow(color: theme.color("toolShadow"), radius: theme.metric("shadowBlur") / 2, y: theme.metric("shadowY")))
        }
        .buttonStyle(.plain)
    }
}

// The lock screen's card, and the expanded island on its black: the exercise and the session's time on top, the disc, the
// step and the pulse, Pause and Stop at the bottom right.
struct EveSessionCard: View {
    let attributes: EveSessionAttributes
    let state: EveSessionAttributes.ContentState

    var body: some View {
        let theme = state.theme, pad = theme.metric("pad"), half = theme.metric("half"), disc = theme.metric("disc")
        VStack(spacing: pad) {
            HStack {
                Text(attributes.title).font(theme.font("text1")).foregroundStyle(theme.color("label")).lineLimit(1)
                Spacer(minLength: pad)
                EveSessionClock(figure: state.time).font(theme.font("text1")).foregroundStyle(.white)
                    .multilineTextAlignment(.trailing).frame(width: theme.metric("tool") * 2, alignment: .trailing)
            }
            .frame(height: half)
            HStack(alignment: .bottom, spacing: pad) {
                EveSessionDisc(theme: theme, state: state, side: disc, figureStep: "text3")
                VStack(alignment: .leading, spacing: half / 6) {
                    Text(state.stage).font(theme.font("text2")).lineLimit(1).frame(height: half)
                    if let heart = state.heart {
                        HStack(spacing: theme.metric("gap")) {
                            EveGlyph(name: "eve_heart", side: theme.metric("text1")).foregroundStyle(theme.color("heart"))
                            Text("\(Int(heart.rounded()))").font(theme.font("text1"))
                        }
                        .frame(height: half)
                    }
                }
                .foregroundStyle(.white)
                .frame(maxHeight: disc, alignment: .top).padding(.top, pad)
                Spacer(minLength: 0)
                HStack(spacing: theme.metric("gap")) {
                    EveSessionTool(theme: theme, intent: EveSessionPauseIntent(), symbol: state.paused ? "eve_play" : "eve_pause", lit: state.paused)
                    EveSessionTool(theme: theme, intent: EveSessionStopIntent(), symbol: "eve_stop")
                }
            }
        }
        .padding(pad)
    }
}

// The compact island's trailing side: the session's time in the disc's orange, or Lecture lit while it stands.
struct EveSessionCompactTime: View {
    let theme: EveSessionTheme
    let state: EveSessionAttributes.ContentState
    var body: some View {
        if state.paused {
            EveGlyph(name: "eve_play", side: theme.metric("text1")).foregroundStyle(theme.color("lit"))
                .shadow(color: theme.color("litLight"), radius: theme.metric("text1") * 0.2)
        } else {
            EveSessionClock(figure: state.time).font(theme.font("text1")).foregroundStyle(theme.color("disc"))
                .multilineTextAlignment(.trailing).frame(maxWidth: theme.metric("tool"))
        }
    }
}

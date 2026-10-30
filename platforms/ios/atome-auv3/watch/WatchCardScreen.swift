import SwiftUI
import WatchKit

// The card the iPhone shows or runs, as pages side by side (screens É3-É5 validated on 2026-10-30,
// temp/watch_companion/out/w0_1_naviguer.png and w0_2_seance.png). Before the session: Niveaux ◄ Prêt (the orange disc ▶
// starts it). During it: Contrôles (Back = leave, Pause, the disc slid to ■ stops) ◄ Disque (a touch: the set done, the rest
// ended) ► Réglage (its values on rollers, the crown turning them) ► Filmer. At its end: the disc ✓ keeps it. Every touch is a
// request the iPhone's card carries out (training.card_action, brick_session.card_action, training.film); the watch shows what
// the iPhone then describes. The wrist taps at each new step, at the start and at the end.
struct WatchCardScreen: View {
    let card: WatchCard
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    let leave: () -> Void
    @State private var page: String?

    private var pages: [String] {
        guard let session = card.session else { return ["levels", "ready"] }
        if session.phase == "done" { return ["end"] }
        return ["controls", "disc"] + (session.phase != "countdown" && !card.values.isEmpty ? ["tune"] : []) + (card.film == nil ? [] : ["film"])
    }
    private var home: String { card.session == nil ? "ready" : card.session?.phase == "done" ? "end" : "disc" }

    var body: some View {
        GeometryReader { geometry in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(pages, id: \.self) { name in
                        ZStack(alignment: .topLeading) { content(name, geometry.size) }
                            .frame(width: geometry.size.width, height: geometry.size.height)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $page)
        }
        .onAppear { page = home }
        .onChange(of: pages) { _, fresh in if !fresh.contains(page ?? "") { page = home } }
        .onChange(of: card.session?.line) { old, _ in if old != nil, card.session?.phase == "running" { WKInterfaceDevice.current().play(.notification) } }
        .onChange(of: card.session?.phase) { _, phase in
            if phase == "running" { WKInterfaceDevice.current().play(.start) }
            if phase == "done" { WKInterfaceDevice.current().play(.success) }
        }
    }

    private func act(_ action: String, _ extra: [String: Any] = [:]) { link.act(action, on: card, extra: extra) }
    // The screen's own points, from the 45 mm frame: a height of the validated mockups placed on this watch.
    private func y(_ points: CGFloat, _ size: CGSize) -> CGFloat { points * size.height / 242 }

    @ViewBuilder private func content(_ name: String, _ size: CGSize) -> some View {
        switch name {
        case "levels": levels(size)
        case "ready": ready(size)
        case "controls": controls(size)
        case "disc": discPage(size)
        case "tune": tune(size)
        case "film": film(size)
        default: end(size)
        }
    }

    // Niveaux: 1, 2, 3, Perso; a level reads its plan, « Perso » (and a brick's length) its rollers. Back where it fits.
    @ViewBuilder private func levels(_ size: CGSize) -> some View {
        let rollers = card.level == "custom" || card.levels.isEmpty
        WatchTitle(text: card.title, theme: theme)
        if !card.levels.isEmpty {
            HStack(spacing: 0) {
                ForEach(card.levels) { level in
                    Button { act("level", ["level": level.id]) } label: {
                        Text(level.label).font(.system(size: 15)).frame(maxWidth: .infinity, minHeight: theme.metric("half"))
                            .background(RoundedRectangle(cornerRadius: theme.metric("rowRadius"))
                                .fill(level.id == card.level ? theme.color("selected") : .clear))
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(RoundedRectangle(cornerRadius: theme.metric("rowRadius")).fill(theme.color("glass")))
            .padding(.horizontal, 8).offset(y: y(28, size))
        }
        if rollers {
            WatchRollers(values: card.values, theme: theme) { key, value in act("set", ["field": key, "value": value]) }
                .offset(y: y(62, size))
            WatchBand(link: link, theme: theme)
        } else {
            VStack(spacing: 6) {
                ForEach(Array(card.plan.enumerated()), id: \.offset) { index, line in
                    Text(line).font(.system(size: index == 0 ? 15 : 13)).opacity(index == 0 ? 1 : 0.85)
                }
            }
            .frame(width: size.width).offset(y: y(78, size))
            WatchBand(link: link, theme: theme, back: leave)
        }
    }

    // Prêt: the disc's caption on top, the orange disc ▶ starts the session on the iPhone and here at once.
    @ViewBuilder private func ready(_ size: CGSize) -> some View {
        WatchTitle(text: card.title, theme: theme)
        caption(card.start, size)
        WatchDisc(theme: theme, action: { act("start") }) { Image(systemName: "play.fill").font(.system(size: 30)) }
            .position(x: size.width / 2, y: y(104, size))
        WatchBand(link: link, theme: theme, back: leave)
    }

    // Contrôles: what comes next, the disc as a tool slid along its well to ■ to stop; Back leaves, Pause pauses or resumes.
    @ViewBuilder private func controls(_ size: CGSize) -> some View {
        let session = card.session
        WatchTitle(text: card.title, theme: theme)
        caption(session?.next ?? "", size, top: 30, weight: .regular)
        WatchStopSlider(figure: session?.figure, theme: theme) {
            WKInterfaceDevice.current().play(.stop)
            act("stop")
        }
        .frame(width: size.width - 16).offset(x: 8, y: y(58, size))
        WatchBand(link: link, theme: theme, back: leave) {
            if session?.phase != "countdown" {
                WatchToolButton(theme: theme, label: session?.pause ?? "", action: { act("pause") }) {
                    Image(systemName: session?.phase == "paused" ? "play.fill" : "pause.fill").font(.system(size: 18))
                }
            }
        }
    }

    // Disque: the step under way on top, the disc and its ring (a touch does what the iPhone's disc does), « Ensuite · … », the pulse.
    @ViewBuilder private func discPage(_ size: CGSize) -> some View {
        let session = card.session
        WatchTitle(text: session?.line ?? card.title, theme: theme)
        WatchDisc(theme: theme, ring: session?.ring, action: { act("done") }) { WatchFigureView(figure: session?.figure) }
            .position(x: size.width / 2, y: y(94, size))
        if let next = session?.next, !next.isEmpty {
            Text(next).font(.system(size: 13)).lineLimit(1).frame(maxWidth: size.width - 80, alignment: .leading)
                .offset(x: WatchFrame.side, y: size.height - WatchFrame.lineBottom - 14)
        }
        WatchPulse(bpm: session?.heart, theme: theme)
        WatchBand(link: link, theme: theme)
    }

    // Réglage: the set's own values (or the plan's), each on its roller.
    @ViewBuilder private func tune(_ size: CGSize) -> some View {
        WatchTitle(text: card.title, theme: theme)
        WatchRollers(values: card.values, theme: theme) { key, value in act("set", ["field": key, "value": value]) }
            .offset(y: y(62, size))
        WatchPulse(bpm: card.session?.heart, theme: theme)
        WatchBand(link: link, theme: theme)
    }

    // Filmer: a tile; touched, the iPhone films (its glyph lit, the tile counting the take's time); touched again, it stops.
    @ViewBuilder private func film(_ size: CGSize) -> some View {
        let take = card.film
        WatchTitle(text: card.title, theme: theme)
        Button { link.film(!(take?.active ?? false)) } label: {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                WatchTileView(label: take.map { Self.filmLabel($0, at: context.date) } ?? "",
                              picture: link.pictures[take?.active == true ? "capture_lit" : "capture"], theme: theme, lit: take?.active == true)
            }
        }
        .buttonStyle(.plain)
        .position(x: size.width / 2, y: y(34, size) + theme.metric("tile") / 2)
        WatchPulse(bpm: card.session?.heart, theme: theme)
        WatchBand(link: link, theme: theme)
    }

    // The end: the disc ✓ keeps the session (it counts for the objectives, as on the iPhone).
    @ViewBuilder private func end(_ size: CGSize) -> some View {
        WatchTitle(text: card.title, theme: theme)
        caption(card.session?.caption ?? "", size)
        WatchDisc(theme: theme, action: { act("finish") }) { Image(systemName: "checkmark").font(.system(size: 34, weight: .semibold)) }
            .position(x: size.width / 2, y: y(104, size))
        WatchBand(link: link, theme: theme)
    }

    private func caption(_ text: String, _ size: CGSize, top: CGFloat = 26, weight: Font.Weight = .medium) -> some View {
        Text(text).font(.system(size: 14, weight: weight)).lineLimit(1).frame(width: size.width).offset(y: y(top, size))
    }

    private static func filmLabel(_ take: WatchFilm, at date: Date) -> String {
        guard take.active, let since = ISO8601DateFormatter.withFraction.date(from: take.at) else { return take.label }
        return WatchFigureView.clock(max(0, date.timeIntervalSince(since)).rounded(.down))
    }
}

private extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

// Stopping: the disc, a tool's size, slid along its well to the ■ at its end (never a stop by mistake in the middle of an effort).
struct WatchStopSlider: View {
    let figure: WatchFigure?
    let theme: WatchTheme
    let stop: () -> Void
    @State private var travel: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            let tool = theme.metric("tool"), course = geometry.size.width - tool
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: theme.metric("toolRadius")).fill(theme.color("well"))
                Image(systemName: "stop").font(.system(size: 20)).frame(width: tool, height: tool).offset(x: course).opacity(0.9)
                WatchFigureView(figure: figure, size: 26).foregroundStyle(.white).frame(width: tool, height: tool)
                    .background(Circle().fill(theme.color("disc")))
                    .shadow(color: .black.opacity(0.5), radius: 8, y: 6)
                    .offset(x: travel)
                    .gesture(DragGesture()
                        .onChanged { drag in travel = min(course, max(0, drag.translation.width)) }
                        .onEnded { _ in
                            if travel >= course - 4 { stop() }
                            withAnimation(.easeOut(duration: 0.2)) { travel = 0 }
                        })
            }
        }
        .frame(height: theme.metric("tool"))
    }
}

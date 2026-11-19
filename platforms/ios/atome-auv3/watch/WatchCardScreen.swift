import SwiftUI
import WatchKit

// The card the iPhone shows or runs, as pages side by side (the one design of 2026-11-18, R-221, mockup
// temp/watch_2026-11-17/mockups/out/4_design_unique.png; pages as validated on 2026-10-30). Before the session: Niveaux ◄ Prêt
// (the orange disc ▶ starts it). During it: Contrôles (the disc slid to ■ stops, Suivant goes on) ◄ Disque (a touch pauses or
// resumes; during the 3-2-1 it starts at once) ► Réglage (its values in lines, the crown turning the one touched) ► Filmer. At its
// end: the disc ✓ keeps it. A swipe from the left edge of the first page leaves the card on the watch only. Every touch is a
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
                        ZStack(alignment: .topLeading) {
                            content(name, geometry.size)
                            if name == pages.first { WatchEdgeBack(action: leave) }
                        }
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
    private func y(_ points: CGFloat, _ size: CGSize) -> CGFloat { WatchFrame.y(points, size) }
    // The ring around the session's disc, outer side.
    private var ringSide: CGFloat { theme.metric("disc") + 2 * theme.metric("ringGap") + 2 * theme.metric("ringWidth") }

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

    // Niveaux: 1, 2, 3 on half tools and Perso on a whole tool; a level reads its plan, « Perso » (and a brick's length) its lines.
    @ViewBuilder private func levels(_ size: CGSize) -> some View {
        let lines = card.level == "custom" || card.levels.isEmpty
        WatchTitle(text: card.title, theme: theme)
        if !card.levels.isEmpty {
            HStack(spacing: theme.metric("gap")) {
                ForEach(card.levels) { level in
                    Button { act("level", ["level": level.id]) } label: {
                        Text(level.label).font(.system(size: WatchText.base))
                            .frame(width: level.id == "custom" ? theme.metric("tool") : theme.metric("half"), height: theme.metric("half"))
                            .background(WatchChoiceBackground(theme: theme, chosen: level.id == card.level))
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(width: size.width).offset(y: y(42, size))
        }
        if lines {
            let top = y(card.levels.isEmpty ? 42 : 80, size)
            WatchValueLines(values: card.values, theme: theme) { key, value in act("set", ["field": key, "value": value]) }
                .padding(.horizontal, 16)
                .frame(width: size.width, height: y(190, size) - top).offset(y: top)
        } else {
            VStack(spacing: 8) {
                ForEach(Array(card.plan.enumerated()), id: \.offset) { index, line in
                    Text(line).font(.system(size: index == 0 ? WatchText.base : WatchText.small, weight: index == 0 ? .semibold : .regular))
                        .opacity(index == 0 ? 1 : 0.9).lineLimit(1)
                }
            }
            .frame(width: size.width).offset(y: y(102, size))
        }
        WatchBand(link: link, theme: theme)
    }

    // Prêt: the disc's caption on top, the orange disc ▶ alone in the middle starts the session on the iPhone and here at once.
    @ViewBuilder private func ready(_ size: CGSize) -> some View {
        WatchTitle(text: card.title, theme: theme)
        WatchCaption(text: card.start).offset(y: y(38, size))
        WatchDisc(theme: theme, action: { act("start") }) { Image(systemName: "play.fill").font(.system(size: 36)) }
            .position(x: size.width / 2, y: y(116, size))
        WatchBand(link: link, theme: theme)
    }

    // Contrôles: what comes next, the disc slid along its well to ■ to stop, Suivant (two tools wide) under it.
    @ViewBuilder private func controls(_ size: CGSize) -> some View {
        let session = card.session
        WatchTitle(text: card.title, theme: theme)
        WatchCaption(text: session?.next ?? "", weight: .regular).opacity(0.92).offset(y: y(38, size))
        WatchStopSlider(figure: session?.figure, theme: theme) {
            WKInterfaceDevice.current().play(.stop)
            act("stop")
        }
        .frame(width: size.width - 32).offset(x: 16, y: y(62, size))
        if session?.phase != "countdown" {
            Button { act("next") } label: {
                HStack(spacing: 8) {
                    Image(systemName: "forward.end.fill").font(.system(size: 15))
                    Text(session?.forward ?? "").font(.system(size: WatchText.base)).lineLimit(1)
                }
                .frame(width: 2 * theme.metric("tool"), height: theme.metric("tool"))
            }
            .buttonStyle(WatchPressStyle(theme: theme, radius: theme.metric("toolRadius")))
            .frame(width: size.width).offset(y: y(130, size))
        }
        WatchBand(link: link, theme: theme)
    }

    // Disque: the step's name on top, the disc and its ring (a touch pauses or resumes, as the iPhone's disc; during the 3-2-1 it
    // starts at once; paused, the pause sign under its figure), « Ensuite · … » whole under it, the pulse.
    @ViewBuilder private func discPage(_ size: CGSize) -> some View {
        let session = card.session, centre = y(36, size) + ringSide / 2
        WatchTitle(text: session?.stage.flatMap { $0.isEmpty ? nil : $0 } ?? session?.line ?? card.title, theme: theme)
        // During the 3-2-1 a touch brings the start forward, as on the phone's disc (training.card_action `done`: goNow).
        WatchDisc(theme: theme, ring: session?.ring, action: { act(session?.phase == "countdown" ? "done" : "pause") }) {
            WatchFigureView(figure: session?.figure, whole: session?.phase == "countdown", paused: session?.phase == "paused")
        }
        .position(x: size.width / 2, y: centre)
        if let next = session?.next, !next.isEmpty {
            WatchCaption(text: next, weight: .regular).opacity(0.92).offset(y: centre + ringSide / 2 + 8)
        }
        WatchBand(link: link, theme: theme, bpm: session?.heart)
    }

    // Réglage: the set's own values (or the plan's), one line each.
    @ViewBuilder private func tune(_ size: CGSize) -> some View {
        WatchTitle(text: card.title, theme: theme)
        WatchValueLines(values: card.values, theme: theme) { key, value in act("set", ["field": key, "value": value]) }
            .padding(.horizontal, 16)
            .frame(width: size.width, height: y(190 - 42, size)).offset(y: y(42, size))
        WatchBand(link: link, theme: theme, bpm: card.session?.heart)
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
        .position(x: size.width / 2, y: y(46, size) + theme.metric("tile") / 2)
        WatchBand(link: link, theme: theme, bpm: card.session?.heart)
    }

    // The end: the disc ✓ keeps the session (it counts for the objectives, as on the iPhone). Its caption says « Enregistrer »
    // while the session waits to be saved; one already saved by itself (R-207: at its last step, or by a stop) says how it ended
    // (« Terminé », « Arrêté »), its ✓ going back to the plan.
    @ViewBuilder private func end(_ size: CGSize) -> some View {
        let session = card.session
        WatchTitle(text: card.title, theme: theme)
        WatchCaption(text: session?.caption.flatMap { $0.isEmpty ? nil : $0 } ?? session?.line ?? "").offset(y: y(38, size))
        WatchDisc(theme: theme, action: { act("finish") }) { Image(systemName: "checkmark").font(.system(size: 40, weight: .semibold)) }
            .position(x: size.width / 2, y: y(116, size))
        WatchBand(link: link, theme: theme)
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

// Stopping: the disc, inside its well, slid to the ■ at its end (never a stop by mistake in the middle of an effort).
struct WatchStopSlider: View {
    let figure: WatchFigure?
    let theme: WatchTheme
    let stop: () -> Void
    @State private var travel: CGFloat = 0
    // The disc lies inside the well by this much, never past its edge.
    private static let inset: CGFloat = 5

    var body: some View {
        GeometryReader { geometry in
            let tool = theme.metric("tool"), side = tool - 2 * Self.inset, course = geometry.size.width - tool
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: theme.metric("toolRadius"))
                    .fill(theme.color("well").shadow(.inner(color: .black.opacity(0.6), radius: 2.5, y: 2)))
                RoundedRectangle(cornerRadius: theme.metric("toolRadius")).fill(.white.opacity(0.9))
                    .frame(width: 16, height: 16).frame(width: tool, height: tool).offset(x: course)
                WatchFigureView(figure: figure, size: 20, bare: true).foregroundStyle(.white).frame(width: side, height: side)
                    .background(Circle().fill(theme.color("disc")))
                    .shadow(color: .black.opacity(0.5), radius: 3, y: 3)
                    .offset(x: Self.inset + travel)
                    // A drag that starts on the disc is the slider's, never the pages' (BUG-008 E3): inside the horizontal
                    // paging scroll view a plain gesture lost it, and sliding to ■ turned the page instead of stopping.
                    .highPriorityGesture(DragGesture(minimumDistance: 2)
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

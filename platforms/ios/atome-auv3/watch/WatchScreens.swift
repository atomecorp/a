import SwiftUI

// The watch's screens (validated on 2026-10-30, temp/watch_companion/out/w0_1_naviguer.png and w0_3_assistant.png): the tiles
// of Activité, a level at a time, scrolled sideways (É1, É2); the card the iPhone shows or runs, laid as pages
// (WatchCardScreen.swift); « Ouvre eVe sur ton iPhone » while the iPhone is out of reach (decision 7). A card the iPhone opens
// or starts shows here at once; Back leaves it on the watch only, the iPhone keeping it. A question the iPhone's card asks before
// its session (the agreement to record the motion) is answered there: the iPhone screen says so meanwhile.
struct WatchRootView: View {
    @ObservedObject var link: WatchLink
    @State private var path: [WatchTile] = []
    // The card left on the watch by its Back (kind, id, whether a session runs): the same card comes back only when it changes.
    @State private var left = ""

    var body: some View {
        ZStack {
            if let catalog = link.catalog, link.reachable {
                catalog.theme.color("ground")
                if let card = link.model?.card, let asking = card.asking {
                    WatchPhoneScreen(text: asking)
                } else if let card = link.model?.card, Self.key(card) != left {
                    WatchCardScreen(card: card, link: link, theme: catalog.theme) { left = Self.key(card) }
                } else {
                    tiles(catalog)
                }
            } else {
                Color.black
                WatchPhoneScreen(text: link.catalog?.phone)
            }
        }
        .ignoresSafeArea()
        .onChange(of: link.model?.card.map(Self.key)) { _, key in if key != left { left = "" } }
    }

    private static func key(_ card: WatchCard) -> String { "\(card.kind):\(card.id):\(card.session == nil ? "plan" : "session")" }

    @ViewBuilder private func tiles(_ catalog: WatchCatalog) -> some View {
        let level = path.last
        WatchTilesScreen(title: level?.label ?? catalog.title, tiles: level?.tiles ?? catalog.tiles, link: link, theme: catalog.theme,
                         back: path.isEmpty ? nil : { path.removeLast() }) { tile in
            if tile.tiles != nil { return path.append(tile) }
            guard let target = tile.open else { return }
            left = ""
            link.open(target)
        }
    }
}

// A level of tiles: the one in the middle whole, its neighbours cut at the edges; a sideways swipe moves along, a touch enters.
struct WatchTilesScreen: View {
    let title: String
    let tiles: [WatchTile]
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    let back: (() -> Void)?
    let choose: (WatchTile) -> Void

    var body: some View {
        GeometryReader { geometry in
            let side = theme.metric("tile")
            ZStack(alignment: .topLeading) {
                WatchTitle(text: title, theme: theme)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: theme.metric("gap")) {
                        ForEach(tiles) { tile in
                            Button { choose(tile) } label: {
                                WatchTileView(label: tile.label, picture: link.pictures[tile.picture], theme: theme)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .scrollTargetLayout()
                }
                .contentMargins(.horizontal, (geometry.size.width - side) / 2, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .frame(width: geometry.size.width, height: side + 16)
                .offset(y: 34 - 8)
                WatchBand(link: link, theme: theme, back: back)
            }
        }
    }
}

// The iPhone is needed (V1): its glyph and, once eVe has said it, its words.
struct WatchPhoneScreen: View {
    let text: String?
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "iphone").font(.system(size: 40, weight: .light))
            if let text { Text(text).font(.system(size: 15, weight: .medium)).multilineTextAlignment(.center) }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, WatchFrame.side)
    }
}

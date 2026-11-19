import SwiftUI

// The watch's screens (validated on 2026-10-30, redrawn as one design on 2026-11-18, R-221,
// temp/watch_2026-11-17/mockups/out/4_design_unique.png), on atome's softened wallpaper: the tiles of Activité, a level at a
// time, one tile in the middle, the crown or a swipe passing to the next (É1, É2); the card the iPhone shows or runs, laid as pages
// (WatchCardScreen.swift); « Ouvre eVe sur ton iPhone » while the iPhone is out of reach (decision 7). A card the iPhone opens
// or starts shows here at once; a swipe from the left edge leaves it on the watch only, the iPhone keeping it. A question the iPhone's card asks before
// its session (the agreement to record the motion) is answered there: the iPhone screen says so meanwhile.
struct WatchRootView: View {
    @ObservedObject var link: WatchLink
    @State private var path: [WatchTile] = []
    // The card left on the watch by its Back (kind, id, whether a session runs): the same card comes back only when it changes.
    @State private var left = ""

    var body: some View {
        ZStack {
            if let catalog = link.catalog, let wallpaper = link.wallpaper, link.reachable {
                WatchWallpaper(image: wallpaper)
                if let card = link.model?.card, let asking = card.asking {
                    WatchPhoneScreen(text: asking)
                } else if let card = link.model?.card, Self.key(card) != left {
                    WatchCardScreen(card: card, link: link, theme: catalog.theme) { left = Self.key(card) }
                } else {
                    tiles(catalog)
                }
            } else {
                // Before any catalog the watch has no ground of its own yet: the screen stays black until the page sends one.
                if let wallpaper = link.wallpaper { WatchWallpaper(image: wallpaper) } else { Color.black }
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

// A level of tiles: one tile whole in the middle, its neighbours out of sight; the crown or a sideways swipe moves along, a touch
// enters; a swipe from the left edge goes back up a level.
struct WatchTilesScreen: View {
    let title: String
    let tiles: [WatchTile]
    @ObservedObject var link: WatchLink
    let theme: WatchTheme
    let back: (() -> Void)?
    let choose: (WatchTile) -> Void
    @State private var shown: String?
    @State private var crown: Double = 0
    // Room around the tile for its drop shadow, inside the scroll view that hides the neighbours.
    private static let shadowRoom: CGFloat = 12

    var body: some View {
        GeometryReader { geometry in
            let side = theme.metric("tile"), page = side + 2 * Self.shadowRoom
            ZStack(alignment: .topLeading) {
                WatchTitle(text: title, theme: theme)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(tiles) { tile in
                            Button { choose(tile) } label: {
                                WatchTileView(label: tile.label, picture: link.pictures[tile.picture], theme: theme)
                            }
                            .buttonStyle(.plain)
                            .frame(width: page, height: page)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $shown)
                .frame(width: page, height: page)
                .clipped()
                .position(x: geometry.size.width / 2, y: WatchFrame.y(46, geometry.size) + side / 2)
                .focusable()
                .digitalCrownRotation($crown, from: 0, through: Double(max(0, tiles.count - 1)), by: 1, sensitivity: .low, isContinuous: false,
                                       isHapticFeedbackEnabled: true)
                WatchBand(link: link, theme: theme)
                if let back { WatchEdgeBack(action: back) }
            }
            .onChange(of: crown) { _, turned in
                let index = Int(turned.rounded())
                if tiles.indices.contains(index), shown != tiles[index].id { withAnimation { shown = tiles[index].id } }
            }
            .onChange(of: shown) { _, id in
                if let index = tiles.firstIndex(where: { $0.id == id }), Int(crown.rounded()) != index { crown = Double(index) }
            }
            .onChange(of: tiles) { _, fresh in shown = fresh.first?.id; crown = 0 }
        }
    }
}

// The ground of every screen: atome's wallpaper as the page painted it (softened, veiled), covering the screen.
struct WatchWallpaper: View {
    let image: UIImage
    var body: some View {
        // An overlay on the screen's own frame: the covering image never widens the screens laid over it.
        Color.clear.overlay(Image(uiImage: image).resizable().scaledToFill()).clipped().ignoresSafeArea()
    }
}

// The iPhone is needed (V1): its glyph and, once eVe has said it, its words.
struct WatchPhoneScreen: View {
    let text: String?
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "iphone").font(.system(size: 40, weight: .light))
            if let text { Text(text).font(.system(size: WatchText.base, weight: .semibold)).multilineTextAlignment(.center) }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, WatchFrame.inset)
    }
}

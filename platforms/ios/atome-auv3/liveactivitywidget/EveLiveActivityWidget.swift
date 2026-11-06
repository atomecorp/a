import ActivityKit
import SwiftUI
import WidgetKit

// The widget extension of eVe: its Live Activity alone (lot D13). The lock screen shows the card on the panels' glass; the
// Dynamic Island the small disc and the session's time (compact), the disc alone when another activity shares the island
// (minimal), the card on the island's black (expanded). A touch elsewhere than Pause or Stop opens eVe.
@main
struct EveLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        EveSessionLiveActivity()
    }
}

struct EveSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EveSessionAttributes.self) { context in
            EveSessionCard(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(context.state.theme.color("card"))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let theme = context.state.theme, small = theme.metric("discSmall")
            return DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    EveSessionCard(attributes: context.attributes, state: context.state)
                }
            } compactLeading: {
                EveSessionDisc(theme: theme, state: context.state, side: small, figureStep: "text0", word: false)
            } compactTrailing: {
                EveSessionCompactTime(theme: theme, state: context.state)
            } minimal: {
                EveSessionDisc(theme: theme, state: context.state, side: small, figureStep: "text0", word: false)
            }
        }
    }
}

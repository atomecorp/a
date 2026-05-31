#[cfg(feature = "bevy_backend")]
use bevy::prelude::Resource;
#[cfg(feature = "bevy_backend")]
use core::time::Duration;
#[cfg(feature = "bevy_backend")]
use std::env;

pub const ATOME_POWER_PROFILE_ENV: &str = "ATOME_POWER_PROFILE";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtomePowerProfile {
    Eco,
    Balanced,
    Performance,
}

impl Default for AtomePowerProfile {
    fn default() -> Self {
        Self::Eco
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtomeRenderActivity {
    Idle,
    Interaction,
    Animation,
    Resize,
    ExternalStateChange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtomeUpdateMode {
    Continuous,
    Reactive { wait: Duration },
}

impl AtomeUpdateMode {
    pub fn reactive(wait: Duration) -> Self {
        Self::Reactive { wait }
    }

    pub fn reactive_low_power(wait: Duration) -> Self {
        Self::Reactive { wait }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AtomeWinitSettings {
    pub focused_mode: AtomeUpdateMode,
    pub unfocused_mode: AtomeUpdateMode,
}

impl AtomeWinitSettings {
    pub fn desktop_app() -> Self {
        Self {
            focused_mode: AtomeUpdateMode::reactive_low_power(Duration::from_secs(5)),
            unfocused_mode: AtomeUpdateMode::reactive_low_power(Duration::from_secs(60)),
        }
    }

    pub fn game() -> Self {
        Self {
            focused_mode: AtomeUpdateMode::Continuous,
            unfocused_mode: AtomeUpdateMode::Continuous,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtomePresentMode {
    AutoVsync,
    AutoNoVsync,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AtomeRedrawCause {
    AtomeStateChanged,
    PositionChanged,
    ResizeChanged,
    ThemeChanged,
    TextChanged,
    LayerChanged,
    InteractionFrame,
    AnimationFrame,
    ExternalEvent,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct AtomeRequestRedraw;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AtomeRedrawRequest {
    pub cause: AtomeRedrawCause,
    pub atome_id: Option<String>,
    pub interaction_session_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AtomeTransformWriteTrace {
    pub timestamp_ms: u128,
    pub frame_id: u64,
    pub atom_id: String,
    pub writer_system: String,
    pub old_position: [f32; 2],
    pub new_position: [f32; 2],
    pub cause: AtomeRedrawCause,
    pub interaction_session_id: Option<String>,
    pub power_profile: AtomePowerProfile,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
#[cfg_attr(feature = "bevy_backend", derive(Resource))]
pub struct AtomeFrameCounter {
    pub updates: u64,
    pub renders: u64,
    pub redraw_requests: u64,
}

impl AtomeFrameCounter {
    pub fn record_update(&mut self) {
        self.updates = self.updates.saturating_add(1);
    }

    pub fn record_render(&mut self) {
        self.renders = self.renders.saturating_add(1);
    }

    pub fn record_redraw_request(&mut self) {
        self.redraw_requests = self.redraw_requests.saturating_add(1);
    }
}

#[cfg(feature = "bevy_backend")]
#[derive(Resource)]
pub struct AtomeBevyPowerState {
    pub profile: AtomePowerProfile,
    pub activity: AtomeRenderActivity,
    pub pending_redraws: Vec<AtomeRedrawRequest>,
}

#[cfg(feature = "bevy_backend")]
impl Default for AtomeBevyPowerState {
    fn default() -> Self {
        Self {
            profile: AtomePowerProfile::default(),
            activity: AtomeRenderActivity::Idle,
            pending_redraws: Vec::new(),
        }
    }
}

pub fn parse_atome_power_profile(value: &str) -> Result<AtomePowerProfile, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "eco" => Ok(AtomePowerProfile::Eco),
        "balanced" => Ok(AtomePowerProfile::Balanced),
        "performance" => Ok(AtomePowerProfile::Performance),
        other => Err(format!(
            "Unsupported Atome power profile '{other}'. Expected eco, balanced, or performance."
        )),
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_power_profile_from_env() -> Result<AtomePowerProfile, String> {
    match env::var(ATOME_POWER_PROFILE_ENV) {
        Ok(value) => parse_atome_power_profile(&value),
        Err(env::VarError::NotPresent) => Ok(AtomePowerProfile::default()),
        Err(env::VarError::NotUnicode(_)) => Err(format!(
            "{ATOME_POWER_PROFILE_ENV} must be valid unicode containing eco, balanced, or performance."
        )),
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_eco_winit_settings() -> AtomeWinitSettings {
    AtomeWinitSettings {
        focused_mode: AtomeUpdateMode::reactive_low_power(Duration::from_secs(5)),
        unfocused_mode: AtomeUpdateMode::reactive_low_power(Duration::from_secs(60)),
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_balanced_winit_settings() -> AtomeWinitSettings {
    AtomeWinitSettings::desktop_app()
}

#[cfg(feature = "bevy_backend")]
pub fn atome_performance_winit_settings() -> AtomeWinitSettings {
    AtomeWinitSettings::game()
}

#[cfg(feature = "bevy_backend")]
pub fn atome_interactive_winit_settings(profile: AtomePowerProfile) -> AtomeWinitSettings {
    let unfocused_mode = match profile {
        AtomePowerProfile::Eco => AtomeUpdateMode::reactive_low_power(Duration::from_secs(60)),
        AtomePowerProfile::Balanced | AtomePowerProfile::Performance => {
            atome_balanced_winit_settings().unfocused_mode
        }
    };

    AtomeWinitSettings {
        focused_mode: AtomeUpdateMode::reactive(Duration::from_secs_f64(1.0 / 60.0)),
        unfocused_mode,
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_winit_settings_for_profile(profile: AtomePowerProfile) -> AtomeWinitSettings {
    match profile {
        AtomePowerProfile::Eco => atome_eco_winit_settings(),
        AtomePowerProfile::Balanced => atome_balanced_winit_settings(),
        AtomePowerProfile::Performance => atome_performance_winit_settings(),
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_winit_settings_for_activity(
    profile: AtomePowerProfile,
    activity: AtomeRenderActivity,
) -> AtomeWinitSettings {
    match activity {
        AtomeRenderActivity::Idle | AtomeRenderActivity::ExternalStateChange => {
            atome_winit_settings_for_profile(profile)
        }
        AtomeRenderActivity::Interaction
        | AtomeRenderActivity::Animation
        | AtomeRenderActivity::Resize => atome_interactive_winit_settings(profile),
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_present_mode_for_profile(profile: AtomePowerProfile) -> AtomePresentMode {
    match profile {
        AtomePowerProfile::Eco | AtomePowerProfile::Balanced => AtomePresentMode::AutoVsync,
        AtomePowerProfile::Performance => AtomePresentMode::AutoNoVsync,
    }
}

#[cfg(feature = "bevy_backend")]
pub fn apply_atome_power_activity(
    settings: &mut AtomeWinitSettings,
    profile: AtomePowerProfile,
    activity: AtomeRenderActivity,
) {
    *settings = atome_winit_settings_for_activity(profile, activity);
}

#[cfg(feature = "bevy_backend")]
pub fn request_atome_redraw(
    state: &mut AtomeBevyPowerState,
    counter: &mut AtomeFrameCounter,
    request: AtomeRedrawRequest,
) -> AtomeRequestRedraw {
    state.pending_redraws.push(request);
    counter.record_redraw_request();
    AtomeRequestRedraw
}

pub fn should_write_transform(activity: AtomeRenderActivity, dirty: bool) -> bool {
    dirty && !matches!(activity, AtomeRenderActivity::Idle)
}

pub fn trace_is_idle_mutation(trace: &AtomeTransformWriteTrace) -> bool {
    trace.old_position != trace.new_position
        && trace.interaction_session_id.is_none()
        && !matches!(
            trace.cause,
            AtomeRedrawCause::AtomeStateChanged
                | AtomeRedrawCause::PositionChanged
                | AtomeRedrawCause::InteractionFrame
                | AtomeRedrawCause::AnimationFrame
        )
}

#[cfg(feature = "bevy_backend")]
pub fn expected_updates_per_minute(mode: AtomeUpdateMode) -> Option<u64> {
    match mode {
        AtomeUpdateMode::Continuous => None,
        AtomeUpdateMode::Reactive { wait } => {
            let wait_ns = wait.as_nanos().max(1);
            Some(((Duration::from_secs(60).as_nanos() + wait_ns - 1) / wait_ns) as u64)
        }
    }
}

#[cfg(all(test, feature = "bevy_backend"))]
mod tests {
    use super::*;

    #[test]
    fn default_power_profile_is_eco_and_not_continuous() {
        assert_eq!(AtomePowerProfile::default(), AtomePowerProfile::Eco);

        let settings = atome_winit_settings_for_profile(AtomePowerProfile::default());

        assert!(!matches!(
            settings.focused_mode,
            AtomeUpdateMode::Continuous
        ));
        assert!(!matches!(
            settings.unfocused_mode,
            AtomeUpdateMode::Continuous
        ));
        assert_eq!(expected_updates_per_minute(settings.focused_mode), Some(12));
        assert_eq!(
            expected_updates_per_minute(settings.unfocused_mode),
            Some(1)
        );
    }

    #[test]
    fn balanced_profile_uses_desktop_app_reactive_policy() {
        let settings = atome_winit_settings_for_profile(AtomePowerProfile::Balanced);

        assert!(!matches!(
            settings.focused_mode,
            AtomeUpdateMode::Continuous
        ));
        assert!(!matches!(
            settings.unfocused_mode,
            AtomeUpdateMode::Continuous
        ));
        assert_eq!(expected_updates_per_minute(settings.focused_mode), Some(12));
        assert_eq!(
            expected_updates_per_minute(settings.unfocused_mode),
            Some(1)
        );
    }

    #[test]
    fn performance_profile_is_opt_in_continuous() {
        let settings = atome_winit_settings_for_profile(AtomePowerProfile::Performance);

        assert!(matches!(settings.focused_mode, AtomeUpdateMode::Continuous));
        assert_eq!(
            atome_present_mode_for_profile(AtomePowerProfile::Performance),
            AtomePresentMode::AutoNoVsync
        );
    }

    #[test]
    fn default_present_mode_is_vsync_capped() {
        assert_eq!(
            atome_present_mode_for_profile(AtomePowerProfile::Eco),
            AtomePresentMode::AutoVsync
        );
        assert_eq!(
            atome_present_mode_for_profile(AtomePowerProfile::Balanced),
            AtomePresentMode::AutoVsync
        );
    }

    #[test]
    fn interaction_temporarily_raises_update_budget_then_returns_idle() {
        let mut settings = atome_winit_settings_for_profile(AtomePowerProfile::Eco);

        apply_atome_power_activity(
            &mut settings,
            AtomePowerProfile::Eco,
            AtomeRenderActivity::Interaction,
        );
        assert_eq!(
            expected_updates_per_minute(settings.focused_mode),
            Some(3600)
        );

        apply_atome_power_activity(
            &mut settings,
            AtomePowerProfile::Eco,
            AtomeRenderActivity::Idle,
        );
        assert_eq!(expected_updates_per_minute(settings.focused_mode), Some(12));
    }

    #[test]
    fn redraw_requests_are_explicit_and_counted() {
        let mut state = AtomeBevyPowerState::default();
        let mut counter = AtomeFrameCounter::default();
        let redraw = request_atome_redraw(
            &mut state,
            &mut counter,
            AtomeRedrawRequest {
                cause: AtomeRedrawCause::PositionChanged,
                atome_id: Some("shape_1".to_string()),
                interaction_session_id: Some("drag_1".to_string()),
            },
        );

        let _message: AtomeRequestRedraw = redraw;
        assert_eq!(counter.redraw_requests, 1);
        assert_eq!(state.pending_redraws.len(), 1);
    }

    #[test]
    fn idle_transform_writes_are_rejected_without_dirty_cause() {
        assert!(!should_write_transform(AtomeRenderActivity::Idle, true));
        assert!(!should_write_transform(
            AtomeRenderActivity::Interaction,
            false
        ));
        assert!(should_write_transform(
            AtomeRenderActivity::Interaction,
            true
        ));
    }

    #[test]
    fn transform_trace_flags_ghost_idle_position_changes() {
        let trace = AtomeTransformWriteTrace {
            timestamp_ms: 42,
            frame_id: 7,
            atom_id: "shape_1".to_string(),
            writer_system: "delayed_timer".to_string(),
            old_position: [10.0, 10.0],
            new_position: [20.0, 10.0],
            cause: AtomeRedrawCause::ExternalEvent,
            interaction_session_id: None,
            power_profile: AtomePowerProfile::Eco,
        };

        assert!(trace_is_idle_mutation(&trace));
    }

    #[test]
    fn power_profile_parser_accepts_known_profiles_and_rejects_unknown_values() {
        assert_eq!(parse_atome_power_profile("eco"), Ok(AtomePowerProfile::Eco));
        assert_eq!(
            parse_atome_power_profile("balanced"),
            Ok(AtomePowerProfile::Balanced)
        );
        assert_eq!(
            parse_atome_power_profile("performance"),
            Ok(AtomePowerProfile::Performance)
        );
        assert!(parse_atome_power_profile("game").is_err());
    }
}

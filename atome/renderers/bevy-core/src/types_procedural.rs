use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub struct AtomeProceduralSdf {
    pub morph: [f32; 4],
    #[serde(default)]
    pub phase: f32,
    #[serde(default)]
    pub pulse: f32,
    #[serde(default)]
    pub time: f32,
    #[serde(default)]
    pub intensity: f32,
    #[serde(default = "default_reveal")]
    pub glow_reveal: f32,
    #[serde(default = "default_reveal")]
    pub core_reveal: f32,
    #[serde(default = "default_reveal")]
    pub shell_reveal: f32,
    #[serde(default)]
    pub disappearing: f32,
    #[serde(default)]
    pub contact: [f32; 2],
    #[serde(default)]
    pub attraction: f32,
    #[serde(default)]
    pub stretch: f32,
    #[serde(default)]
    pub gesture_velocity: f32,
    #[serde(default)]
    pub destructive_direction: [f32; 2],
    #[serde(default)]
    pub destructive_mode: f32,
    #[serde(default)]
    pub destructive_progress: f32,
    #[serde(default)]
    pub cut_path: [f32; 8],
    #[serde(default = "default_surface_size")]
    pub surface_size: [f32; 2],
    #[serde(default)]
    pub assistant_center: [f32; 2],
    #[serde(default = "default_assistant_size")]
    pub assistant_size: f32,
}

fn default_reveal() -> f32 { 1.0 }
fn default_surface_size() -> [f32; 2] { [1.0, 1.0] }
fn default_assistant_size() -> f32 { 1.0 }
fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() { value } else { fallback }
}

impl AtomeProceduralSdf {
    pub fn normalized(self) -> Self {
        Self {
            morph: [
                finite_or(self.morph[0], 1.0).clamp(0.55, 1.45),
                finite_or(self.morph[1], 1.0).clamp(0.55, 1.45),
                finite_or(self.morph[2], 0.0).clamp(-1.0, 1.0),
                finite_or(self.morph[3], 0.0).clamp(-1.0, 1.0),
            ],
            phase: finite_or(self.phase, 0.0).clamp(0.0, 5.0),
            pulse: finite_or(self.pulse, 0.0).clamp(-0.06, 0.06),
            time: finite_or(self.time, 0.0).max(0.0),
            intensity: finite_or(self.intensity, 0.0).clamp(0.0, 1.0),
            glow_reveal: finite_or(self.glow_reveal, 1.0).clamp(0.0, 1.0),
            core_reveal: finite_or(self.core_reveal, 1.0).clamp(0.0, 1.0),
            shell_reveal: finite_or(self.shell_reveal, 1.0).clamp(0.0, 1.015),
            disappearing: finite_or(self.disappearing, 0.0).clamp(0.0, 1.0),
            contact: [
                finite_or(self.contact[0], 0.0).clamp(-1.5, 1.5),
                finite_or(self.contact[1], 0.0).clamp(-1.5, 1.5),
            ],
            attraction: finite_or(self.attraction, 0.0).clamp(0.0, 0.8),
            stretch: finite_or(self.stretch, 0.0).clamp(0.0, 1.0),
            gesture_velocity: finite_or(self.gesture_velocity, 0.0).clamp(0.0, 1.0),
            destructive_direction: [
                finite_or(self.destructive_direction[0], 0.0).clamp(-1.0, 1.0),
                finite_or(self.destructive_direction[1], 0.0).clamp(-1.0, 1.0),
            ],
            destructive_mode: finite_or(self.destructive_mode, 0.0).clamp(0.0, 2.0),
            destructive_progress: finite_or(self.destructive_progress, 0.0).clamp(0.0, 1.0),
            cut_path: self.cut_path.map(|value| finite_or(value, 0.0).clamp(-2.0, 2.0)),
            surface_size: [
                finite_or(self.surface_size[0], 1.0).max(1.0),
                finite_or(self.surface_size[1], 1.0).max(1.0),
            ],
            assistant_center: [
                finite_or(self.assistant_center[0], 0.5),
                finite_or(self.assistant_center[1], 0.5),
            ],
            assistant_size: finite_or(self.assistant_size, 1.0).max(1.0),
        }
    }
}

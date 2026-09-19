use serde::Deserialize;

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
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
    #[serde(default)]
    pub listening_rms: f32,
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
    #[serde(default = "default_surface_size")]
    pub surface_size: [f32; 2],
    #[serde(default)]
    pub assistant_center: [f32; 2],
    #[serde(default = "default_assistant_size")]
    pub assistant_size: f32,
    #[serde(default = "default_assistant_blur")]
    pub background_blur_px: f32,
    #[serde(default = "default_assistant_refraction")]
    pub lens_refraction_px: f32,
    #[serde(default)]
    pub assistant_background_tint: [f32; 4],
    #[serde(default)]
    pub mode: f32,
    #[serde(default)]
    pub flower_count: f32,
    #[serde(default)]
    pub flower_core_radius: f32,
    #[serde(default)]
    pub flower_bridge_width: f32,
    #[serde(default = "default_flower_edge_softness")]
    pub flower_edge_softness: f32,
    #[serde(default)]
    pub flower_tint: [f32; 4],
    #[serde(default)]
    // 16 et non 8 : les 8 premiers portent le contrat flower/assistant
    // historique, les suivants les arcs de lumiere du mode goutte d'eau.
    pub flower_petals: [[f32; 4]; 24],
    // Les GOUTTES du mode liquide, separees du style a dessein : `flower_petals`
    // porte le style PARTAGE par toutes les gouttes, `liquid_drops` la geometrie
    // PROPRE a chacune — `[centreX, centreY, diametre, enfoncement]`.
    // Deux tableaux plutot qu'un seul de 48 : serde et Default ne s'implementent
    // que jusqu'a 32 elements, et la separation dit d'elle-meme ce qui est partage.
    #[serde(default)]
    pub liquid_drops: [[f32; 4]; 24],
    // Forme de chaque goutte : `[hauteur, rayon des coins, genre, -]`.
    // Genre 0 = disque (seul `liquid_drops[i].z`, le diametre, compte) ;
    // genre 1 = rectangle arrondi (la largeur reste `liquid_drops[i].z`).
    // Tout a zero = disque, donc le contrat existant ne bouge pas.
    #[serde(default)]
    pub liquid_drop_shapes: [[f32; 4]; 24],
    #[serde(default)]
    pub liquid_drop_count: f32,
    // The MYSTIC TILES, deliberately kept apart from the style: `mystic_tiles`
    // carries the geometry OWNED by each one — `[centerX, centerY, half side, corner
    // radius]` —, `mystic_tile_motion` its flip `[progress, axis, direction,
    // -]`, and `mystic_tile_colors` the family of the tile it reached
    // `[R, G, B, dose]`. Three arrays rather than one of 48: for the same reason as
    // the drops, the split states by itself what belongs to the tile alone.
    #[serde(default)]
    pub mystic_tiles: [[f32; 4]; 24],
    #[serde(default)]
    pub mystic_tile_motion: [[f32; 4]; 24],
    #[serde(default)]
    pub mystic_tile_colors: [[f32; 4]; 24],
    // `[tile count, hole dose, shadow blur, -]`. The hole is the menu plate laid
    // flat in the cell a turning tile leaves behind; the dose is how opaque it is.
    #[serde(default)]
    pub mystic_count: [f32; 4],
    // `[perspective in tiles, rim thickness, rim dose, edge softness
    // in pixels]`.
    #[serde(default)]
    pub mystic_style: [f32; 4],
}

fn default_reveal() -> f32 { 1.0 }
fn default_surface_size() -> [f32; 2] { [1.0, 1.0] }
fn default_assistant_size() -> f32 { 1.0 }
fn default_assistant_blur() -> f32 { 48.0 }
fn default_assistant_refraction() -> f32 { 24.0 }
fn default_flower_edge_softness() -> f32 { 1.0 }
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
            listening_rms: finite_or(self.listening_rms, 0.0).clamp(0.0, 1.0),
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
            surface_size: [
                finite_or(self.surface_size[0], 1.0).max(1.0),
                finite_or(self.surface_size[1], 1.0).max(1.0),
            ],
            assistant_center: [
                finite_or(self.assistant_center[0], 0.5),
                finite_or(self.assistant_center[1], 0.5),
            ],
            assistant_size: finite_or(self.assistant_size, 1.0).max(1.0),
            background_blur_px: finite_or(self.background_blur_px, 48.0).clamp(0.0, 128.0),
            lens_refraction_px: finite_or(self.lens_refraction_px, 24.0).clamp(0.0, 128.0),
            assistant_background_tint: self.assistant_background_tint.map(|value| finite_or(value, 0.0).clamp(0.0, 1.0)),
            // 0 = assistant, 1 = flower liquide, 2 = goutte « design Claude »,
            // 3-4 reserves aux versions de design suivantes (procedural_sdf.wgsl).
            mode: finite_or(self.mode, 0.0).clamp(0.0, 4.0),
            flower_count: finite_or(self.flower_count, 0.0).clamp(0.0, 8.0),
            flower_core_radius: finite_or(self.flower_core_radius, 0.0).max(0.0),
            flower_bridge_width: finite_or(self.flower_bridge_width, 0.0).max(0.0),
            flower_edge_softness: finite_or(self.flower_edge_softness, 1.0).clamp(0.5, 4.0),
            flower_tint: [
                finite_or(self.flower_tint[0], 0.0).clamp(0.0, 1.0),
                finite_or(self.flower_tint[1], 0.0).clamp(0.0, 1.0),
                finite_or(self.flower_tint[2], 0.0).clamp(0.0, 1.0),
                finite_or(self.flower_tint[3], 0.0).clamp(0.0, 1.0),
            ],
            liquid_drops: self.liquid_drops.map(|drop| [
                finite_or(drop[0], 0.0),
                finite_or(drop[1], 0.0),
                finite_or(drop[2], 0.0).max(0.0),
                finite_or(drop[3], 0.0).clamp(0.0, 1.0),
            ]),
            liquid_drop_shapes: self.liquid_drop_shapes.map(|shape| [
                finite_or(shape[0], 0.0).max(0.0),
                finite_or(shape[1], 0.0).max(0.0),
                finite_or(shape[2], 0.0).clamp(0.0, 1.0),
                finite_or(shape[3], 0.0),
            ]),
            liquid_drop_count: finite_or(self.liquid_drop_count, 0.0).clamp(0.0, 24.0),
            // One mystic tile: its box, its flip and its family. The cap
            // is the same as the shader's, so an extra tile is ignored
            // rather than written past the array.
            mystic_tiles: self.mystic_tiles.map(|tile| [
                finite_or(tile[0], 0.0),
                finite_or(tile[1], 0.0),
                finite_or(tile[2], 0.0).max(0.0),
                finite_or(tile[3], 0.0).max(0.0),
            ]),
            mystic_tile_motion: self.mystic_tile_motion.map(|motion| [
                finite_or(motion[0], 0.0).clamp(0.0, 1.0),
                finite_or(motion[1], 0.0).clamp(0.0, 1.0),
                if finite_or(motion[2], 1.0) < 0.0 { -1.0 } else { 1.0 },
                finite_or(motion[3], 0.0),
            ]),
            mystic_tile_colors: self.mystic_tile_colors.map(|color| [
                finite_or(color[0], 0.0).clamp(0.0, 1.0),
                finite_or(color[1], 0.0).clamp(0.0, 1.0),
                finite_or(color[2], 0.0).clamp(0.0, 1.0),
                finite_or(color[3], 0.0).clamp(0.0, 1.0),
            ]),
            mystic_count: [
                finite_or(self.mystic_count[0], 0.0).clamp(0.0, 24.0),
                finite_or(self.mystic_count[1], 0.0).clamp(0.0, 1.0),
                finite_or(self.mystic_count[2], 0.0).clamp(0.0, 64.0),
                0.0,
            ],
            mystic_style: [
                finite_or(self.mystic_style[0], 2.5).clamp(0.5, 8.0),
                finite_or(self.mystic_style[1], 1.2).clamp(0.0, 8.0),
                finite_or(self.mystic_style[2], 0.5).clamp(0.0, 1.0),
                finite_or(self.mystic_style[3], 0.6).clamp(0.25, 8.0),
            ],
            flower_petals: self.flower_petals.map(|petal| [
                finite_or(petal[0], 0.0),
                finite_or(petal[1], 0.0),
                finite_or(petal[2], 0.0).max(0.0),
                finite_or(petal[3], 0.0).clamp(0.0, 1.0),
            ]),
        }
    }
}

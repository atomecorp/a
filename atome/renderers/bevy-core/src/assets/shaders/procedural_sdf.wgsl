#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct ProceduralSdfUniform {
    morph: vec4<f32>,
    dynamics: vec4<f32>,
    transition: vec4<f32>,
    optics: vec4<f32>,
    contact: vec4<f32>,
    destructive: vec4<f32>,
    gesture: vec4<f32>,
    geometry: vec4<f32>,
    shape: vec4<f32>,
    flower: vec4<f32>,
    flower_tint: vec4<f32>,
    assistant_background_tint: vec4<f32>,
    flower_petals: array<vec4<f32>, 8>,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> material: ProceduralSdfUniform;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var original_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var original_sampler: sampler;
@group(#{MATERIAL_BIND_GROUP}) @binding(3) var blurred_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(4) var blurred_sampler: sampler;

fn sd_ellipse(point: vec2<f32>, radius: vec2<f32>) -> f32 {
    let scaled = point / radius;
    return (length(scaled) - 1.0) * min(radius.x, radius.y);
}

fn organic_core(point: vec2<f32>, morph: vec4<f32>, time: f32) -> f32 {
    let drift = vec2(sin(time * 0.71) * 0.014, cos(time * 0.53) * 0.010);
    let shifted = point - vec2(drift.x, 0.09 + morph.w * 0.16 + drift.y);
    let angle = atan2(shifted.y, shifted.x);
    let ripple = sin(angle * 3.0 + time * 0.72) * 0.022
        + cos(angle * 2.0 - time * 0.47) * 0.016;
    let radius = vec2(0.31 * morph.x, 0.34 * morph.y);
    return sd_ellipse(shifted, radius) - ripple - morph.z * 0.025;
}

fn gaussian_tail(distance: f32, sigma: f32) -> f32 {
    let normalized = max(distance, 0.0) / max(sigma, 0.0001);
    return exp(-0.5 * normalized * normalized);
}

fn sd_capsule(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>, radius: f32) -> f32 {
    let segment = end - start;
    let denominator = max(dot(segment, segment), 0.0001);
    let projection = clamp(dot(point - start, segment) / denominator, 0.0, 1.0);
    return length(point - (start + segment * projection)) - radius;
}

fn smooth_union(left: f32, right: f32, radius: f32) -> f32 {
    let safe_radius = max(radius, 0.0001);
    let blend = clamp(0.5 + 0.5 * (right - left) / safe_radius, 0.0, 1.0);
    return mix(right, left, blend) - safe_radius * blend * (1.0 - blend);
}

fn flower_liquid(pixel_position: vec2<f32>, screen_uv: vec2<f32>) -> vec4<f32> {
    let center = material.geometry.zw;
    let core_radius = material.flower.z;
    let bridge_width = material.flower.w;
    let edge_softness = max(material.shape.y, 0.5);
    var distance = 100000.0;
    if core_radius > 0.01 {
        distance = length(pixel_position - center) - core_radius;
    }
    for (var index = 0u; index < 8u; index = index + 1u) {
        if f32(index) >= material.flower.y { break; }
        let petal = material.flower_petals[index];
        if petal.w <= 0.001 { continue; }
        let direction = petal.xy - center;
        let distance_to_petal = max(length(direction), 0.001);
        let axis = direction / distance_to_petal;
        let capsule_start = center + axis * min(core_radius * 0.35, distance_to_petal * 0.12);
        let capsule_end = petal.xy - axis * max(petal.z * 0.55, 1.0);
        let link_radius = bridge_width * clamp(petal.w * 2.4, 0.0, 1.0);
        let capsule = sd_capsule(pixel_position, capsule_start, capsule_end, link_radius);
        distance = smooth_union(distance, capsule, max(2.0, link_radius * 0.72));
    }
    let mask = 1.0 - smoothstep(-edge_softness, edge_softness, distance);
    if mask < 0.002 { discard; }
    let original_color = textureSample(original_texture, original_sampler, screen_uv).rgb;
    let blurred_color = textureSample(blurred_texture, blurred_sampler, screen_uv).rgb;
    let glass = mix(original_color, blurred_color, 0.88);
    let tint_amount = clamp(material.flower_tint.a, 0.0, 1.0);
    let color = mix(glass, material.flower_tint.rgb, tint_amount);
    let alpha = mask * tint_amount;
    return vec4(color, alpha);
}

// --- WATER DROP (design Claude) — début -----------------------------------
// Branche de design ISOLEE, selectionnee par `material.flower.x` (mode) > 1.5.
// Elle ne partage aucun etat avec la branche assistant (mode 0) ni avec
// `flower_liquid` (mode 1) : supprimer ce bloc et sa ligne d'aiguillage dans
// `fragment` suffit a la retirer entierement.
//
// Regle du bloc : AUCUN nombre de design ici. Chaque reglage arrive par un
// uniforme, pour que l'iteration de rendu se fasse en JS sans rebuild du wasm
// (un changement de ce fichier invalide le crate via `include_str!`). Seuls
// restent des facteurs de forme mathematiques, tous modules par un uniforme.
//
// La correspondance slot <-> token de design est la table §2 de
// eVe/intuition/water_drop/water_drop_claude_design.js. Les noms de champs du
// contrat `procedural_sdf` sont ceux de l'assistant ; en mode 2 ils portent une
// autre semantique, et cette table est la seule source de verite.
//
// Rappel verifie : `optics.y/z/w` viennent de la ressource Bevy
// `AssistantOpticsSettings` et NON du JS (procedural_sdf.rs:165-170, seul
// `optics.x` est reecrit). Ce bloc ne les lit donc jamais : le mix de verre et
// la bande de refraction passent par `transition.x` et `transition.y`.

// Rayon canonique de la coque dans le repere normalise, partage avec la branche
// assistant pour que `assistant_size` signifie le meme diametre dans tous les modes.
const WATER_DROP_SHELL_RADIUS: f32 = 0.84;
const WATER_DROP_TAU: f32 = 6.2831853;

fn water_drop_rotate(point: vec2<f32>, angle: f32) -> vec2<f32> {
    let cosine = cos(angle);
    let sine = sin(angle);
    return vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
}

// Un reflet speculaire credible n'est pas une ellipse floue : c'est un noyau NET
// qui garde un bord franc, plus une diffusion large et faible autour. D'ou la
// puissance appliquee a la gaussienne (`exponent`), qui resserre le noyau sans
// le retrecir, et le `bloom` separe qui porte la diffusion.
fn water_drop_specular(point: vec2<f32>, spec: vec4<f32>, rotation: f32, sharpness: f32) -> f32 {
    let local = water_drop_rotate(point - spec.xy, rotation) / max(spec.zw, vec2(0.0001));
    let squared = dot(local, local);
    let exponent = mix(1.6, 16.0, clamp(sharpness, 0.0, 1.0));
    let core = pow(exp(-squared), exponent);
    let bloom = exp(-squared * 0.28) * 0.20;
    return core + bloom;
}

fn water_drop_claude(pixel_position: vec2<f32>, screen_uv: vec2<f32>) -> vec4<f32> {
    let center = material.geometry.zw;
    let diameter = max(material.shape.x, 1.0);
    let half_diameter = diameter * 0.5;
    let reveal = clamp(material.transition.z, 0.0, 1.015);
    let fade = 1.0 - clamp(material.transition.w, 0.0, 1.0);

    // 1. Repere normalise : rayon 1.0 == moitie du diametre demande.
    var point = (pixel_position - center) / half_diameter;

    // 2. Deformation de contact — reprise de la branche assistant (l. 132-137).
    //    Le doigt ENFONCE la surface liquide au lieu de scaler un bouton :
    //    creux gaussien local sous le contact, puis etirement directionnel.
    let contact_point = material.contact.xy;
    let attraction = clamp(material.contact.z, 0.0, 0.8);
    let stretch = clamp(material.contact.w, 0.0, 1.0);
    let contact_delta = point - contact_point;
    let contact_falloff = exp(-dot(contact_delta, contact_delta) * 2.6);
    let contact_direction = normalize(contact_point + vec2(0.0001));
    point -= contact_direction * attraction * contact_falloff * (0.18 + stretch * 0.28);
    let directional_position = dot(point, contact_direction);
    point -= contact_direction * directional_position * stretch * 0.16;

    // 3. Coque : squash `morph.xy`, respiration `dynamics.y`, echelle d'ouverture.
    let squash = vec2(
        clamp(material.morph.x, 0.55, 1.45),
        clamp(material.morph.y, 0.55, 1.45)
    );
    let breathe = 1.0 + clamp(material.dynamics.y, -0.06, 0.06);
    let shell_point = point / (squash * breathe * max(reveal, 0.001));
    let radial = length(shell_point);
    let shell_distance = radial - WATER_DROP_SHELL_RADIUS;
    let angle = atan2(shell_point.y, shell_point.x);
    // `shape.y` (flower_edge_softness) est en pixels : le SDF est normalise.
    let edge_softness = max(material.shape.y, 0.5) / half_diameter;
    let shell_mask = 1.0 - smoothstep(-edge_softness, edge_softness, shell_distance);

    // 4. Fresnel : 0 au centre, 1 au bord de la coque. `flower.y` = exposant.
    let sphere = clamp(radial / WATER_DROP_SHELL_RADIUS, 0.0, 1.0);
    let fresnel = pow(
        clamp(1.0 - sqrt(max(0.0, 1.0 - sphere * sphere)), 0.0, 1.0),
        max(material.flower.y, 0.05)
    );

    // 5. Refraction : la lentille ne devie le fond que dans une bande peripherique,
    //    `transition.y` en fixe le debut (remplace `optics.z`, non pilotable).
    let band_start = clamp(material.transition.y, 0.0, 0.95);
    let band_end = mix(band_start, 1.0, 0.78);
    let refraction_band = smoothstep(band_start, band_end, sphere)
        * (1.0 - smoothstep(0.97, 1.0, sphere));
    let refraction_direction = normalize(shell_point + vec2(0.0001));
    // Taille du workspace en pixels PHYSIQUES : `optics.x` est un decalage en
    // pixels et doit etre divise par elle pour devenir un decalage d'UV.
    let screen_dimensions = max(material.geometry.xy, vec2(1.0)) * max(material.shape.z, 1.0);
    let refraction_uv = refraction_direction
        * material.optics.x
        * refraction_band
        / max(screen_dimensions, vec2(1.0));
    let safe_margin = vec2(material.optics.x + material.optics.x) / max(screen_dimensions, vec2(1.0));
    let refracted_uv = clamp(screen_uv + refraction_uv, safe_margin, vec2(1.0) - safe_margin);

    // 6. Verre : `transition.x` dose le flou (remplace `optics.y`, fige a 1.0
    //    cote Rust — c'est ce qui rend le fond lisible A TRAVERS la goutte).
    let original_color = textureSample(original_texture, original_sampler, refracted_uv).rgb;
    let blurred_color = textureSample(blurred_texture, blurred_sampler, refracted_uv).rgb;
    var glass = mix(original_color, blurred_color, clamp(material.transition.x, 0.0, 1.0));

    // 7. Eclaircissement du fond, en fusion « screen » : `1 - (1-a)(1-b)` remonte
    //    les basses lumieres SANS ecraser le contraste, contrairement a un simple
    //    melange vers le blanc. C'est ce qui rend un contenu sombre lisible
    //    par-dessus n'importe quel fond, meme noir.
    let lift_color = clamp(
        vec3(material.destructive.x, material.destructive.y, material.destructive.z),
        vec3(0.0),
        vec3(1.0)
    );
    // `focus` concentre l'eclaircissement au CENTRE, la ou vit le contenu, et le
    // laisse retomber vers le bord. Un relevement uniforme aplatit tout le disque
    // et la goutte cesse de ressembler a du verre ; concentre, il rend le contenu
    // lisible tout en gardant un pourtour vitreux — et il lit comme une lentille
    // qui concentre la lumiere.
    let lift_focus = clamp(material.flower_petals[3].w, 0.0, 1.0);
    // `falloff` resserre la chute vers le bord. Il ne s'agit pas d'un detail :
    // un reflet speculaire BLANC n'a aucune marge sur une surface deja eclaircie.
    // En concentrant le relevement sous le contenu et en laissant la peripherie
    // sombre, les reflets retrouvent leur contraste — et la goutte redevient
    // transparente la ou on regarde a travers.
    let lift_falloff = mix(1.0, 5.0, clamp(material.flower_petals[6].w, 0.0, 1.0));
    let lift_profile = pow(max(1.0 - sphere * sphere, 0.0), lift_falloff);
    let lift_amount = clamp(material.destructive.w, 0.0, 1.0)
        * mix(1.0, lift_profile, lift_focus);
    glass = mix(glass, vec3(1.0) - (vec3(1.0) - glass) * (vec3(1.0) - lift_color), lift_amount);

    // 8. Teinte du verre, densifiee vers le bord par le Fresnel.
    let tint = material.assistant_background_tint;
    glass = mix(glass, tint.rgb, clamp(tint.a * (1.0 + fresnel), 0.0, 1.0));

    // 9. Liseré d'epaisseur ET d'intensite VARIABLES. Un anneau uniforme lit comme
    //    un trait de contour vectoriel ; une vraie sphere n'accroche la lumiere que
    //    d'un cote. `gesture.y` donne l'angle de la lumiere, `dynamics.x` le nombre
    //    de lobes fins, `dynamics.w` l'amplitude de la variation (0 = uniforme).
    let light_angle = clamp(material.gesture.y, 0.0, 1.0) * WATER_DROP_TAU;
    let rim_lobes = max(material.dynamics.x, 1.0);
    let rim_variation = clamp(material.dynamics.w, 0.0, 1.0);
    let lobe_primary = 0.5 + 0.5 * cos(angle - light_angle);
    let lobe_fine = 0.5 + 0.5 * cos(angle * rim_lobes + light_angle * 2.0);
    let lobe_blend = lobe_primary * 0.72 + lobe_fine * 0.28;
    let rim_profile = mix(1.0, mix(0.20, 1.90, lobe_blend), rim_variation);
    let rim_gain = mix(1.0, mix(0.35, 1.30, lobe_blend), rim_variation);
    let rim_width = max(material.flower.z, 0.0001) * rim_profile / half_diameter;
    let rim_band = 1.0 - smoothstep(0.0, rim_width, abs(shell_distance));
    let rim_amount = clamp(fresnel * 0.55 + rim_band * 0.95, 0.0, 1.0)
        * clamp(material.morph.z, 0.0, 1.0)
        * rim_gain
        * shell_mask;

    // 10. Irisation : le contour d'une bulle disperse la lumiere et vire en teinte
    //     le long du bord. Deux couleurs melangees par l'angle, dosees par le
    //     Fresnel pour ne vivre QUE sur le bord.
    let iridescence_a = material.flower_petals[5];
    let iridescence_b = material.flower_petals[6];
    let iridescence_shape = material.flower_petals[7];
    let iridescence_blend = 0.5 + 0.5 * sin(angle * iridescence_shape.x + iridescence_shape.y);
    let iridescence_color = mix(
        clamp(iridescence_a.rgb, vec3(0.0), vec3(1.0)),
        clamp(iridescence_b.rgb, vec3(0.0), vec3(1.0)),
        iridescence_blend
    );
    let rim_color = mix(
        material.flower_tint.rgb,
        iridescence_color,
        clamp(iridescence_a.w, 0.0, 1.0) * fresnel
    );

    // 11. Deux reflets speculaires orientes, chacun avec sa nettete et sa taille.
    //     `spec_clip` les eteint juste avant le bord : un reflet qui bave sur le
    //     liseré detruit l'illusion de volume.
    let spec_power = material.flower_petals[2];   // [forceP, forceC, sigmaHalo, netteteP]
    let spec_shape = material.flower_petals[3];   // [rotationP, rotationC, netteteC, libre]
    let spec_color = material.flower_petals[4];   // [R, G, B, dose de couleur]
    let spec_clip = 1.0 - smoothstep(0.80, 1.0, sphere);
    let highlight = (
        water_drop_specular(point, material.flower_petals[0], spec_shape.x, spec_power.w) * spec_power.x
        + water_drop_specular(point, material.flower_petals[1], spec_shape.y, spec_shape.z) * spec_power.y
    ) * clamp(material.morph.w, 0.0, 1.0) * shell_mask * spec_clip;

    // 12. Halo externe diffus. `flower.w` = opacite, `flower_petals[2].z` = sigma.
    let halo = gaussian_tail(max(shell_distance, 0.0), max(spec_power.z, 0.0001))
        * (1.0 - shell_mask)
        * clamp(material.flower.w, 0.0, 1.0);

    // 13. Composition, identique en forme a la branche assistant : on accumule en
    //     premultiplie puis on redivise par l'alpha pour sortir en alpha droit.
    let reveal_alpha = clamp(reveal, 0.0, 1.0) * fade;
    let glass_alpha = shell_mask * reveal_alpha;
    let rim_alpha = rim_amount * reveal_alpha;
    let halo_alpha = halo * reveal_alpha;
    let highlight_alpha = highlight * reveal_alpha;
    let base_alpha = max(max(glass_alpha, rim_alpha), max(halo_alpha, highlight_alpha));
    if base_alpha < 0.002 { discard; }
    var color = glass * glass_alpha;
    color = mix(color, rim_color, rim_alpha * clamp(material.flower_tint.a, 0.0, 1.0));
    color += rim_color * halo_alpha;
    color += mix(vec3(1.0), clamp(spec_color.rgb, vec3(0.0), vec3(1.0)), clamp(spec_color.w, 0.0, 1.0))
        * highlight_alpha;
    let alpha = clamp(base_alpha, 0.0, 1.0);
    return vec4(color / max(alpha, 0.001), alpha);
}
// --- WATER DROP (design Claude) — fin --------------------------------------

@fragment
fn fragment(mesh: VertexOutput) -> @location(0) vec4<f32> {
    let uv = mesh.uv;
    let surface_size = max(material.geometry.xy, vec2(1.0));
    let assistant_center = material.geometry.zw;
    let assistant_size = max(material.shape.x, 1.0);
    let pixel_position = vec2(uv.x * surface_size.x, (1.0 - uv.y) * surface_size.y);
    // Workspace size in physical pixels. Deliberately NOT
    // `textureDimensions(blurred_texture)`: the blur targets are rendered at a
    // reduced resolution, so their size no longer matches the surface. The
    // refraction offset below is a physical-pixel amount and must be divided by
    // the physical surface size to become a UV offset.
    let screen_dimensions = surface_size * max(material.shape.z, 1.0);
    // This material owns one full-workspace quad. Its interpolated UVs map
    // directly to the workspace capture regardless of viewport or DPR.
    let screen_uv = uv;
    // L'ordre compte : `> 1.5` doit passer avant `> 0.5`, sinon le mode 2
    // tomberait dans `flower_liquid`. Voir le bloc WATER DROP ci-dessus.
    if material.flower.x > 1.5 {
        return water_drop_claude(pixel_position, screen_uv);
    }
    if material.flower.x > 0.5 {
        return flower_liquid(pixel_position, screen_uv);
    }
    var point = (pixel_position - assistant_center) / (assistant_size * 0.5);
    let original_point = point;
    let time = material.dynamics.z;
    let pulse = material.dynamics.y;
    let intensity = material.dynamics.w;
    let glow_reveal = clamp(material.transition.x, 0.0, 1.0);
    let core_reveal = clamp(material.transition.y, 0.0, 1.0);
    let shell_reveal = clamp(material.transition.z, 0.0, 1.015);
    let disappearing = clamp(material.transition.w, 0.0, 1.0);
    let contact_point = material.contact.xy;
    let attraction = clamp(material.contact.z, 0.0, 0.8);
    let stretch = clamp(material.contact.w, 0.0, 1.0);
    let gesture_velocity = clamp(material.gesture.x, 0.0, 1.0);
    let listening_rms = clamp(material.gesture.y, 0.0, 1.0);
    let listening_response = smoothstep(0.015, 0.42, listening_rms);
    let destructive_direction = material.destructive.xy;
    let destructive_mode = material.destructive.z;
    let destructive_progress = clamp(material.destructive.w, 0.0, 1.0);
    let destructive_active = destructive_mode > 0.5;
    let destructive_direction_length = max(length(destructive_direction), 0.0001);
    let destructive_axis = destructive_direction / destructive_direction_length;
    var destructive_pull = 0.0;
    let contact_delta = point - contact_point;
    let contact_falloff = exp(-dot(contact_delta, contact_delta) * 2.6);
    let contact_direction = normalize(contact_point + vec2(0.0001));
    point -= contact_direction * attraction * contact_falloff * (0.18 + stretch * 0.28);
    let directional_position = dot(point, contact_direction);
    point -= contact_direction * directional_position * stretch * 0.16;
    if destructive_active {
        let inertial_progress = 1.0 - pow(
            1.0 - destructive_progress,
            mix(1.35, 1.65, gesture_velocity)
        );
        let exit_distance = length(surface_size) / assistant_size + 1.10;
        destructive_pull = smoothstep(0.0, 0.18, destructive_progress)
            * (1.0 - smoothstep(0.88, 0.99, destructive_progress))
            * mix(0.36, 0.60, gesture_velocity);
        point -= destructive_axis * inertial_progress * exit_distance;
        let axial_position = dot(point, destructive_axis);
        let transverse_position = point - destructive_axis * axial_position;
        let axial_scale = 1.0 + destructive_pull;
        let transverse_scale = 1.0 - destructive_pull * 0.12;
        let leading_pull = (smoothstep(-0.84, 0.84, axial_position) - 0.5) * destructive_pull * 0.30;
        point = transverse_position / transverse_scale
            + destructive_axis * (axial_position / axial_scale - leading_pull);
    }
    let shell_shape_reveal = min(shell_reveal, 1.0);
    let shell_scale = mix(0.92, 1.0, shell_shape_reveal) * max(shell_reveal, 0.001);
    let core_scale = mix(0.35, 1.0, core_reveal);
    let core_drop = disappearing * (1.0 - core_reveal) * 0.10;

    let shell_point = point / ((1.0 + pulse * shell_shape_reveal) * shell_scale);
    let shell_angle = atan2(shell_point.y, shell_point.x);
    let listening_contour = listening_response * (sin(shell_angle * 4.0 - time * 7.2) * 0.018
        + cos(shell_angle * 2.0 + time * 4.6) * 0.010);
    let shell_wobble = sin(shell_angle * 3.0 + time * 0.38) * 0.006
        + cos(shell_angle * 2.0 - time * 0.29) * 0.004;
    let shell_distance = length(shell_point) - (0.84 + shell_wobble + listening_contour);
    let shell_mask = 1.0 - smoothstep(-0.018, 0.025, shell_distance);
    let shell_inner = smoothstep(-0.18, -0.025, shell_distance);
    let shell_edge = 1.0 - smoothstep(0.0, 0.065, abs(shell_distance));
    let rim = pow(clamp(1.0 - sqrt(max(0.0, 1.0 - dot(shell_point, shell_point))), 0.0, 1.0), 2.2);

    let light_vector = normalize(vec2(-0.72, 0.69));
    let directional = clamp(dot(normalize(shell_point + vec2(0.0001)), light_vector) * 0.5 + 0.5, 0.0, 1.0);
    let cyan = vec3(0.28, 0.80, 0.88);
    let rose = vec3(1.0, 0.50, 0.68);
    let pearl = vec3(1.0, 0.93, 0.91);
    let shell_mix = smoothstep(0.18, 0.86, clamp(original_point.x * 0.5 + 0.5, 0.0, 1.0) + directional * 0.16);
    var shell_color = mix(cyan, rose, shell_mix);
    shell_color = mix(shell_color, pearl, rim * 0.48 + shell_edge * 0.18);
    shell_color += mix(vec3(0.02, 0.14, 0.18), vec3(0.22, 0.04, 0.12), shell_mix) * shell_edge * 0.12;
    shell_color += vec3(0.08, 0.04, 0.10) * intensity * 0.16;
    let shell_alpha = shell_mask * (0.05 + rim * 0.46 + shell_edge * 0.18) * shell_shape_reveal;
    let refraction_direction = normalize(shell_point + vec2(0.0001));
    let shell_radius = clamp(length(shell_point) / 0.84, 0.0, 1.0);
    let refraction_band = smoothstep(material.optics.z, 0.78, shell_radius)
        * (1.0 - smoothstep(0.97, 1.0, shell_radius));
    let refraction_uv = refraction_direction
        * material.optics.x
        * refraction_band
        / max(screen_dimensions, vec2(1.0));
    let safe_margin = vec2(material.optics.x + material.optics.x) / max(screen_dimensions, vec2(1.0));
    let refracted_uv = clamp(screen_uv + refraction_uv, safe_margin, vec2(1.0) - safe_margin);
    let original_color = textureSample(original_texture, original_sampler, refracted_uv).rgb;
    let blurred_color = textureSample(blurred_texture, blurred_sampler, refracted_uv).rgb;
    let glass_color = mix(original_color, blurred_color, material.optics.y);
    let tinted_glass_color = mix(glass_color, material.assistant_background_tint.rgb, material.assistant_background_tint.a);
    let glass_alpha = shell_mask * shell_shape_reveal;

    let core_inertia = select(0.0, destructive_pull * mix(0.10, 0.18, gesture_velocity), destructive_active);
    let core_point = (point + destructive_axis * core_inertia - vec2(0.0, -core_drop))
        / ((1.0 + pulse * 0.72 * core_reveal) * core_scale);
    let petal_count = u32(clamp(round(material.flower.y), 1.0, 5.0));
    var core_distance = organic_core(core_point, material.morph, time);
    if petal_count > 1u {
        core_distance = 10.0;
        for (var index = 0u; index < petal_count; index += 1u) {
            let angle = f32(index) * 6.2831853 / f32(petal_count) + 1.5707963;
            let axis = vec2(cos(angle), sin(angle));
            let offset = core_point - axis * 0.23;
            let local = vec2(dot(offset, vec2(-axis.y, axis.x)), dot(offset, axis));
            core_distance = min(core_distance, sd_ellipse(local, vec2(0.145, 0.22)));
        }
    }
    let core_mask = 1.0 - smoothstep(-0.012, 0.018, core_distance);
    let core_edge = 1.0 - smoothstep(0.0, 0.11, abs(core_distance));
    let core_light = clamp(0.54 + core_point.x * -0.24 + core_point.y * 0.25, 0.0, 1.0);
    var core_color = mix(vec3(0.91, 0.34, 0.47), vec3(1.0, 0.82, 0.70), core_light);
    core_color = mix(core_color, vec3(1.0, 0.95, 0.88), core_edge * 0.42);
    core_color += vec3(0.10, 0.03, 0.08) * intensity * 0.22;
    core_color += vec3(0.045, 0.04, 0.025) * f32(petal_count - 1u);
    let core_alpha = core_mask * (0.80 + core_edge * 0.17) * core_reveal;

    let listening_band = exp(-pow((core_point.y - 0.27) / 0.055, 2.0));
    let listening_wave = sin(core_point.x * 24.0 - time * 8.0) * (0.004 + listening_response * 0.028);
    let listening_vein = smoothstep(0.021, 0.0, abs(core_point.y - 0.27 - listening_wave))
        * listening_band * core_mask * listening_response * core_reveal;

    let highlight_point = (point - vec2(-0.36, 0.43)) / vec2(0.11, 0.28);
    let highlight = exp(-dot(highlight_point, highlight_point) * 4.0) * shell_mask * shell_shape_reveal;
    let core_highlight_point = (core_point - vec2(-0.16, 0.20)) / vec2(0.18, 0.24);
    let core_highlight = exp(-dot(core_highlight_point, core_highlight_point) * 3.8) * core_mask * core_reveal;
    let glow_point = (point - vec2(0.0, 0.08)) / vec2(0.42, 0.46);
    let glow_alpha = exp(-dot(glow_point, glow_point) * 3.2) * glow_reveal * 0.16;

    let outside_distance = max(shell_distance, 0.0);
    let aura_variation = 0.92
        + sin(shell_angle - 0.35) * 0.045
        + sin(shell_angle * 2.0 + 0.70) * 0.035;
    let halo_near = gaussian_tail(outside_distance, 0.045 * aura_variation);
    let halo_diffuse = gaussian_tail(outside_distance, 0.14 * aura_variation);
    let halo_alpha = (halo_near * 0.62 + halo_diffuse * 0.38)
        * (1.0 - shell_mask) * shell_shape_reveal * material.optics.w;
    let destructive_alpha = select(1.0, 1.0 - smoothstep(0.85, 1.0, destructive_progress), destructive_active);
    let base_alpha = max(max(max(shell_alpha, core_alpha), glow_alpha), max(glass_alpha, halo_alpha)) * destructive_alpha;
    var color = tinted_glass_color * glass_alpha;
    color = mix(color, vec3(1.0, 0.55, 0.58), glow_alpha);
    color += mix(cyan, rose, shell_mix) * halo_alpha;
    color = mix(color, shell_color, shell_alpha);
    color = mix(color, core_color, core_alpha);
    color += cyan * listening_vein * 0.22;
    color += vec3(0.94, 1.0, 1.0) * highlight * 0.62;
    color += vec3(1.0, 0.97, 0.88) * core_highlight * 0.28;
    let alpha = clamp(base_alpha, 0.0, 1.0);
    if alpha < 0.002 { discard; }
    return vec4(color / max(alpha, 0.001), alpha);
}

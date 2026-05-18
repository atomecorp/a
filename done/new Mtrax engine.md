Objectif

Construire un éditeur montage vidéo + couches 2D/SVG + 3D basique + multipiste audio (DAW intégré) en WebGPU natif, sans moteur 3D externe, avec :
 • timeline (clips, keyframes)
 • vidéo + images en couches
 • SVG import + édition (points) + morphing
 • interactions fluides (handles DOM overlay)
 • effets par couche (shaders/filtres) + compositing global
 • multipiste audio natif (moteur interne existant)
 • export audio obligatoire (render offline)

⚠️ Le système est audio‑first. L’audio est la référence temporelle absolue.

⸻

Architecture retenue (GPU-first, sans moteur 3D externe)

Rendu
 • WebGPU natif
 • Pas de Three.js
 • Pas de Babylon
 • Pas de scene graph externe
 • La timeline interne fait office de scene graph logique

SVG
 • Parseur custom du d string (segments Bézier)
 • Modèle interne :
 • Shape
 • BezierSegment (p0, c1, c2, p1)
 • Preview GPU pendant édition
 • Triangulation earcut uniquement au commit

Vidéo
 • WebCodecs pour decode
 • Ring buffer de frames
 • copyExternalImageToTexture vers GPUTexture persistante
 • Pas d’externalTexture éphémère pour scrubbing
 • Synchronisation stricte avec l’audio master clock

Audio (élément central)
 • Moteur multipiste existant
 • Horloge audio = source de vérité
 • Export audio offline obligatoire (WAV minimum)
 • Option : export stems par piste

3D basique
 • Matrices MVP custom
 • Depth buffer WebGPU
 • Primitives simples (planes, meshes custom)
 • Pas de scene graph 3D complet
 • Pas de PBR / lighting complexe

Effets
 • Render targets (RTT)
 • Pipeline ping-pong
 • Shaders WGSL custom
 • Paramètres animables

⸻

Interactions
 • Overlay DOM/SVG pour handles et UI d’édition
 • Hit-testing via overlay
 • Pas de raycaster 3D
 • Une seule boucle requestAnimationFrame

Boucle unique :
 1. Update audio clock
 2. Update timeline
 3. Update WebGPU render
 4. Update overlay DOM

⸻

SVG : stratégie performance

Deux modes

Preview (pendant drag)
 • Conversion path → polyline CPU
 • Stroke rendu via quads instanciés GPU
 • Joins = bevel uniquement
 • Aucun earcut
 • Objectif : interaction fluide (60/120 fps)

Commit (fin drag / throttle)
 • earcut JS
 • Upload buffers GPU une seule fois

⸻

Morphing performant
 • Resampling des paths à N points (au setup uniquement)
 • Deux buffers GPU (posA / posB)
 • Vertex shader : mix(posA, posB, t)
 • Aucune re-triangulation pendant morph
 • Si topologie incompatible : fallback commit

⸻

Vidéo : scrubbing fiable
 • Ring buffer textures persistantes
 • Seek basé sur index
 • Pas de dépendance au tag
 • ExternalTexture réservée au mode lecture live (si utilisée), pas au scrubbing frame-accurate

⸻

MVP recommandé
 1. Moteur audio multipiste stable + export WAV offline (obligatoire)
 2. Timeline unifiée (audio master clock)
 3. SVG preview GPU (polyline + quads instanciés)
 4. Commit earcut au release
 5. Morph GPU via resampling N
 6. Vidéo via WebCodecs + textures persistantes
 7. FX pipeline ping-pong

⸻

Export final

MVP
 • Export audio WAV offline (obligatoire)
 • Export vidéo non requis au MVP

V1 (export audiovisuel complet)
 • WebCodecs encoder (H.264 ou AV1 selon support navigateur)
 • Readback framebuffer WebGPU (copyTextureToBuffer → CPU)
 • Encodage frame par frame
 • Synchronisation stricte avec l’audio master clock
 • Mux audio + vidéo :
 • MP4 (si support conteneur via lib JS / wasm)
 • WebM (solution plus simple côté web)
 • Option : export séparé (audio WAV + vidéo MP4) si mux complexe

⚠️ L’export vidéo doit utiliser le rendu WebGPU final (après FX), pas un rendu alternatif.

⸻

Garde-fous anti usine à gaz
 • Pas de moteur 3D externe
 • Pas de re-triangulation pendant drag
 • Pas de joins round/miter complexes au MVP
 • Pas de double boucle de rendu
 • Pas de boolean ops SVG au MVP
 • FX : limiter le nombre de passes RTT
 • FX : pack d’effets dans un shader paramétrable lorsque possible

⸻

Points critiques à surveiller
 1. Anti-aliasing strokes/fills
 2. Sync overlay DOM ↔ WebGPU
 3. Gestion DPI/zoom
 4. Mémoire GPU (ring buffer vidéo)
 5. Cohérence topologique pour morph

⸻

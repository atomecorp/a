# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Optimized Architecture for a Video + DAW Editor with SVG Morphing and Editable HTML Text

Overview

This document describes a fully optimized architecture for a hybrid Video Editor + DAW system that supports:
 • Multiple SVG layers (stacked between video and images)
 • Advanced SVG morphing
 • Inline editable HTML text with full CSS styling
 • Real-time GPU preview
 • Film effects (grain, color grading, vignette, etc.)
 • Alpha video layers
 • MP4 export
 • Single visible canvas

The system is designed for high performance and scalability.

⸻

Core Principles

 1. Single visible WebGL canvas (PixiJS only)
 2. No DOM rendering during playback
 3. Strict separation between Edit Mode and Playback Mode
 4. All runtime rendering is GPU-based
 5. DOM and SVG are used only for authoring

⸻

Technology Stack

Rendering Engine
 • PixiJS (WebGL2)

SVG Authoring
 • SVG.js (DOM-based editing)

Animation Engine
 • GSAP (timeline + interpolation)

Audio Engine
 • WebAudio API (master transport clock)

Video Encoding
 • WebCodecs API (preferred) or MediaRecorder fallback

⸻

System Architecture

1. Edit Mode

In Edit Mode:
 • HTML text is editable (contenteditable)
 • SVG layers are editable via SVG.js
 • GSAP animates SVG paths directly in the DOM
 • No GPU mesh generation yet

User sees live DOM rendering.

⸻

1. Playback / Render Mode

In Playback Mode:
 • DOM SVG is disabled
 • HTML text is snapshotted once into a texture
 • SVG paths are converted into mesh geometry
 • GSAP animates mesh vertices instead of DOM attributes
 • All layers render inside PixiJS

Only GPU rendering occurs.

⸻

Layer Structure (Single Canvas)

Stage
 ├── Video Layer (texture)
 ├── Image Layers (sprites)
 ├── SVG Layers (meshes)
 ├── Text Layers (texture-based)
 ├── UI Overlay (optional)

Layer order determines stacking.

⸻

SVG Morphing (Optimized Method)

Step 1 — Normalize Topology

Ensure morphing shapes have compatible segment structures.

Step 2 — Convert Path to Vertices

Parse SVG path → extract segments → triangulate → build mesh.

Step 3 — GPU Morph

Option A: JS vertex interpolation via GSAP.

Option B (recommended):
 • Send both shapes as attributes to shader
 • Interpolate inside vertex shader

Example (conceptual):

vec2 morphed = mix(shapeA, shapeB, uProgress);

This avoids per-frame JS geometry rebuild.

⸻

HTML Text Handling

Edit Mode
 • Native HTML element
 • Full CSS styling
 • Live inline editing

Playback Mode
 • Snapshot to offscreen canvas
 • Convert to Pixi texture
 • Replace DOM node

Texture is regenerated only when text changes.

⸻

Video Integration

Video is converted to GPU texture:

Video → HTMLVideoElement → Pixi Texture → Sprite

Supports:
 • Alpha (WebM with transparency)
 • Blend modes
 • Masking

⸻

Film Look Effects

All effects are GPU-based Pixi filters:
 • Grain (animated noise shader)
 • Color grading (matrix or LUT shader)
 • Vignette
 • Flicker
 • Gate weave

Applied globally at stage level or per-layer.

⸻

Performance Optimization Strategy

1. Strict Mode Separation

Never mix DOM SVG updates with GPU playback.

1. Mesh Caching

Static SVG layers are converted once.

1. Smart Subdivision

Adaptive curve subdivision based on curvature.

1. Vertex Shader Morphing

Avoid JS per-frame geometry rebuild.

1. Texture Caching

Text and static graphics cached as RenderTextures.

1. Frame Lock to Audio Clock

Transport controlled by a single master clock.

⸻

Scalability Expectations

With proper mesh subdivision and GPU morphing:
 • 4K video + 10 animated SVG layers → stable
 • 1080p + 20 animated SVG layers → stable
 • Heavy shader stack → depends on GPU

Performance depends more on vertex count than number of SVG files.

⸻

Export Pipeline (MP4)

Method A (Recommended)
 • Render frame
 • Read pixels
 • Encode with WebCodecs

Method B
 • Capture stream
 • Use MediaRecorder

WebCodecs offers better control and quality.

⸻

Final Result

This architecture allows:
 • Multiple animated SVG layers
 • Real morphing between shapes
 • Inline HTML text editing with live preview
 • GPU-based film effects
 • Alpha video compositing
 • Single canvas rendering
 • MP4 export

All while remaining scalable and optimized.

⸻

Summary

The key to performance is:

Edit with DOM.
Render with GPU.
Never mix both during playback.

This ensures a professional-grade hybrid Video + DAW engine.

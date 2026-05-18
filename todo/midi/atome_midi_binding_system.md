# Atome MIDI Binding System

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

### Specification – Scope, Conflict Resolution and Execution Engine

Version: draft 1  
Target: Atome / eVe music engine  
Purpose: deterministic MIDI control architecture for songs, scenes, patterns and samples.

---

# 1. Goals

The MIDI binding system must allow:

- global MIDI controls (transport, panic, navigation)
- song-specific bindings
- scene-specific bindings
- sample / pattern triggering
- deterministic conflict resolution
- safe live performance
- inspection and debugging

The system must avoid:

- ambiguous mappings
- silent conflicts
- UI-dependent bindings
- unpredictable runtime behavior

Bindings must be **object-driven**, not **UI-driven**.

---

# 2. Core Concept

All MIDI events pass through a **central binding resolver**.

MIDI input → normalize → binding resolver → conflict resolution → action scheduler → execution

Bindings never trigger actions directly.

---

# 3. Scope Levels

Bindings exist in hierarchical scopes:

- Global
- Project
- Song
- Scene
- Focus (temporary override)

Recommended minimal implementation:

- Global
- Song
- Scene
- Focus

---

# 4. Scope Behaviour

Inheritance rules:

Global → inherited by all songs  
Song → overrides or masks global  
Scene → overrides song  
Focus → temporary override layer

Resolution priority:

1. Protected bindings
2. Focus bindings
3. Scene bindings
4. Song bindings
5. Project bindings
6. Global bindings

---

# 5. Binding Modes

### Inherit

Uses parent binding.

### Override

Replaces parent binding.

### Mask

Disables parent binding without replacing it.

### Additive

Allows multiple actions for one source.

### Protected

Cannot be overridden unless explicitly unlocked.

---

# 6. MIDI Source Normalization

Each MIDI source generates a canonical key:

device_scope + channel + event_type + number + value_mode

Example:

any:ch1:note:60:gate  
any:ch1:cc:20:absolute

---

# 7. Binding Structure

Example:

binding:
  id: binding_001
  source:
    device: any
    channel: 1
    type: note
    number: 60
  scope: song
  scope_target: song_12
  behavior: override
  priority: 50
  action:
    type: launch_scene
    target: chorus
    quantize: bar

---

# 8. Example Bindings

### Global transport

CC20 → Play  
CC21 → Stop  
CC22 → Record  
CC120 → Panic

---

# 9. Supported Actions

Transport:

- transport_play
- transport_stop
- transport_record
- panic

Song navigation:

- song_next
- song_previous
- song_select

Scene control:

- scene_launch
- scene_next

Pattern control:

- pattern_launch
- pattern_switch

Sample control:

- sample_trigger
- sample_stop

Parameter control:

- parameter_set
- parameter_increment

---

# 10. Quantization

Execution timing modes:

- immediate
- beat
- bar
- pattern_end
- song_end

Example:
scene_launch → quantize: bar

---

# 11. Conflict Detection

Conflicts occur when:
same MIDI source + different incompatible bindings.

Types:

- redundant
- override
- composite

---

# 12. Resolver Algorithm

1. Normalize MIDI event
2. Compute source key
3. Retrieve matching bindings
4. Filter by device/channel/context
5. Apply masking rules
6. Detect redundancy
7. Detect conflicts
8. Apply scope priority
9. Produce action list
10. Send to scheduler

---

# 13. Action Scheduler

Responsible for:

- quantization
- ordering
- timing stability
- priority management

---

# 14. Device Filtering

Bindings may target specific devices.

Examples:

device:any  
device:apc40  
device:pedalboard

---

# 15. Range Filters

Optional controls:

- note_range
- velocity_range
- cc_range

Example:

C1–C2 → scenes  
C3–C4 → samples

---

# 16. Binding Inspector

UI should show:

Source: Note C1

Global → Next Song  
Song → Trigger Intro  

Resolution: Song overrides Global

Statuses:

- active
- inherited
- masked
- redundant
- conflict
- protected

---

# 17. Safety Features

Always available:

CC120 → Panic

Transport bindings should be protected.

---

# 18. Example Live Setup

Pedalboard:
CC20 → Play
CC21 → Stop

Keyboard:
C1 → Song1
C#1 → Song2

Pads:
C3 → Sample FX
D3 → Vocal shot

---

# 19. Design Principles

System must be:

- deterministic
- hierarchical
- inspectable
- device-aware
- quantization-aware
- safe for live performance

Bindings control musical objects, not UI.

---

# 20. Summary

Global defines base behavior  
Song adapts  
Scene specializes  
Focus overrides temporarily  
Protected secures critical controls  
Mask disables inherited bindings  
Resolver ensures deterministic execution

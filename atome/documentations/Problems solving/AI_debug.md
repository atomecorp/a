MMD – Autonomous AI UI Testing Setup

Goal

Enable a fully autonomous AI agent to explore, test, debug, and validate the UI inside a browser or WebView environment.

⸻

1. Core Dependencies to Install

Browser Automation
 • Playwright (Node.js)
 • Chromium (headless + headed mode)

AI Layer
 • LLM API (local or remote)
 • Vision-capable model (optional but recommended)

Dev Integration
 • Git CLI access
 • Node.js (LTS)
 • TypeScript (optional but recommended)

⸻

1. Project Instrumentation (Required)

Expose a global debug interface inside the app:

window.__DEBUG__ = {
  getAppState: () => {...},
  getTimelineState: () => {...},
  getObjectTree: () => {...},
  getGPUStats: () => {...},
  exportSnapshot: () => {...}
}

Add a deterministic test mode:
 • Disable non-essential animations
 • Seed all randomness
 • Single requestAnimationFrame loop
 • Fixed timing step

⸻

1. Agent Architecture

Loop structure:
 1. Observe (DOM + Screenshot + Debug API)
 2. Analyze (LLM reasoning)
 3. Act (Playwright actions)
 4. Validate (Console errors + State diff + Visual diff)
 5. Patch (Auto-generated code fix)
 6. Re-test

⸻

1. Required Capabilities

The AI must be able to:
 • Click, drag, type, resize
 • Inspect DOM
 • Capture console errors
 • Intercept network calls
 • Compare JSON state snapshots
 • Perform visual regression checks
 • Generate and apply code patches

⸻

1. CI Integration
 • Run headless in CI
 • Fail build on:
 • Console errors
 • State inconsistencies
 • Visual diffs
 • Performance threshold breaches

⸻

1. Optional Advanced Layer
 • GPU metrics tracking (draw calls, memory usage)
 • Performance budget enforcement
 • Automated UX anomaly detection
 • Auto-commit after validated fixes

⸻

Minimal Stack Summary

Node.js + Playwright + Instrumented WebView + LLM Agent + Deterministic Test Mode

This combination enables fully autonomous UI exploration, debugging, regression detection, and patch validation.

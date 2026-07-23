# Known Bug Solutions

This directory records confirmed root causes and durable fixes for recurring
regressions. Each issue owns one folder so an agent can reproduce and validate
the established solution before attempting a new implementation.

## Index

| Symptom | Folder |
| --- | --- |
| An imported video plays audio once, then later playbacks are silent | [media-video-audio-replay](media-video-audio-replay/README.md) |

## Maintenance rules

- Add an entry only after the failing path, owning layer, and correction have
  been evidenced.
- Record rejected hypotheses when they prevent the same unproductive work.
- Keep reproduction steps on the canonical UI path; do not document direct
  runtime invocation as a product test method.
- Include the persistent regression test and the real-platform acceptance
  sequence required before declaring the issue resolved.

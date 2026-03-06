import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('tools/headless_output');
const summaryFile = path.join(outDir, 'mtrack_perf_suite_summary.json');

const fail = (message, extra = {}) => {
  const payload = { ok: false, error: message, ...extra };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
};

if (!fs.existsSync(summaryFile)) {
  fail('summary_missing', { summaryFile });
}

let summary = null;
try {
  summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
} catch (error) {
  fail('summary_parse_failed', { summaryFile, detail: String(error?.message || error || 'unknown') });
}

const checks = [
  {
    key: 'timeline.render_tracks_avg_ms',
    actual: Number(summary?.timeline?.render_tracks_avg_ms),
    max: 40
  },
  {
    key: 'timeline.scroll_horizontal_avg_ms',
    actual: Number(summary?.timeline?.scroll_horizontal_avg_ms),
    max: 35
  },
  {
    key: 'timeline.scroll_vertical_avg_ms',
    actual: Number(summary?.timeline?.scroll_vertical_avg_ms),
    max: 30
  },
  {
    key: 'zoom_slider.horizontal_apply_count',
    actual: Number(summary?.zoom_slider?.horizontal_apply_count),
    equals: 2
  },
  {
    key: 'zoom_slider.vertical_apply_count',
    actual: Number(summary?.zoom_slider?.vertical_apply_count),
    equals: 2
  },
  {
    key: 'preview_synthetic_video.warmup_ready',
    actual: summary?.preview_synthetic_video?.warmup_ready === true ? 1 : 0,
    equals: 1
  },
  {
    key: 'preview_synthetic_video.canvas_video_seek_apply_count',
    actual: Number(summary?.preview_synthetic_video?.canvas_video_seek_apply_count),
    max: 3
  },
  {
    key: 'preview_synthetic_video.canvas_render_frame_max_ms',
    actual: Number(summary?.preview_synthetic_video?.canvas_render_frame_max_ms),
    max: 2
  },
  {
    key: 'preview_synthetic_video.canvas_draw_clip_video_total_ms',
    actual: Number(summary?.preview_synthetic_video?.canvas_draw_clip_video_total_ms),
    max: 6
  },
  {
    key: 'preview_synthetic_video.preview_paused_video_clip_skip_count',
    actual: Number(summary?.preview_synthetic_video?.preview_paused_video_clip_skip_count),
    min: 8
  }
];

const results = checks.map((check) => {
  const actual = Number.isFinite(check.actual) ? check.actual : null;
  let ok = actual !== null;
  if (ok && Object.prototype.hasOwnProperty.call(check, 'max')) ok = actual <= check.max;
  if (ok && Object.prototype.hasOwnProperty.call(check, 'min')) ok = actual >= check.min;
  if (ok && Object.prototype.hasOwnProperty.call(check, 'equals')) ok = actual === check.equals;
  return {
    key: check.key,
    actual,
    max: check.max ?? null,
    min: check.min ?? null,
    equals: check.equals ?? null,
    ok
  };
});

const failing = results.filter((entry) => entry.ok !== true);
const output = {
  ok: failing.length === 0,
  summaryFile,
  checks: results
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (failing.length) process.exit(1);

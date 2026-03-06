import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('tools/headless_output');
const outFile = path.join(outDir, 'mtrack_perf_suite_summary.json');

const readJson = (filename) => {
  const target = path.join(outDir, filename);
  if (!fs.existsSync(target)) {
    return { ok: false, file: target, error: 'missing' };
  }
  try {
    const raw = fs.readFileSync(target, 'utf8');
    return { ok: true, file: target, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, file: target, error: String(error?.message || error || 'parse_failed') };
  }
};

const metric = (root, key, fallbackPath = 'result') => {
  const base = fallbackPath === 'perf'
    ? root?.analysis?.perf
    : (fallbackPath === 'benchmark'
      ? root?.analysis?.perf?.benchmark
      : root?.analysis?.result);
  const value = base?.[key];
  return value && typeof value === 'object' ? value : null;
};

const numberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const extractSummary = (report) => {
  const result = report?.analysis?.result || {};
  return {
    preview_dispatch_avg_ms: numberOrNull(metric(report, 'preview_dispatch')?.avg_ms),
    preview_dispatch_cpu_total_ms: numberOrNull(metric(report, 'preview_dispatch_cpu_ms')?.total_ms),
    preview_cache_hit_count: numberOrNull(metric(report, 'preview_frame_cache_hit')?.count),
    preview_cache_miss_count: numberOrNull(metric(report, 'preview_frame_cache_miss')?.count),
    preview_paused_video_clip_skip_count: numberOrNull(metric(report, 'preview_paused_video_clip_skip')?.count),
    canvas_render_frame_total_ms: numberOrNull(metric(report, 'canvas2d_render_frame_ms')?.total_ms),
    canvas_render_frame_max_ms: numberOrNull(metric(report, 'canvas2d_render_frame_ms')?.max_ms),
    canvas_video_sync_total_ms: numberOrNull(metric(report, 'canvas2d_video_sync_ms')?.total_ms),
    canvas_video_seek_apply_count: numberOrNull(metric(report, 'canvas2d_video_seek_apply')?.count),
    canvas_draw_clip_video_total_ms: numberOrNull(metric(report, 'canvas2d_draw_clip_video_ms')?.total_ms),
    canvas_draw_clip_video_ready_count: numberOrNull(metric(report, 'canvas2d_draw_clip_video_ready')?.count),
    canvas_draw_clip_video_placeholder_count: numberOrNull(metric(report, 'canvas2d_draw_clip_video_placeholder')?.count)
  };
};

const perfProbe = readJson('mtrack_perf_probe.json');
const zoomProbe = readJson('mtrack_zoom_slider_perf_probe.json');
const previewDispatchProbe = readJson('mtrack_preview_dispatch_probe.json');
const currentVideoProbe = readJson('mtrack_current_video_preview_probe.json');
const syntheticVideoProbe = readJson('mtrack_synthetic_video_preview_probe.json');

const summary = {
  created_at: new Date().toISOString(),
  sources: {
    perf_probe: perfProbe.ok ? perfProbe.file : { file: perfProbe.file, error: perfProbe.error },
    zoom_slider_probe: zoomProbe.ok ? zoomProbe.file : { file: zoomProbe.file, error: zoomProbe.error },
    preview_dispatch_probe: previewDispatchProbe.ok ? previewDispatchProbe.file : { file: previewDispatchProbe.file, error: previewDispatchProbe.error },
    current_video_preview_probe: currentVideoProbe.ok ? currentVideoProbe.file : { file: currentVideoProbe.file, error: currentVideoProbe.error },
    synthetic_video_preview_probe: syntheticVideoProbe.ok ? syntheticVideoProbe.file : { file: syntheticVideoProbe.file, error: syntheticVideoProbe.error }
  },
  timeline: perfProbe.ok ? {
    render_tracks_avg_ms: numberOrNull(metric(perfProbe.data, 'render_tracks', 'benchmark')?.avg_ms),
    render_tracks_cpu_avg_ms: numberOrNull(metric(perfProbe.data, 'render_tracks_cpu', 'benchmark')?.avg_ms),
    scroll_horizontal_avg_ms: numberOrNull(metric(perfProbe.data, 'scroll_horizontal', 'benchmark')?.avg_ms),
    scroll_vertical_avg_ms: numberOrNull(metric(perfProbe.data, 'scroll_vertical', 'benchmark')?.avg_ms),
    zoom_horizontal_avg_ms: numberOrNull(metric(perfProbe.data, 'zoom_horizontal', 'benchmark')?.avg_ms),
    zoom_horizontal_cpu_avg_ms: numberOrNull(metric(perfProbe.data, 'zoom_horizontal_cpu', 'benchmark')?.avg_ms),
    zoom_vertical_avg_ms: numberOrNull(metric(perfProbe.data, 'zoom_vertical', 'benchmark')?.avg_ms),
    zoom_vertical_cpu_avg_ms: numberOrNull(metric(perfProbe.data, 'zoom_vertical_cpu', 'benchmark')?.avg_ms)
  } : null,
  zoom_slider: zoomProbe.ok ? {
    horizontal_apply_count: numberOrNull(zoomProbe.data?.analysis?.result?.metrics?.zoom_horizontal_apply_ms?.count),
    horizontal_apply_total_ms: numberOrNull(zoomProbe.data?.analysis?.result?.metrics?.zoom_horizontal_apply_ms?.total_ms),
    vertical_apply_count: numberOrNull(zoomProbe.data?.analysis?.result?.metrics?.zoom_vertical_apply_ms?.count),
    vertical_apply_total_ms: numberOrNull(zoomProbe.data?.analysis?.result?.metrics?.zoom_vertical_apply_ms?.total_ms)
  } : null,
  preview_dispatch_paused: previewDispatchProbe.ok ? extractSummary(previewDispatchProbe.data) : null,
  preview_active_video: currentVideoProbe.ok ? extractSummary(currentVideoProbe.data) : null,
  preview_synthetic_video: syntheticVideoProbe.ok ? {
    ...extractSummary(syntheticVideoProbe.data),
    warmup_ready: syntheticVideoProbe.data?.analysis?.result?.scenario?.warmup_ready === true
  } : null
};

fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
process.stdout.write(`${JSON.stringify({ ok: true, outFile, summary }, null, 2)}\n`);

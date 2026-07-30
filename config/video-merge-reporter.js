/**
 * video-merge-reporter.js — make the HTML report show ONE video per test.
 *
 * Playwright records one .webm per Page, so a test that opens extra tabs
 * (e.g. the teardown delete opens the record in a new tab via context.newPage())
 * attaches several videos (video.webm + video-1.webm + video-2.webm...). This
 * reporter runs BEFORE the html reporter: on each test end it concatenates those
 * per-Page videos into a single `full-video.webm` and rewrites result.attachments
 * so the report (and json/junit) reference only the one merged video.
 *
 * ffmpeg: uses the repo's ffmpeg-static (devDependency), or FFMPEG_PATH if set.
 * The repo's stripped Playwright ffmpeg (ci/ffmpeg) CANNOT concat, so it is not used.
 *
 * MUST be listed before 'html' in playwright.config.ts reporter[] so the mutation
 * is visible when the html reporter copies attachments (also on test end).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch (_) { /* not installed */ }
  return null;
}

/** Order per-Page videos: video.webm first, then video-1, video-2, ... */
function rank(p) {
  const b = path.basename(p);
  if (b === 'video.webm') return -1;
  const m = b.match(/video-(\d+)\.webm$/i);
  return m ? parseInt(m[1], 10) : 9999;
}

class VideoMergeReporter {
  constructor() {
    this.ffmpeg = resolveFfmpeg();
    this.merged = 0;
  }

  onBegin() {
    if (!this.ffmpeg) {
      console.log('[VideoMerge] No full ffmpeg found (ffmpeg-static / FFMPEG_PATH) - videos will NOT be merged.');
    }
  }

  onTestEnd(test, result) {
    if (!this.ffmpeg) return;

    const videos = result.attachments.filter(
      (a) => a && a.name === 'video' && a.path && /\.webm$/i.test(a.path) && fs.existsSync(a.path)
    );
    if (videos.length < 2) return; // nothing to merge

    const inputs = videos.map((a) => a.path).sort((x, y) => rank(x) - rank(y));
    const outDir = path.dirname(inputs[0]);
    const merged = path.join(outDir, 'full-video.webm');

    try {
      this.concat(inputs, merged);
    } catch (e) {
      console.log(`[VideoMerge] merge failed for "${test.title}": ${e instanceof Error ? e.message : e}`);
      return; // leave the individual videos attached
    }

    // Swap attachments: drop the per-Page videos, add the single merged one.
    // The html reporter maps each step's attachments to their index in result.attachments
    // (by object identity) and throws "attachment not found" if a step still references a
    // removed one - so prune the same objects out of every step first.
    const removed = new Set(videos);
    this.pruneFromSteps(result.steps || [], removed);
    const others = result.attachments.filter((a) => !removed.has(a));
    others.push({ name: 'video', contentType: 'video/webm', path: merged });
    result.attachments.length = 0;
    result.attachments.push(...others);
    this.merged++;
    console.log(`[VideoMerge] ${inputs.length} videos -> full-video.webm for "${test.title}"`);
  }

  /** Recursively drop the given attachment objects from every (nested) step's attachments. */
  pruneFromSteps(steps, removeSet) {
    for (const step of steps) {
      if (Array.isArray(step.attachments) && step.attachments.length) {
        step.attachments = step.attachments.filter((a) => !removeSet.has(a));
      }
      if (Array.isArray(step.steps) && step.steps.length) this.pruneFromSteps(step.steps, removeSet);
    }
  }

  /** Fast lossless concat (same codec/size) via the concat demuxer; fallback to a re-encode filter. */
  concat(inputs, out) {
    const listFile = path.join(path.dirname(out), 'concat-list.txt');
    fs.writeFileSync(listFile, inputs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    try {
      execFileSync(
        this.ffmpeg,
        ['-loglevel', 'error', '-nostats', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', out],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
    } catch (_) {
      // Fallback: re-encode + normalize to a common size (handles differing tab resolutions).
      const args = ['-loglevel', 'error', '-nostats'];
      inputs.forEach((f) => args.push('-i', f));
      const W = 1280, H = 720;
      const parts = inputs
        .map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}]`)
        .join(';');
      const ins = inputs.map((_, i) => `[v${i}]`).join('');
      args.push('-filter_complex', `${parts};${ins}concat=n=${inputs.length}:v=1:a=0[out]`, '-map', '[out]', '-c:v', 'libvpx', '-b:v', '1M', '-y', out);
      execFileSync(this.ffmpeg, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    } finally {
      try { fs.unlinkSync(listFile); } catch (_) {}
    }
  }

  onEnd() {
    if (this.ffmpeg) console.log(`[VideoMerge] merged videos for ${this.merged} test(s).`);
  }
}

module.exports = VideoMergeReporter;

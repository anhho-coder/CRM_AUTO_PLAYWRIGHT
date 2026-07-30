/**
 * merge-videos.js — Post-process Playwright per-Page videos into ONE continuous file per test.
 *
 * Playwright records one .webm per Page. When a test/teardown opens extra tabs via
 * context.newPage() (e.g. the teardown delete opens the record in a new tab), the run
 * produces video.webm (main page, spans the whole test) + video-1.webm, video-2.webm...
 * (the extra tabs). This script concatenates them per test folder into `full-video.webm`.
 *
 * Order: main `video.webm` first (it already covers beforeEach -> all steps -> afterEach,
 * including logout/login user switches since those stay on the same page), then the extra
 * tab videos in numeric order. All inputs are re-encoded and padded to a common size so
 * ffmpeg's concat filter accepts differing tab resolutions.
 *
 * Usage:
 *   node scripts/merge-videos.js                 # scan all of test-results/
 *   node scripts/merge-videos.js <folder>        # a single test-results subfolder
 *   node scripts/merge-videos.js --keep          # keep source .webm (default: kept anyway)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
// The repo's Playwright ffmpeg is stripped (only pad/crop/scale filters, no concat/fps/setsar),
// so it CANNOT merge. Point FFMPEG_PATH at a full ffmpeg (e.g. `npm i ffmpeg-static`).
const FFMPEG = process.env.FFMPEG_PATH || path.join(REPO, 'ci', 'ffmpeg', 'ffmpeg-1011', 'ffmpeg-win64.exe');
const OUT_NAME = 'full-video.webm';
const TARGET_W = 1280;
const TARGET_H = 720;

if (!fs.existsSync(FFMPEG)) {
  console.error(`ffmpeg not found at ${FFMPEG}`);
  process.exit(1);
}

/** All .webm in a dir, ordered: video.webm first, then video-1, video-2, ... */
function orderedWebms(dir) {
  const webms = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.webm') && f !== OUT_NAME);
  const rank = (f) => {
    if (f === 'video.webm') return -1;
    const m = f.match(/video-(\d+)\.webm$/i);
    return m ? parseInt(m[1], 10) : 9999;
  };
  return webms.sort((a, b) => rank(a) - rank(b)).map((f) => path.join(dir, f));
}

/** Recursively find leaf test-results dirs that contain >= 2 source webms. */
function findTargets(root) {
  const targets = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory()) walk(path.join(d, e.name));
    if (orderedWebms(d).length >= 2) targets.push(d);
  };
  walk(root);
  return targets;
}

function merge(dir) {
  const inputs = orderedWebms(dir);
  const out = path.join(dir, OUT_NAME);
  if (inputs.length < 2) {
    console.log(`skip (need >=2 videos): ${dir}`);
    return;
  }
  // Build: [-i a][-i b]... then scale+pad each to TARGETxTARGET, concat, output.
  const args = ['-loglevel', 'error', '-nostats'];
  inputs.forEach((f) => args.push('-i', f));
  const parts = inputs
    .map(
      (_, i) =>
        `[${i}:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[v${i}]`
    )
    .join(';');
  const concatIns = inputs.map((_, i) => `[v${i}]`).join('');
  const filter = `${parts};${concatIns}concat=n=${inputs.length}:v=1:a=0[out]`;
  args.push('-filter_complex', filter, '-map', '[out]', '-c:v', 'libvpx', '-b:v', '1M', '-y', out);

  console.log(`\nmerging ${inputs.length} -> ${path.relative(REPO, out)}`);
  inputs.forEach((f) => console.log(`   + ${path.basename(f)}`));
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`   ok: ${path.relative(REPO, out)}`);
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const root = argv[0] ? path.resolve(argv[0]) : path.join(REPO, 'test-results');
const targets = fs.existsSync(path.join(root, 'video.webm')) || orderedWebms(root).length >= 2
  ? [root]
  : findTargets(root);

if (!targets.length) {
  console.log(`No test folder with >=2 videos found under ${path.relative(REPO, root) || root}`);
  process.exit(0);
}
console.log(`Found ${targets.length} test folder(s) to merge.`);
targets.forEach(merge);
console.log('\nDone.');

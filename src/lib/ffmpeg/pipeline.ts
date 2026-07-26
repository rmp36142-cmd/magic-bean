import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { runCommand } from "@/lib/ffmpeg/exec";
import { diskPath, ensureDir, isLocalStorageUrl, publicUrlToDiskPath } from "@/lib/storage";
import { fetchWithTimeout, DOWNLOAD_TIMEOUT_MS } from "@/lib/http";
import { SUBTITLE_FONT, type AspectSpec } from "@/lib/aspect";
import { cuesToAss, type AbsoluteCue } from "@/lib/subtitles";
import type { ProgressReporter } from "@/lib/jobs/runner";

const FPS = 30;
const NOMINAL_TRANSITION_SEC = 0.4;
const BACKGROUND_MUSIC_VOLUME = 0.15;
// A stock clip has no business being larger than this; a runaway/hostile
// response should not be able to fill the disk or exhaust memory.
const MAX_MATERIAL_BYTES = 200 * 1024 * 1024;

export type ExportableShot = {
  id: string;
  text: string;
  materialType: string; // "video" | "photo"
  materialUrl: string;
  durationMs: number; // driven by narration audio, see Shot model comment
  audioPublicPath: string; // AudioSegment.filePath
  subtitles: { text: string; startMs: number; endMs: number }[]; // relative to shot start
};

export type ExportOptions = {
  transitionsEnabled: boolean;
  backgroundMusicPublicPath?: string | null;
  aspect: AspectSpec;
};

function hashOf(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function extFromUrl(url: string, fallback: string): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext && ext.length <= 5 ? ext : fallback;
  } catch {
    const ext = path.extname(url);
    return ext && ext.length <= 5 ? ext : fallback;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Writes to a temp path and renames into place, so an interrupted download can
// never leave a truncated file that the content-addressed cache would then
// happily reuse forever as if it were complete.
async function downloadFile(url: string, destPath: string): Promise<void> {
  if (await fileExists(destPath)) return;

  const res = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`素材下载失败 (${res.status}): ${url}`);
  }

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_MATERIAL_BYTES) {
    throw new Error(
      `素材文件过大（${Math.round(declared / 1024 / 1024)}MB），已跳过以避免占满磁盘`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_MATERIAL_BYTES) {
    throw new Error(`素材文件过大（${Math.round(buf.byteLength / 1024 / 1024)}MB），已跳过`);
  }

  const tmpPath = `${destPath}.part-${crypto.randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmpPath, buf);
  await fs.rename(tmpPath, destPath);
}

// Material can be a remote stock URL or a file the user uploaded, which already
// lives on our own disk — no point round-tripping it through HTTP.
async function resolveMaterialSource(
  shot: ExportableShot,
  materialsDir: string,
): Promise<string> {
  if (isLocalStorageUrl(shot.materialUrl)) {
    const local = publicUrlToDiskPath(shot.materialUrl);
    if (!(await fileExists(local))) {
      throw new Error(`本地素材文件不存在: ${shot.materialUrl}`);
    }
    return local;
  }
  const srcExt = extFromUrl(shot.materialUrl, shot.materialType === "photo" ? ".jpg" : ".mp4");
  const srcPath = path.join(materialsDir, `src-${hashOf(shot.materialUrl)}${srcExt}`);
  await downloadFile(shot.materialUrl, srcPath);
  return srcPath;
}

// ffmpeg's filtergraph parser treats `:` and `'` and `\` specially, so a
// path used inside a filter option (e.g. subtitles=<path>) must be escaped
// even though it's a perfectly normal filesystem path.
function escapeForFilter(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Renders the shot's material into a normalized, silent clip of exactly
// `totalDurationSec` at the project's aspect ratio. Video is looped or trimmed
// to fit; photos get a slow Ken Burns zoom for the same length.
async function buildShotClip(
  shot: ExportableShot,
  materialsDir: string,
  totalDurationSec: number,
  aspect: AspectSpec,
  progress: ProgressReporter,
): Promise<string> {
  const { width, height } = aspect;
  // materialType and aspect are part of the key: the same URL rendered as a
  // photo vs a video, or into 16:9 vs 9:16, is a genuinely different clip.
  const hash = hashOf(
    `${shot.materialUrl}|${shot.materialType}|${width}x${height}|${totalDurationSec.toFixed(3)}`,
  );
  const clipPath = path.join(materialsDir, `clip-${hash}.mp4`);
  if (await fileExists(clipPath)) return clipPath;

  const srcPath = await resolveMaterialSource(shot, materialsDir);
  const scaleCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  // Render to a temp path then rename, so a killed/failed ffmpeg never leaves a
  // partial clip sitting in the cache under its final name.
  const tmpClip = `${clipPath}.part-${crypto.randomBytes(6).toString("hex")}.mp4`;

  try {
    if (shot.materialType === "photo") {
      const frames = Math.round(totalDurationSec * FPS);
      const vf = `${scaleCrop},zoompan=z='min(zoom+0.0008,1.2)':d=${frames}:s=${width}x${height}:fps=${FPS},setsar=1`;
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-loop", "1",
          "-i", srcPath,
          "-t", totalDurationSec.toFixed(3),
          "-vf", vf,
          "-r", String(FPS),
          "-pix_fmt", "yuv420p",
          "-c:v", "libx264",
          "-preset", "veryfast",
          tmpClip,
        ],
        { onActivity: progress.beat },
      );
    } else {
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-stream_loop", "-1",
          "-i", srcPath,
          "-t", totalDurationSec.toFixed(3),
          "-vf", `${scaleCrop},setsar=1`,
          "-an",
          "-r", String(FPS),
          "-pix_fmt", "yuv420p",
          "-c:v", "libx264",
          "-preset", "veryfast",
          tmpClip,
        ],
        { onActivity: progress.beat },
      );
    }
    await fs.rename(tmpClip, clipPath);
  } catch (err) {
    await fs.rm(tmpClip, { force: true }).catch(() => {});
    throw err;
  }

  return clipPath;
}

// Each crossfade "borrows" transitionSec[i] from the shared edge between
// shot i and i+1. To keep the *narration-driven* timeline (and therefore
// subtitle sync) exact, every shot's clip is built transitionSec/2 longer
// on whichever side(s) border a transition — that padding is exactly what
// the crossfade consumes, so it never eats into the shot's real duration.
function computeTransitionPlan(shots: ExportableShot[]) {
  const n = shots.length;
  const transitionSec: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = shots[i].durationMs / 1000;
    const b = shots[i + 1].durationMs / 1000;
    transitionSec.push(Math.max(0, Math.min(NOMINAL_TRANSITION_SEC, a / 2, b / 2)));
  }
  const totalDurationSec = shots.map((shot, i) => {
    const padStart = i === 0 ? 0 : transitionSec[i - 1] / 2;
    const padEnd = i === n - 1 ? 0 : transitionSec[i] / 2;
    return shot.durationMs / 1000 + padStart + padEnd;
  });
  return { transitionSec, totalDurationSec };
}

async function writeConcatList(files: string[], listPath: string): Promise<void> {
  const content = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, content, "utf8");
}

async function joinClipsSimple(
  clipPaths: string[],
  outPath: string,
  jobDir: string,
  progress: ProgressReporter,
): Promise<void> {
  const listPath = path.join(jobDir, "clips.txt");
  await writeConcatList(clipPaths, listPath);
  await runCommand(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
    { onActivity: progress.beat },
  );
}

// Chains ffmpeg's xfade filter across every clip: [0][1]xfade->v1,
// [v1][2]xfade->v2, ... Each offset is "how far into the running,
// already-joined timeline the next transition starts", which shrinks by
// one transition's duration at each step — see computeTransitionPlan for
// why the clips were padded to make this lossless.
async function joinClipsWithTransitions(
  clipPaths: string[],
  paddedDurationsSec: number[],
  transitionSec: number[],
  outPath: string,
  progress: ProgressReporter,
): Promise<void> {
  const inputArgs = clipPaths.flatMap((p) => ["-i", p]);
  const filters: string[] = [];
  let runningLabel = "0";
  let runningDuration = paddedDurationsSec[0];

  for (let i = 1; i < clipPaths.length; i++) {
    const t = transitionSec[i - 1];
    const offset = Math.max(0, runningDuration - t);
    const outLabel = i === clipPaths.length - 1 ? "vout" : `v${i}`;
    filters.push(
      `[${runningLabel}][${i}]xfade=transition=fade:duration=${t.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
    );
    runningDuration = runningDuration + paddedDurationsSec[i] - t;
    runningLabel = outLabel;
  }

  await runCommand(
    "ffmpeg",
    [
      "-y",
      ...inputArgs,
      "-filter_complex", filters.join(";"),
      "-map", `[${runningLabel}]`,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-preset", "medium",
      outPath,
    ],
    { onActivity: progress.beat },
  );
}

// Flattens per-shot cues (relative to each shot) onto the project timeline.
// Falls back to one cue per shot when a shot has no stored cues, so an older
// project that predates cue generation still gets subtitles.
function buildAbsoluteCues(shots: ExportableShot[]): AbsoluteCue[] {
  const out: AbsoluteCue[] = [];
  let offset = 0;
  for (const shot of shots) {
    if (shot.subtitles.length > 0) {
      for (const cue of shot.subtitles) {
        out.push({
          text: cue.text,
          startMs: offset + cue.startMs,
          endMs: offset + Math.min(cue.endMs, shot.durationMs),
        });
      }
    } else {
      out.push({ text: shot.text, startMs: offset, endMs: offset + shot.durationMs });
    }
    offset += shot.durationMs;
  }
  return out;
}

export async function composeProject(
  jobId: string,
  shots: ExportableShot[],
  options: ExportOptions,
  progress: ProgressReporter,
): Promise<{ outputDiskPath: string; outputPublicPath: string }> {
  if (shots.length === 0) {
    throw new Error("没有分镜可以导出");
  }
  const missingMaterial = shots.find((s) => !s.materialUrl);
  if (missingMaterial) {
    throw new Error(`分镜「${missingMaterial.text.slice(0, 12)}…」还没有选择素材`);
  }
  const missingAudio = shots.find((s) => !s.durationMs || !s.audioPublicPath);
  if (missingAudio) {
    throw new Error(`分镜「${missingAudio.text.slice(0, 12)}…」还没有生成配音`);
  }

  const { aspect } = options;
  const materialsDir = diskPath("materials");
  const jobDir = diskPath("exports", jobId);
  await ensureDir(materialsDir);
  await ensureDir(jobDir);

  const useTransitions = options.transitionsEnabled && shots.length > 1;
  const { transitionSec, totalDurationSec } = useTransitions
    ? computeTransitionPlan(shots)
    : { transitionSec: [] as number[], totalDurationSec: shots.map((s) => s.durationMs / 1000) };

  await progress.report("下载并处理分镜素材", 5);
  const clipPaths: string[] = [];
  for (let i = 0; i < shots.length; i++) {
    clipPaths.push(
      await buildShotClip(shots[i], materialsDir, totalDurationSec[i], aspect, progress),
    );
    await progress.report(
      `处理分镜素材 (${i + 1}/${shots.length})`,
      5 + Math.round(((i + 1) / shots.length) * 55),
    );
  }

  await progress.report(useTransitions ? "拼接画面（转场）" : "拼接画面", 65);
  const silentVideoPath = path.join(jobDir, "silent-video.mp4");
  if (useTransitions) {
    await joinClipsWithTransitions(
      clipPaths,
      totalDurationSec,
      transitionSec,
      silentVideoPath,
      progress,
    );
  } else {
    await joinClipsSimple(clipPaths, silentVideoPath, jobDir, progress);
  }

  await progress.report("拼接配音", 75);
  const audioListPath = path.join(jobDir, "audio.txt");
  const audioDiskPaths = shots.map((s) => publicUrlToDiskPath(s.audioPublicPath));
  await writeConcatList(audioDiskPaths, audioListPath);
  const narrationPath = path.join(jobDir, "narration.m4a");
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", audioListPath,
      "-c:a", "aac",
      "-b:a", "128k",
      narrationPath,
    ],
    { onActivity: progress.beat },
  );

  await progress.report("生成字幕", 82);
  const assPath = path.join(jobDir, "subtitles.ass");
  await fs.writeFile(
    assPath,
    cuesToAss(buildAbsoluteCues(shots), {
      width: aspect.width,
      height: aspect.height,
      fontName: SUBTITLE_FONT,
      fontSizePx: aspect.subtitleFontSizePx,
      outlinePx: aspect.subtitleOutlinePx,
      marginVPx: aspect.subtitleMarginVPx,
      marginHPx: aspect.subtitleMarginHPx,
      maxCharsPerLine: aspect.subtitleMaxCharsPerLine,
    }),
    "utf8",
  );

  await progress.report("合成最终视频", 88);
  const outputDiskPath = path.join(jobDir, "output.mp4");
  // All styling lives in the ASS file itself, so no force_style override here.
  const subtitleFilter = `subtitles=${escapeForFilter(assPath)}`;
  const totalSec = shots.reduce((sum, s) => sum + s.durationMs, 0) / 1000;
  const musicDiskPath = options.backgroundMusicPublicPath
    ? publicUrlToDiskPath(options.backgroundMusicPublicPath)
    : null;

  if (musicDiskPath && (await fileExists(musicDiskPath))) {
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i", silentVideoPath,
        "-i", narrationPath,
        "-i", musicDiskPath,
        "-filter_complex",
        `[0:v]${subtitleFilter}[vout];` +
          `[2:a]volume=${BACKGROUND_MUSIC_VOLUME},aloop=loop=-1:size=2e9,atrim=0:${totalSec.toFixed(3)},asetpts=PTS-STARTPTS[bg];` +
          `[1:a][bg]amix=inputs=2:duration=first:normalize=0[aout]`,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        outputDiskPath,
      ],
      { onActivity: progress.beat },
    );
  } else {
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i", silentVideoPath,
        "-i", narrationPath,
        "-vf", subtitleFilter,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        outputDiskPath,
      ],
      { onActivity: progress.beat },
    );
  }

  // The full-length silent render and narration track are each roughly the size
  // of the finished video and are useless once it exists; keeping them made
  // every export cost ~1.8x the output on disk, forever.
  await progress.report("清理临时文件", 97);
  await Promise.all(
    [silentVideoPath, narrationPath, audioListPath, path.join(jobDir, "clips.txt")].map((p) =>
      fs.rm(p, { force: true }).catch(() => {}),
    ),
  );

  return {
    outputDiskPath,
    outputPublicPath: `/storage/exports/${jobId}/output.mp4`,
  };
}

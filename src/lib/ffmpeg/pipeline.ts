import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { runCommand } from "@/lib/ffmpeg/exec";
import { diskPath, ensureDir, publicUrlToDiskPath } from "@/lib/storage";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const NOMINAL_TRANSITION_SEC = 0.4;
const BACKGROUND_MUSIC_VOLUME = 0.15;

export type ExportableShot = {
  id: string;
  text: string;
  materialType: string; // "video" | "photo"
  materialUrl: string;
  durationMs: number; // driven by narration audio, see Shot model comment
  audioPublicPath: string; // AudioSegment.filePath
};

export type ExportOptions = {
  transitionsEnabled: boolean;
  backgroundMusicPublicPath?: string | null;
};

function hashOf(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function extFromUrl(url: string, fallback: string): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext && ext.length <= 5 ? ext : fallback;
  } catch {
    return fallback;
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

async function downloadFile(url: string, destPath: string): Promise<void> {
  if (await fileExists(destPath)) return;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`素材下载失败 (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

// ffmpeg's filtergraph parser treats `:` and `'` and `\` specially, so a
// path used inside a filter option (e.g. subtitles=<path>) must be escaped
// even though it's a perfectly normal filesystem path.
function escapeForFilter(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Downloads the shot's chosen material (cached by content hash of its URL)
// and renders it into a normalized, silent 1280x720/30fps clip of exactly
// `totalDurationSec` (the shot's own narration-driven duration, plus half a
// transition's worth of padding on whichever sides border a crossfade — see
// computeTransitionPlan). Video is looped or trimmed to fit; photos get a
// slow Ken Burns zoom for the same length.
async function buildShotClip(
  shot: ExportableShot,
  materialsDir: string,
  totalDurationSec: number,
): Promise<string> {
  const hash = hashOf(`${shot.materialUrl}|${totalDurationSec.toFixed(3)}`);
  const clipPath = path.join(materialsDir, `clip-${hash}.mp4`);
  if (await fileExists(clipPath)) return clipPath;

  const srcExt = extFromUrl(shot.materialUrl, shot.materialType === "photo" ? ".jpg" : ".mp4");
  const srcPath = path.join(materialsDir, `src-${hashOf(shot.materialUrl)}${srcExt}`);
  await downloadFile(shot.materialUrl, srcPath);

  const scaleCrop = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;

  if (shot.materialType === "photo") {
    const frames = Math.round(totalDurationSec * FPS);
    const vf = `${scaleCrop},zoompan=z='min(zoom+0.0008,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},setsar=1`;
    await runCommand("ffmpeg", [
      "-y",
      "-loop", "1",
      "-i", srcPath,
      "-t", totalDurationSec.toFixed(3),
      "-vf", vf,
      "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      clipPath,
    ]);
  } else {
    await runCommand("ffmpeg", [
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
      clipPath,
    ]);
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

async function joinClipsSimple(clipPaths: string[], outPath: string, jobDir: string): Promise<void> {
  const listPath = path.join(jobDir, "clips.txt");
  await writeConcatList(clipPaths, listPath);
  await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
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

  await runCommand("ffmpeg", [
    "-y",
    ...inputArgs,
    "-filter_complex", filters.join(";"),
    "-map", `[${runningLabel}]`,
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "medium",
    outPath,
  ]);
}

function srtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function buildSrt(shots: ExportableShot[]): string {
  let cursor = 0;
  const blocks: string[] = [];
  shots.forEach((shot, index) => {
    const start = cursor;
    const end = cursor + shot.durationMs;
    blocks.push(
      `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${shot.text}\n`,
    );
    cursor = end;
  });
  return blocks.join("\n");
}

export type ExportProgress = (stage: string, progress: number) => Promise<void>;

export async function composeProject(
  jobId: string,
  shots: ExportableShot[],
  options: ExportOptions,
  onProgress: ExportProgress,
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

  const materialsDir = diskPath("materials");
  const jobDir = diskPath("exports", jobId);
  await ensureDir(materialsDir);
  await ensureDir(jobDir);

  const useTransitions = options.transitionsEnabled && shots.length > 1;
  const { transitionSec, totalDurationSec } = useTransitions
    ? computeTransitionPlan(shots)
    : { transitionSec: [] as number[], totalDurationSec: shots.map((s) => s.durationMs / 1000) };

  await onProgress("下载并处理分镜素材", 5);
  const clipPaths: string[] = [];
  for (let i = 0; i < shots.length; i++) {
    clipPaths.push(await buildShotClip(shots[i], materialsDir, totalDurationSec[i]));
    await onProgress(
      `处理分镜素材 (${i + 1}/${shots.length})`,
      5 + Math.round(((i + 1) / shots.length) * 55),
    );
  }

  await onProgress(useTransitions ? "拼接画面（转场）" : "拼接画面", 65);
  const silentVideoPath = path.join(jobDir, "silent-video.mp4");
  if (useTransitions) {
    await joinClipsWithTransitions(clipPaths, totalDurationSec, transitionSec, silentVideoPath);
  } else {
    await joinClipsSimple(clipPaths, silentVideoPath, jobDir);
  }

  await onProgress("拼接配音", 75);
  const audioListPath = path.join(jobDir, "audio.txt");
  const audioDiskPaths = shots.map((s) => publicUrlToDiskPath(s.audioPublicPath));
  await writeConcatList(audioDiskPaths, audioListPath);
  const narrationPath = path.join(jobDir, "narration.m4a");
  await runCommand("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", audioListPath,
    "-c:a", "aac",
    "-b:a", "128k",
    narrationPath,
  ]);

  await onProgress("生成字幕", 82);
  const srtPath = path.join(jobDir, "subtitles.srt");
  await fs.writeFile(srtPath, buildSrt(shots), "utf8");

  await onProgress("合成最终视频", 88);
  const outputDiskPath = path.join(jobDir, "output.mp4");
  const subtitleFilter = `subtitles=${escapeForFilter(srtPath)}:force_style='FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=60'`;
  const totalSec = shots.reduce((sum, s) => sum + s.durationMs, 0) / 1000;
  const musicDiskPath = options.backgroundMusicPublicPath
    ? publicUrlToDiskPath(options.backgroundMusicPublicPath)
    : null;

  if (musicDiskPath && (await fileExists(musicDiskPath))) {
    await runCommand("ffmpeg", [
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
    ]);
  } else {
    await runCommand("ffmpeg", [
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
    ]);
  }

  await onProgress("完成", 100);
  return {
    outputDiskPath,
    outputPublicPath: `/storage/exports/${jobId}/output.mp4`,
  };
}

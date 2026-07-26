import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { runCommand } from "@/lib/ffmpeg/exec";
import { diskPath, ensureDir, publicUrlToDiskPath } from "@/lib/storage";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

export type ExportableShot = {
  id: string;
  text: string;
  materialType: string; // "video" | "photo"
  materialUrl: string;
  durationMs: number; // driven by narration audio, see Shot model comment
  audioPublicPath: string; // AudioSegment.filePath
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
// and renders it into a normalized, silent 1280x720/30fps clip trimmed or
// looped to exactly match the shot's narration duration.
async function buildShotClip(shot: ExportableShot, materialsDir: string): Promise<string> {
  const durationSec = Math.max(shot.durationMs / 1000, 0.1);
  const hash = hashOf(`${shot.materialUrl}|${shot.durationMs}`);
  const clipPath = path.join(materialsDir, `clip-${hash}.mp4`);
  if (await fileExists(clipPath)) return clipPath;

  const srcExt = extFromUrl(shot.materialUrl, shot.materialType === "photo" ? ".jpg" : ".mp4");
  const srcPath = path.join(materialsDir, `src-${hashOf(shot.materialUrl)}${srcExt}`);
  await downloadFile(shot.materialUrl, srcPath);

  const scaleCrop = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;

  if (shot.materialType === "photo") {
    const frames = Math.round(durationSec * FPS);
    const vf = `${scaleCrop},zoompan=z='min(zoom+0.0008,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},setsar=1`;
    await runCommand("ffmpeg", [
      "-y",
      "-loop", "1",
      "-i", srcPath,
      "-t", durationSec.toFixed(3),
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
      "-t", durationSec.toFixed(3),
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

async function writeConcatList(files: string[], listPath: string): Promise<void> {
  const content = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, content, "utf8");
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

  await onProgress("下载并处理分镜素材", 5);
  const clipPaths: string[] = [];
  for (let i = 0; i < shots.length; i++) {
    clipPaths.push(await buildShotClip(shots[i], materialsDir));
    await onProgress(
      `处理分镜素材 (${i + 1}/${shots.length})`,
      5 + Math.round(((i + 1) / shots.length) * 55),
    );
  }

  await onProgress("拼接画面", 65);
  const clipListPath = path.join(jobDir, "clips.txt");
  await writeConcatList(clipPaths, clipListPath);
  const silentVideoPath = path.join(jobDir, "silent-video.mp4");
  await runCommand("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", clipListPath,
    "-c", "copy",
    silentVideoPath,
  ]);

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

  await onProgress("完成", 100);
  return {
    outputDiskPath,
    outputPublicPath: `/storage/exports/${jobId}/output.mp4`,
  };
}

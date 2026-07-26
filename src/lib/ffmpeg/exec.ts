import { spawn } from "node:child_process";

export class FfmpegError extends Error {}

export function runCommand(
  bin: "ffmpeg" | "ffprobe",
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      reject(
        new FfmpegError(
          `无法启动 ${bin}，请确认部署环境已安装 ffmpeg（apt install ffmpeg）: ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new FfmpegError(`${bin} 退出码 ${code}:\n${stderr.slice(-2000)}`));
        return;
      }
      resolve(stdout || stderr);
    });
  });
}

export async function probeDurationMs(filePath: string): Promise<number> {
  const stdout = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (Number.isNaN(seconds)) {
    throw new FfmpegError(`无法读取媒体时长: ${filePath}`);
  }
  return Math.round(seconds * 1000);
}

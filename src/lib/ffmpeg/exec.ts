import { spawn } from "node:child_process";

export class FfmpegError extends Error {}

// ffmpeg writes progress to stderr continuously, so "no output for a while"
// is a reliable hang detector. The absolute cap is a backstop for a process
// that keeps chattering but never finishes.
const DEFAULT_INACTIVITY_MS = 120_000;
const DEFAULT_MAX_DURATION_MS = 30 * 60_000;

export type RunOptions = {
  // Called (throttled) whenever the child emits output — used to refresh a
  // job's heartbeat so a long encode isn't mistaken for a dead process.
  onActivity?: () => void;
  inactivityMs?: number;
  maxDurationMs?: number;
};

export function runCommand(
  bin: "ffmpeg" | "ffprobe",
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  const inactivityMs = options.inactivityMs ?? DEFAULT_INACTIVITY_MS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let lastActivityNotify = 0;

    let inactivityTimer: NodeJS.Timeout | undefined;
    const hardTimer = setTimeout(() => {
      fail(
        new FfmpegError(
          `${bin} 运行超过 ${Math.round(maxDurationMs / 60000)} 分钟仍未结束，已强制终止`,
        ),
      );
    }, maxDurationMs);

    function resetInactivity() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        fail(
          new FfmpegError(
            `${bin} 在 ${Math.round(inactivityMs / 1000)} 秒内没有任何输出，判定为卡死并终止（可能是素材下载或解码卡住）`,
          ),
        );
      }, inactivityMs);
    }

    function cleanup() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      clearTimeout(hardTimer);
    }

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill("SIGKILL");
      reject(err);
    }

    function onOutput() {
      resetInactivity();
      if (!options.onActivity) return;
      // throttle: one heartbeat per second is plenty
      const now = Date.now();
      if (now - lastActivityNotify > 1000) {
        lastActivityNotify = now;
        options.onActivity();
      }
    }

    resetInactivity();

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      onOutput();
    });
    child.stderr.on("data", (d) => {
      // Keep only the tail — a long encode's stderr is huge and we only ever
      // surface the last chunk in error messages.
      stderr = (stderr + d.toString()).slice(-8000);
      onOutput();
    });

    child.on("error", (err) => {
      fail(
        new FfmpegError(
          `无法启动 ${bin}，请确认部署环境已安装 ffmpeg（apt install ffmpeg）: ${err.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(new FfmpegError(`${bin} 退出码 ${code}:\n${stderr.slice(-2000)}`));
        return;
      }
      resolve(stdout || stderr);
    });
  });
}

export async function probeDurationMs(
  filePath: string,
  options: RunOptions = {},
): Promise<number> {
  const stdout = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    // probing is fast; don't wait two minutes to notice it wedged
    { inactivityMs: 30_000, maxDurationMs: 60_000, ...options },
  );
  const seconds = parseFloat(stdout.trim());
  if (Number.isNaN(seconds)) {
    throw new FfmpegError(`无法读取媒体时长: ${filePath}`);
  }
  return Math.round(seconds * 1000);
}

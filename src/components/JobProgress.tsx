"use client";

import { isJobActive, type JobDTO } from "@/lib/types";

export function JobProgress({
  job,
  onCancel,
  doneLabel,
}: {
  job: JobDTO;
  onCancel: () => void;
  doneLabel?: string;
}) {
  if (job.status === "failed") {
    return (
      <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <p className="text-red-600">失败：{job.errorMessage}</p>
      </div>
    );
  }

  if (job.status === "canceled") {
    return (
      <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <p className="text-neutral-500">已取消</p>
      </div>
    );
  }

  if (job.status === "done") {
    return (
      <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <p className="mb-2 text-green-600">{doneLabel ?? "完成"}</p>
        {job.outputPath && (
          <a
            href={job.outputPath}
            download
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            下载 mp4
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span>
          {job.stage ?? "进行中"} — {job.progress}%
        </span>
        {isJobActive(job) && (
          <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-red-600 hover:underline">
            取消
          </button>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-neutral-900 transition-all dark:bg-white"
          style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { JobDTO } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "导出中",
  done: "已完成",
  failed: "失败",
  canceled: "已取消",
};

export function ExportHistory({
  projectId,
  refreshKey,
}: {
  projectId: string;
  refreshKey: number;
}) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/jobs?kind=export`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setJobs)
      .catch(() => {});
  }, [projectId, refreshKey]);

  if (jobs.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium text-neutral-500">历史版本</h2>
      <ul className="mt-2 space-y-1 text-xs">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between gap-3 rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <span className="min-w-0 truncate">
              {new Date(job.createdAt).toLocaleString()} · {STATUS_LABEL[job.status] ?? job.status}
              {job.status === "running" && ` (${job.progress}%)`}
            </span>
            {job.status === "done" && job.outputPath ? (
              <a
                href={job.outputPath}
                download
                className="shrink-0 text-blue-600 hover:underline dark:text-blue-400"
              >
                下载
              </a>
            ) : job.errorMessage ? (
              <span className="shrink-0 text-red-600" title={job.errorMessage}>
                {job.errorMessage.slice(0, 24)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

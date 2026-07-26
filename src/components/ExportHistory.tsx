"use client";

import { useEffect, useState } from "react";
import type { ExportJobDTO } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "导出中",
  done: "已完成",
  failed: "失败",
};

export function ExportHistory({
  projectId,
  refreshKey,
}: {
  projectId: string;
  refreshKey: number;
}) {
  const [jobs, setJobs] = useState<ExportJobDTO[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/export`)
      .then((r) => r.json())
      .then(setJobs);
  }, [projectId, refreshKey]);

  if (jobs.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="text-sm font-medium text-neutral-500">历史版本</h2>
      <ul className="mt-2 space-y-1 text-xs">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <span>
              {new Date(job.createdAt).toLocaleString()} · {STATUS_LABEL[job.status] ?? job.status}
              {job.status === "running" && ` (${job.progress}%)`}
            </span>
            {job.status === "done" && job.outputPath ? (
              <a href={job.outputPath} download className="text-blue-600 hover:underline dark:text-blue-400">
                下载
              </a>
            ) : job.status === "failed" ? (
              <span className="text-red-600" title={job.errorMessage ?? undefined}>
                {job.errorMessage?.slice(0, 30)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

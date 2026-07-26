"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDTO, ShotDTO } from "@/lib/types";
import { ShotRow } from "@/components/ShotRow";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { ExportHistory } from "@/components/ExportHistory";
import { ProjectSettingsPanel } from "@/components/ProjectSettingsPanel";
import { JobProgress } from "@/components/JobProgress";
import { useJobPolling } from "@/lib/useJobPolling";

export function ProjectEditor({ project: initial }: { project: ProjectDTO }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const audioJob = useJobPolling(project.id, "audio");
  const exportJob = useJobPolling(project.id, "export");

  const refreshShots = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}`);
    if (!res.ok) return;
    const fresh: ProjectDTO = await res.json();
    setProject((p) => ({ ...p, ...fresh }));
  }, [project.id]);

  // When narration finishes, the shots' durations and audio changed server-side,
  // so pull the authoritative state rather than guessing at it locally.
  useEffect(() => {
    audioJob.setOnDone((job) => {
      void refreshShots();
      if (job.status === "failed") setAudioError(job.errorMessage ?? "配音失败");
    });
  }, [audioJob, refreshShots]);

  useEffect(() => {
    exportJob.setOnDone(() => setHistoryRefreshKey((k) => k + 1));
  }, [exportJob]);

  async function handleSplit() {
    setSplitting(true);
    setSplitError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/split`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "拆分镜头失败");
      setProject((p) => ({ ...p, ...data }));
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "拆分镜头失败");
    } finally {
      setSplitting(false);
    }
  }

  async function handleResplit() {
    if (
      !confirm("重新拆分会删除现在所有分镜（包括已选素材和已生成的配音），确定要重新拆分吗？")
    ) {
      return;
    }
    await handleSplit();
  }

  async function handleGenerateAudio(force: boolean) {
    setAudioError(null);
    const res = await fetch(`/api/projects/${project.id}/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAudioError(data.error ?? "配音失败");
      if (data.job) audioJob.track(data.job);
      return;
    }
    audioJob.track(data);
  }

  async function handleExport() {
    setExportError(null);
    const res = await fetch(`/api/projects/${project.id}/export`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setExportError(data.error ?? "导出失败");
      if (data.job) exportJob.track(data.job);
      return;
    }
    exportJob.track(data);
  }

  function updateShot(updated: ShotDTO) {
    setProject((p) => ({
      ...p,
      shots: p.shots.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    }));
  }

  function removeShot(shotId: string) {
    setProject((p) => ({ ...p, shots: p.shots.filter((s) => s.id !== shotId) }));
  }

  async function handleDeleteProject() {
    if (!confirm(`删除项目「${project.title}」？此操作不可撤销。`)) return;
    setDeleting(true);
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  }

  const busy = audioJob.active || exportJob.active;
  const allHaveAudio = project.shots.length > 0 && project.shots.every((s) => s.audio);
  const allHaveMaterial = project.shots.length > 0 && project.shots.every((s) => s.materialUrl);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{project.title}</h1>
          <p className="mt-1 text-xs text-neutral-400">
            {project.aspectRatio} · {project.shots.length} 个分镜
          </p>
        </div>
        <button
          onClick={handleDeleteProject}
          disabled={deleting}
          className="shrink-0 text-xs text-neutral-400 hover:text-red-600 hover:underline disabled:opacity-40"
        >
          {deleting ? "删除中…" : "删除项目"}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 p-4 text-sm whitespace-pre-wrap dark:border-neutral-800">
        {project.script}
      </div>

      {project.shots.length === 0 ? (
        <div className="mt-6">
          <button
            onClick={handleSplit}
            disabled={splitting}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {splitting ? "拆分中…" : "拆分镜头"}
          </button>
          {splitError && <p className="mt-2 text-sm text-red-600">{splitError}</p>}
        </div>
      ) : (
        <>
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-medium text-neutral-500">预览</h2>
            <PreviewPlayer shots={project.shots} />
          </div>

          <div className="mt-6 space-y-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <ProjectSettingsPanel
              project={project}
              disabled={busy}
              onPatched={(patch) => setProject((p) => ({ ...p, ...patch }))}
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                onClick={() => handleGenerateAudio(false)}
                disabled={busy}
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
              >
                生成缺失配音
              </button>
              <button
                onClick={() => handleGenerateAudio(true)}
                disabled={busy}
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
              >
                全部重新配音
              </button>
              <button
                onClick={handleResplit}
                disabled={busy || splitting}
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
              >
                {splitting ? "拆分中…" : "重新拆分镜头"}
              </button>
            </div>
            {audioError && <p className="text-sm text-red-600">{audioError}</p>}
            {splitError && <p className="text-sm text-red-600">{splitError}</p>}
            {audioJob.job && (
              <JobProgress job={audioJob.job} onCancel={audioJob.cancel} doneLabel="配音完成" />
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                onClick={handleExport}
                disabled={busy || !allHaveAudio || !allHaveMaterial}
                className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                导出视频
              </button>
              {(!allHaveAudio || !allHaveMaterial) && (
                <span className="text-xs text-neutral-400">
                  需要每个分镜都选好素材并生成配音才能导出
                </span>
              )}
            </div>
            {exportError && <p className="text-sm text-red-600">{exportError}</p>}
            {exportJob.job && (
              <JobProgress
                job={exportJob.job}
                onCancel={exportJob.cancel}
                doneLabel="导出完成"
              />
            )}

            <ExportHistory projectId={project.id} refreshKey={historyRefreshKey} />
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-neutral-500">
              分镜（{project.shots.length}）
            </h2>
            <ul className="mt-3 space-y-3">
              {project.shots.map((shot) => (
                <ShotRow
                  key={shot.id}
                  shot={shot}
                  disabled={busy}
                  onUpdated={updateShot}
                  onDeleted={removeShot}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

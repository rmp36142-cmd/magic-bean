"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExportJobDTO, ProjectDTO, ShotDTO } from "@/lib/types";
import { ShotRow } from "@/components/ShotRow";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { BackgroundMusicPanel } from "@/components/BackgroundMusicPanel";
import { ExportHistory } from "@/components/ExportHistory";

export function ProjectEditor({ project: initial }: { project: ProjectDTO }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJobDTO | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSplit() {
    setSplitting(true);
    setSplitError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/split`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "拆分镜头失败");
      setProject(data);
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "拆分镜头失败");
    } finally {
      setSplitting(false);
    }
  }

  async function handleResplit() {
    if (
      !confirm(
        "重新拆分会删除现在所有分镜（包括已选素材和已生成的配音），确定要重新拆分吗？",
      )
    ) {
      return;
    }
    await handleSplit();
  }

  async function handleGenerateAudio() {
    setGeneratingAudio(true);
    setAudioError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/audio`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成配音失败");
      setProject(data.project);
      if (data.errors?.length) {
        setAudioError(`部分分镜生成失败: ${data.errors.map((e: { error: string }) => e.error).join("; ")}`);
      }
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "生成配音失败");
    } finally {
      setGeneratingAudio(false);
    }
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

  async function handleToggleTransitions() {
    const next = !project.transitionsEnabled;
    setProject((p) => ({ ...p, transitionsEnabled: next }));
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transitionsEnabled: next }),
    });
  }

  async function handleExport() {
    setExportError(null);
    const res = await fetch(`/api/projects/${project.id}/export`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setExportError(data.error ?? "导出失败");
      if (data.job) setExportJob(data.job);
      return;
    }
    const job: ExportJobDTO = data;
    setExportJob(job);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/export/${job.id}`);
      const updated: ExportJobDTO = await r.json();
      setExportJob(updated);
      if (updated.status === "done" || updated.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setHistoryRefreshKey((k) => k + 1);
      }
    }, 2000);
  }

  async function handleDeleteProject() {
    if (!confirm(`删除项目「${project.title}」？此操作不可撤销。`)) return;
    setDeleting(true);
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  }

  const allHaveAudio = project.shots.length > 0 && project.shots.every((s) => s.audio);
  const allHaveMaterial = project.shots.length > 0 && project.shots.every((s) => s.materialUrl);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{project.title}</h1>
          <p className="mt-1 text-xs text-neutral-400">状态：{project.status}</p>
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateAudio}
                disabled={generatingAudio}
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
              >
                {generatingAudio ? "生成配音中…" : "生成全部配音"}
              </button>
              <button
                onClick={handleResplit}
                disabled={splitting}
                className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
              >
                {splitting ? "拆分中…" : "重新拆分镜头"}
              </button>
            </div>
            {audioError && <p className="text-sm text-red-600">{audioError}</p>}
            {splitError && <p className="text-sm text-red-600">{splitError}</p>}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={project.transitionsEnabled}
                onChange={handleToggleTransitions}
              />
              分镜之间使用转场效果（交叉淡化）
            </label>

            <BackgroundMusicPanel
              projectId={project.id}
              musicPath={project.backgroundMusicPath}
              onChange={(path) => setProject((p) => ({ ...p, backgroundMusicPath: path }))}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExport}
                disabled={!allHaveAudio || !allHaveMaterial || exportJob?.status === "running" || exportJob?.status === "queued"}
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

            {exportJob && (
              <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                {exportJob.status === "failed" ? (
                  <p className="text-red-600">导出失败：{exportJob.errorMessage}</p>
                ) : exportJob.status === "done" ? (
                  <div>
                    <p className="mb-2 text-green-600">导出完成</p>
                    <a
                      href={exportJob.outputPath ?? "#"}
                      download
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      下载 mp4
                    </a>
                  </div>
                ) : (
                  <p>
                    {exportJob.stage ?? "导出中"} — {exportJob.progress}%
                  </p>
                )}
              </div>
            )}

            <ExportHistory projectId={project.id} refreshKey={historyRefreshKey} />
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-neutral-500">
              分镜（{project.shots.length}）
            </h2>
            <ul className="mt-3 space-y-3">
              {project.shots.map((shot) => (
                <ShotRow key={shot.id} shot={shot} onUpdated={updateShot} onDeleted={removeShot} />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

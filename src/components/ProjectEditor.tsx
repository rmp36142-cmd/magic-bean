"use client";

import { useEffect, useRef, useState } from "react";
import type { ExportJobDTO, ProjectDTO, ShotDTO } from "@/lib/types";
import { ShotMaterialPicker } from "@/components/ShotMaterialPicker";
import { PreviewPlayer } from "@/components/PreviewPlayer";

export function ProjectEditor({ project: initial }: { project: ProjectDTO }) {
  const [project, setProject] = useState(initial);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJobDTO | null>(null);
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

  async function handleExport() {
    const res = await fetch(`/api/projects/${project.id}/export`, { method: "POST" });
    const job: ExportJobDTO = await res.json();
    setExportJob(job);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/export/${job.id}`);
      const updated: ExportJobDTO = await r.json();
      setExportJob(updated);
      if (updated.status === "done" || updated.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  }

  const allHaveAudio = project.shots.length > 0 && project.shots.every((s) => s.audio);
  const allHaveMaterial = project.shots.length > 0 && project.shots.every((s) => s.materialUrl);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-xl font-semibold">{project.title}</h1>
      <p className="mt-1 text-xs text-neutral-400">状态：{project.status}</p>

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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerateAudio}
              disabled={generatingAudio}
              className="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
            >
              {generatingAudio ? "生成配音中…" : "生成全部配音"}
            </button>
            <button
              onClick={handleExport}
              disabled={!allHaveAudio || !allHaveMaterial || exportJob?.status === "running"}
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
          {audioError && <p className="mt-2 text-sm text-red-600">{audioError}</p>}

          {exportJob && (
            <div className="mt-4 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
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

          <div className="mt-8">
            <h2 className="text-sm font-medium text-neutral-500">
              分镜（{project.shots.length}）
            </h2>
            <ul className="mt-3 space-y-3">
              {project.shots.map((shot) => (
                <li
                  key={shot.id}
                  className="flex gap-3 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <div className="h-16 w-28 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-900">
                    {shot.materialThumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shot.materialThumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p>{shot.text}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {shot.audio ? `配音 ${(shot.audio.durationMs / 1000).toFixed(1)}s` : "尚未生成配音"}
                    </p>
                    <ShotMaterialPicker shot={shot} onSelected={updateShot} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

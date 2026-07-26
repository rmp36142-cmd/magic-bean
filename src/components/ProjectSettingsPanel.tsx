"use client";

import { useEffect, useState } from "react";
import { ASPECT_LIST } from "@/lib/aspect";
import type { ProjectDTO, VoiceOptionDTO } from "@/lib/types";
import { BackgroundMusicPanel } from "@/components/BackgroundMusicPanel";

export function ProjectSettingsPanel({
  project,
  onPatched,
  disabled,
}: {
  project: ProjectDTO;
  onPatched: (patch: Partial<ProjectDTO>) => void;
  disabled: boolean;
}) {
  const [voices, setVoices] = useState<VoiceOptionDTO[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/voices")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "获取音色失败");
        setVoices(data);
      })
      .catch((err) => setVoiceError(err instanceof Error ? err.message : "获取音色失败"));
  }, []);

  async function patch(body: Partial<ProjectDTO>) {
    setSaving(true);
    onPatched(body);
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium text-neutral-500">画面比例</p>
        <div className="flex flex-wrap gap-2">
          {ASPECT_LIST.map((a) => (
            <button
              key={a.ratio}
              disabled={disabled}
              onClick={() => patch({ aspectRatio: a.ratio })}
              className={`rounded border px-3 py-1.5 text-xs disabled:opacity-40 ${
                project.aspectRatio === a.ratio
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">
          切换比例会重新切分字幕（竖屏每行能放的字更少），已生成的配音不受影响。
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-neutral-500">口播音色</p>
        {voiceError ? (
          <p className="text-xs text-red-600">{voiceError}</p>
        ) : (
          <select
            value={project.voice}
            disabled={disabled || voices.length === 0}
            onChange={(e) => patch({ voice: e.target.value })}
            className="w-full max-w-sm rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-xs outline-none disabled:opacity-40 dark:border-neutral-700"
          >
            {voices.length === 0 && <option value={project.voice}>{project.voice}</option>}
            {voices.map((v) => (
              <option key={v.shortName} value={v.shortName}>
                {v.shortName} — {v.label}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-neutral-400">
          换音色后需要重新生成配音才会生效。
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={project.transitionsEnabled}
          disabled={disabled}
          onChange={(e) => patch({ transitionsEnabled: e.target.checked })}
        />
        分镜之间使用转场效果（交叉淡化）
      </label>

      <BackgroundMusicPanel
        projectId={project.id}
        musicPath={project.backgroundMusicPath}
        onChange={(path) => onPatched({ backgroundMusicPath: path })}
      />

      {saving && <p className="text-[11px] text-neutral-400">保存中…</p>}
    </div>
  );
}

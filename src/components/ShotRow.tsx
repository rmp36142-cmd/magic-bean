"use client";

import { useState } from "react";
import type { ShotDTO } from "@/lib/types";
import { ShotMaterialPicker } from "@/components/ShotMaterialPicker";

export function ShotRow({
  shot,
  onUpdated,
  onDeleted,
}: {
  shot: ShotDTO;
  onUpdated: (shot: ShotDTO) => void;
  onDeleted: (shotId: string) => void;
}) {
  const [text, setText] = useState(shot.text);
  const [savingText, setSavingText] = useState(false);
  const [regeneratingAudio, setRegeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  async function handleTextBlur() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === shot.text) {
      setText(shot.text);
      return;
    }
    setSavingText(true);
    try {
      const res = await fetch(`/api/shots/${shot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (res.ok) onUpdated(data);
    } finally {
      setSavingText(false);
    }
  }

  async function handleRegenerateAudio() {
    setRegeneratingAudio(true);
    setAudioError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}/audio`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成配音失败");
      onUpdated({ ...shot, audio: data, durationMs: data.durationMs });
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "生成配音失败");
    } finally {
      setRegeneratingAudio(false);
    }
  }

  async function handleDelete() {
    if (!confirm("删除这个分镜？")) return;
    await fetch(`/api/shots/${shot.id}`, { method: "DELETE" });
    onDeleted(shot.id);
  }

  return (
    <li className="flex gap-3 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="h-16 w-28 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-900">
        {shot.materialThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.materialThumbUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleTextBlur}
          rows={2}
          className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-neutral-200 focus:border-neutral-400 dark:hover:border-neutral-800"
        />
        <p className="mt-1 text-xs text-neutral-400">
          {savingText
            ? "保存中…"
            : shot.audio
              ? `配音 ${(shot.audio.durationMs / 1000).toFixed(1)}s`
              : "尚未生成配音"}
        </p>
        {audioError && <p className="text-xs text-red-600">{audioError}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <ShotMaterialPicker shot={shot} onSelected={onUpdated} />
          <button
            onClick={handleRegenerateAudio}
            disabled={regeneratingAudio}
            className="text-xs text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
          >
            {regeneratingAudio ? "生成中…" : shot.audio ? "重新生成配音" : "生成配音"}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-neutral-400 hover:text-red-600 hover:underline"
          >
            删除分镜
          </button>
        </div>
      </div>
    </li>
  );
}

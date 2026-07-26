"use client";

import { useState } from "react";
import type { ShotDTO } from "@/lib/types";
import { ShotMaterialPicker } from "@/components/ShotMaterialPicker";

export function ShotRow({
  shot,
  onUpdated,
  onDeleted,
  disabled,
}: {
  shot: ShotDTO;
  onUpdated: (shot: ShotDTO) => void;
  onDeleted: (shotId: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(shot.text);
  // The textarea is local state, so it would otherwise keep showing a stale
  // value after the parent reloads shots from the server (e.g. once a bulk
  // narration job finishes). Re-sync when the incoming prop actually changes.
  const [lastPropText, setLastPropText] = useState(shot.text);
  if (shot.text !== lastPropText) {
    setLastPropText(shot.text);
    setDraft(shot.text);
  }

  const [savingText, setSavingText] = useState(false);
  const [regeneratingAudio, setRegeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTextBlur() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === shot.text) {
      setDraft(shot.text);
      return;
    }
    setSavingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "保存失败");
      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setDraft(shot.text);
    } finally {
      setSavingText(false);
    }
  }

  async function handleRegenerateAudio() {
    setRegeneratingAudio(true);
    setError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}/audio`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成配音失败");
      onUpdated({ ...shot, audio: data, durationMs: data.durationMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成配音失败");
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
        {shot.materialThumbUrl ? (
          shot.materialType === "video" && shot.materialThumbUrl.startsWith("/storage/") ? (
            <video src={shot.materialThumbUrl} muted className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.materialThumbUrl} alt="" className="h-full w-full object-cover" />
          )
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleTextBlur}
          disabled={disabled}
          rows={2}
          className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-neutral-200 focus:border-neutral-400 disabled:opacity-60 dark:hover:border-neutral-800"
        />
        <p className="mt-1 text-xs text-neutral-400">
          {savingText
            ? "保存中…"
            : shot.audio
              ? `配音 ${(shot.audio.durationMs / 1000).toFixed(1)}s`
              : "尚未生成配音"}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <ShotMaterialPicker shot={shot} onSelected={onUpdated} />
          <button
            onClick={handleRegenerateAudio}
            disabled={disabled || regeneratingAudio}
            className="text-xs text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
          >
            {regeneratingAudio ? "生成中…" : shot.audio ? "重新生成配音" : "生成配音"}
          </button>
          <button
            onClick={handleDelete}
            disabled={disabled}
            className="text-xs text-neutral-400 hover:text-red-600 hover:underline disabled:opacity-40"
          >
            删除分镜
          </button>
        </div>
      </div>
    </li>
  );
}

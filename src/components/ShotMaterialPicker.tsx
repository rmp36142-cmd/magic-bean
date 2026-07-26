"use client";

import { useState } from "react";
import type { MaterialCandidateDTO, ShotDTO } from "@/lib/types";

export function ShotMaterialPicker({
  shot,
  onSelected,
}: {
  shot: ShotDTO;
  onSelected: (shot: ShotDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MaterialCandidateDTO[]>([]);

  async function handleOpen() {
    setOpen(true);
    if (candidates.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}/materials`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "搜索素材失败");
      setCandidates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索素材失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(candidateId: string) {
    const res = await fetch(`/api/shots/${shot.id}/material`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    onSelected({ ...shot, ...updated });
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleOpen}
        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        {shot.materialUrl ? "更换素材" : "选择素材"}
      </button>

      {open && (
        <div className="mt-2 rounded border border-neutral-200 p-2 dark:border-neutral-800">
          {loading && <p className="text-xs text-neutral-400">搜索中…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!loading && !error && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  title={c.attribution ?? undefined}
                  className="group relative aspect-video overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.previewUrl}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:opacity-75"
                  />
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="col-span-full text-xs text-neutral-400">没有搜索到素材</p>
              )}
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-neutral-400 hover:underline"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}

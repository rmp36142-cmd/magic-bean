"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FavoriteMaterialDTO,
  MaterialCandidateDTO,
  ShotDTO,
  UserMaterialDTO,
} from "@/lib/types";

type Tab = "recommended" | "favorites" | "mine";

const TAB_LABELS: Record<Tab, string> = {
  recommended: "推荐",
  favorites: "收藏",
  mine: "我的",
};

export function ShotMaterialPicker({
  shot,
  onSelected,
}: {
  shot: ShotDTO;
  onSelected: (shot: ShotDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("recommended");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MaterialCandidateDTO[]>([]);
  const [favorites, setFavorites] = useState<FavoriteMaterialDTO[]>([]);
  const [uploads, setUploads] = useState<UserMaterialDTO[]>([]);
  const [keyword, setKeyword] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultKeyword =
    shot.keywordsEn?.split(",")[0] ?? shot.keywordsZh?.split(",")[0] ?? "";

  const search = useCallback(
    async (term?: string) => {
      setLoading(true);
      setError(null);
      try {
        const q = term ? `?keyword=${encodeURIComponent(term)}` : "";
        const res = await fetch(`/api/shots/${shot.id}/materials${q}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "搜索素材失败");
        setCandidates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "搜索素材失败");
      } finally {
        setLoading(false);
      }
    },
    [shot.id],
  );

  const loadFavorites = useCallback(async () => {
    const res = await fetch("/api/materials/favorites");
    if (res.ok) setFavorites(await res.json());
  }, []);

  const loadUploads = useCallback(async () => {
    const res = await fetch("/api/materials/uploads");
    if (res.ok) setUploads(await res.json());
  }, []);

  const hasCandidates = candidates.length > 0;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      if (tab === "recommended" && !hasCandidates) await search();
      else if (tab === "favorites") await loadFavorites();
      else if (tab === "mine") await loadUploads();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, hasCandidates, search, loadFavorites, loadUploads]);

  async function select(body: Record<string, string>) {
    const res = await fetch(`/api/shots/${shot.id}/material`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "选择素材失败");
      return;
    }
    onSelected(await res.json());
    setOpen(false);
  }

  async function toggleFavorite(c: MaterialCandidateDTO) {
    const existing = favorites.find(
      (f) => f.provider === c.provider && f.sourceId === c.sourceId,
    );
    if (existing) {
      await fetch(`/api/materials/favorites?id=${existing.id}`, { method: "DELETE" });
    } else {
      await fetch("/api/materials/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: c.provider,
          sourceId: c.sourceId,
          type: c.type,
          previewUrl: c.previewUrl,
          downloadUrl: c.downloadUrl,
          attribution: c.attribution ?? undefined,
        }),
      });
    }
    await loadFavorites();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/materials/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上传失败");
      await loadUploads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const isFavorited = (c: MaterialCandidateDTO) =>
    favorites.some((f) => f.provider === c.provider && f.sourceId === c.sourceId);

  return (
    <div className="mt-2">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void loadFavorites();
        }}
        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        {shot.materialUrl ? "更换素材" : "选择素材"}
      </button>

      {open && (
        <div className="mt-2 rounded border border-neutral-200 p-2 dark:border-neutral-800">
          <div className="mb-2 flex items-center gap-1">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-2 py-1 text-xs ${
                  tab === t
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {tab === "recommended" && (
            <div className="mb-2 flex gap-2">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search(keyword || defaultKeyword);
                }}
                placeholder={defaultKeyword || "搜索关键词"}
                className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-neutral-700"
              />
              <button
                onClick={() => void search(keyword || defaultKeyword)}
                className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
              >
                搜索
              </button>
            </div>
          )}

          {tab === "mine" && (
            <div className="mb-2">
              <input
                ref={fileRef}
                type="file"
                accept="video/*,image/*"
                onChange={handleUpload}
                disabled={uploading}
                className="text-xs"
              />
              {uploading && <span className="ml-2 text-xs text-neutral-400">上传中…</span>}
            </div>
          )}

          {loading && <p className="text-xs text-neutral-400">搜索中…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {tab === "recommended" && !loading && (
            <Grid
              empty="没有搜索到素材，试试换个关键词，或到「我的」上传自有素材"
              items={candidates.map((c) => ({
                key: c.id,
                preview: c.previewUrl,
                title: c.attribution ?? undefined,
                onClick: () => select({ candidateId: c.id }),
                corner: (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(c);
                    }}
                    title={isFavorited(c) ? "取消收藏" : "收藏"}
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white"
                  >
                    {isFavorited(c) ? "★" : "☆"}
                  </button>
                ),
              }))}
            />
          )}

          {tab === "favorites" && (
            <Grid
              empty="还没有收藏素材 —— 在「推荐」里点右上角的星标即可收藏"
              items={favorites.map((f) => ({
                key: f.id,
                preview: f.previewUrl,
                title: f.attribution ?? undefined,
                onClick: () => select({ favoriteId: f.id }),
              }))}
            />
          )}

          {tab === "mine" && (
            <Grid
              empty="还没有上传素材"
              items={uploads.map((u) => ({
                key: u.id,
                preview: u.thumbPath ?? undefined,
                video: u.type === "video" ? u.filePath : undefined,
                title: u.originalName,
                onClick: () => select({ uploadId: u.id }),
                corner: (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`删除素材「${u.originalName}」？`)) return;
                      await fetch(`/api/materials/uploads?id=${u.id}`, { method: "DELETE" });
                      await loadUploads();
                    }}
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white"
                  >
                    ×
                  </button>
                ),
              }))}
            />
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

type GridItem = {
  key: string;
  preview?: string;
  video?: string;
  title?: string;
  onClick: () => void;
  corner?: React.ReactNode;
};

function Grid({ items, empty }: { items: GridItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-neutral-400">{empty}</p>;
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.key} className="relative">
          <button
            onClick={item.onClick}
            title={item.title}
            className="group relative block aspect-video w-full overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
          >
            {item.video ? (
              <video
                src={item.video}
                muted
                className="h-full w-full object-cover transition group-hover:opacity-75"
              />
            ) : item.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.preview}
                alt=""
                className="h-full w-full object-cover transition group-hover:opacity-75"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-neutral-100 text-[10px] text-neutral-400 dark:bg-neutral-900">
                无预览
              </span>
            )}
          </button>
          {item.corner}
        </div>
      ))}
    </div>
  );
}

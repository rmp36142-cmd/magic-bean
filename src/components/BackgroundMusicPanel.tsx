"use client";

import { useRef, useState } from "react";

export function BackgroundMusicPanel({
  projectId,
  musicPath,
  onChange,
}: {
  projectId: string;
  musicPath: string | null;
  onChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/music`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上传失败");
      onChange(data.backgroundMusicPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    await fetch(`/api/projects/${projectId}/music`, { method: "DELETE" });
    onChange(null);
  }

  return (
    <div className="text-sm">
      <p className="mb-1 text-xs font-medium text-neutral-500">背景音乐（可选，自备音频文件）</p>
      {musicPath ? (
        <div className="flex items-center gap-3">
          <audio src={musicPath} controls className="h-8" />
          <button onClick={handleRemove} className="text-xs text-red-600 hover:underline">
            移除
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="text-xs"
          />
          {uploading && <span className="ml-2 text-xs text-neutral-400">上传中…</span>}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type StorageReport = {
  areas: { area: string; bytes: number; files: number }[];
  totalBytes: number;
};

const AREA_LABELS: Record<string, string> = {
  materials: "素材缓存（下载的原始素材 + 渲染好的分镜片段）",
  exports: "导出产物",
  audio: "配音",
  music: "背景音乐",
  uploads: "自有上传素材",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function StoragePanel() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [pruning, setPruning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/storage");
    if (res.ok) setReport(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/storage").catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setReport(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePrune() {
    if (!confirm("清理一周未使用的素材缓存、失败/孤立的导出产物和无主文件？成片本身不会被删除。")) {
      return;
    }
    setPruning(true);
    setResult(null);
    try {
      const res = await fetch("/api/storage", { method: "POST" });
      const data = await res.json();
      setResult(`已清理 ${data.removedFiles} 个文件，释放 ${formatBytes(data.freedBytes)}`);
      await load();
    } finally {
      setPruning(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">磁盘占用</legend>
      {report ? (
        <>
          <ul className="space-y-1 text-xs text-neutral-500">
            {report.areas.map((a) => (
              <li key={a.area} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{AREA_LABELS[a.area] ?? a.area}</span>
                <span className="shrink-0">
                  {formatBytes(a.bytes)}（{a.files} 个文件）
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-neutral-200 pt-1 font-medium dark:border-neutral-800">
              <span>合计</span>
              <span>{formatBytes(report.totalBytes)}</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={handlePrune}
            disabled={pruning}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
          >
            {pruning ? "清理中…" : "清理缓存"}
          </button>
          {result && <p className="text-xs text-green-600">{result}</p>}
        </>
      ) : (
        <p className="text-xs text-neutral-400">读取中…</p>
      )}
    </fieldset>
  );
}

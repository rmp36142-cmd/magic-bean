"use client";

import { useEffect, useRef, useState } from "react";
import type { ShotDTO } from "@/lib/types";

export function PreviewPlayer({ shots }: { shots: ShotDTO[] }) {
  const playable = shots.filter((s) => s.audio && s.materialUrl);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = playable[index];
  const totalMs = playable.reduce((sum, s) => sum + (s.audio?.durationMs ?? 0), 0);
  const elapsedBeforeMs = playable
    .slice(0, index)
    .reduce((sum, s) => sum + (s.audio?.durationMs ?? 0), 0);

  useEffect(() => {
    if (!playing) return;
    audioRef.current?.play().catch(() => {});
    videoRef.current?.play().catch(() => {});
  }, [index, playing]);

  if (playable.length === 0) {
    return (
      <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
        还没有可预览的分镜 —— 需要先为分镜选择素材并生成配音
      </p>
    );
  }

  function togglePlay() {
    if (playing) {
      audioRef.current?.pause();
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  }

  function handleEnded() {
    if (index + 1 < playable.length) {
      setIndex(index + 1);
    } else {
      setPlaying(false);
      setIndex(0);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="relative aspect-video bg-black">
        {current.materialType === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.materialUrl!}
            alt=""
            className="h-full w-full object-cover"
            style={{ animation: playing ? "kenburns 6s ease-out forwards" : undefined }}
          />
        ) : (
          <video
            key={current.id}
            ref={videoRef}
            src={current.materialUrl!}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
          />
        )}
        <audio
          key={current.id + "-audio"}
          ref={audioRef}
          src={current.audio!.filePath}
          onEnded={handleEnded}
        />
        <div className="absolute inset-x-0 bottom-4 px-4 text-center text-lg font-medium text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
          {current.text}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <button
          onClick={togglePlay}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-white dark:text-neutral-900"
        >
          {playing ? "暂停" : "播放"}
        </button>
        <span className="text-xs text-neutral-400">
          分镜 {index + 1} / {playable.length} · {(elapsedBeforeMs / 1000).toFixed(1)}s /{" "}
          {(totalMs / 1000).toFixed(1)}s
        </span>
      </div>

      <style jsx>{`
        @keyframes kenburns {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.12);
          }
        }
      `}</style>
    </div>
  );
}

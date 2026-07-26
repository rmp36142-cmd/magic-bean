"use client";

import { useEffect, useRef, useState } from "react";
import type { ShotDTO } from "@/lib/types";

export function PreviewPlayer({ shots }: { shots: ShotDTO[] }) {
  const playable = shots.filter((s) => s.audio && s.materialUrl);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The playable list shrinks whenever a shot is deleted or its text is edited
  // (which invalidates that shot's audio). Clamp during render so we never
  // dereference past the end, and settle the real state in the effect below.
  const safeIndex = playable.length === 0 ? 0 : Math.min(index, playable.length - 1);
  const current = playable[safeIndex];

  const totalMs = playable.reduce((sum, s) => sum + (s.audio?.durationMs ?? 0), 0);
  const elapsedBeforeMs = playable
    .slice(0, safeIndex)
    .reduce((sum, s) => sum + (s.audio?.durationMs ?? 0), 0);

  useEffect(() => {
    if (!playing) return;
    audioRef.current?.play().catch(() => {});
    videoRef.current?.play().catch(() => {});
  }, [safeIndex, playing]);

  if (playable.length === 0 || !current) {
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
    if (safeIndex + 1 < playable.length) {
      setIndex(safeIndex + 1);
    } else {
      setPlaying(false);
      setIndex(0);
    }
  }

  const shotDurationSec = (current.audio?.durationMs ?? 0) / 1000;

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
            // Matches the export's Ken Burns: spans the shot's real narration
            // length, and pausing freezes it rather than snapping back to 1x.
            style={{
              animationName: "kenburns",
              animationDuration: `${Math.max(shotDurationSec, 0.1)}s`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
              animationPlayState: playing ? "running" : "paused",
            }}
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
          分镜 {safeIndex + 1} / {playable.length} · {(elapsedBeforeMs / 1000).toFixed(1)}s /{" "}
          {(totalMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}

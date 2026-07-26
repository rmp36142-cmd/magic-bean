"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isJobActive, type JobDTO, type JobKind } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;

// Tracks one background job of a given kind for a project.
//
// On mount it asks the server whether a job of this kind is already running —
// which is what makes progress survive a page refresh. Previously the UI held
// the job purely in component state, so reloading mid-export left the user with
// no indication that anything was still happening.
export function useJobPolling(projectId: string, kind: JobKind) {
  const [job, setJob] = useState<JobDTO | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef<((job: JobDTO) => void) | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const track = useCallback(
    (next: JobDTO) => {
      setJob(next);
      // Always clear the previous timer before installing a new one, so
      // repeated starts can't leave orphaned intervals polling forever.
      stop();
      if (!isJobActive(next)) {
        onDoneRef.current?.(next);
        return;
      }
      timerRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${next.id}`);
          if (!res.ok) {
            stop();
            return;
          }
          const updated: JobDTO = await res.json();
          setJob(updated);
          if (!isJobActive(updated)) {
            stop();
            onDoneRef.current?.(updated);
          }
        } catch {
          // transient network error — keep polling
        }
      }, POLL_INTERVAL_MS);
    },
    [stop],
  );

  // Reattach to an in-flight job on mount / project change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/jobs?kind=${kind}`);
        if (!res.ok) return;
        const jobs: JobDTO[] = await res.json();
        if (cancelled) return;
        const active = jobs.find(isJobActive);
        if (active) track(active);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, kind, track]);

  useEffect(() => stop, [stop]);

  const cancel = useCallback(async () => {
    if (!job) return;
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(() => {});
    stop();
    const res = await fetch(`/api/jobs/${job.id}`).catch(() => null);
    if (res?.ok) setJob(await res.json());
  }, [job, stop]);

  const setOnDone = useCallback((fn: (job: JobDTO) => void) => {
    onDoneRef.current = fn;
  }, []);

  return { job, track, cancel, setOnDone, active: isJobActive(job) };
}

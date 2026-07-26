import { prisma } from "@/lib/db";
import { buildShotCues } from "@/lib/subtitles";
import { resolveAspect } from "@/lib/aspect";

// Cues are regenerated whenever a shot's text or narration length changes, and
// depend on the project's aspect ratio (a vertical frame fits far less per
// line, so it needs more, shorter cues).
export async function regenerateShotCues(
  shotId: string,
  text: string,
  durationMs: number,
  aspectRatio: string,
): Promise<void> {
  const aspect = resolveAspect(aspectRatio);
  const cues = buildShotCues(text, durationMs, aspect.subtitleMaxCharsPerLine);

  await prisma.subtitleSegment.deleteMany({ where: { shotId } });
  if (cues.length === 0) return;
  await prisma.subtitleSegment.createMany({
    data: cues.map((cue, index) => ({
      shotId,
      order: index,
      text: cue.text,
      startMs: cue.startMs,
      endMs: cue.endMs,
    })),
  });
}

// Rebuilds cues for every shot in a project that already has narration — used
// after the aspect ratio changes, since cue length depends on frame width.
export async function regenerateProjectCues(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { shots: { include: { audio: true } } },
  });
  if (!project) return;

  for (const shot of project.shots) {
    if (!shot.audio) continue;
    await regenerateShotCues(shot.id, shot.text, shot.audio.durationMs, project.aspectRatio);
  }
}

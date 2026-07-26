import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { diskPath, ensureDir, publicUrl } from "@/lib/storage";
import { probeDurationMs } from "@/lib/ffmpeg/exec";

export const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

export type SynthesizedAudio = {
  publicPath: string; // e.g. /storage/audio/<shotId>/audio.mp3
  diskFilePath: string;
  durationMs: number;
};

// Free, no API key needed — uses the same service as Microsoft Edge's
// "Read aloud" feature. Swap point if a paid TTS provider is wanted later.
export async function synthesizeShotAudio(
  shotId: string,
  text: string,
  voice: string = DEFAULT_VOICE,
): Promise<SynthesizedAudio> {
  const dir = diskPath("audio", shotId);
  await ensureDir(dir);

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioFilePath } = await tts.toFile(dir, text);
    const durationMs = await probeDurationMs(audioFilePath);
    return {
      publicPath: publicUrl("audio", shotId, "audio.mp3"),
      diskFilePath: audioFilePath,
      durationMs,
    };
  } finally {
    // Always close the websocket, including on failure — otherwise a failed
    // shot in a 40-shot batch leaks a socket per attempt.
    try {
      tts.close();
    } catch {
      // already closed
    }
  }
}

export type VoiceOption = { shortName: string; label: string; locale: string; gender: string };

let cachedVoices: VoiceOption[] | null = null;

// The full list is ~500 voices across every locale; the picker only needs the
// Chinese ones plus a few common others, and the list never changes within a
// process lifetime.
export async function listVoices(): Promise<VoiceOption[]> {
  if (cachedVoices) return cachedVoices;
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  const mapped = voices
    .filter((v) => v.Locale.startsWith("zh-") || v.Locale === "en-US")
    .map((v) => ({
      shortName: v.ShortName,
      label: `${v.ShortName.replace(/^.*?-/, "")} · ${v.Locale} · ${v.Gender === "Female" ? "女" : "男"}`,
      locale: v.Locale,
      gender: v.Gender,
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.shortName.localeCompare(b.shortName));
  cachedVoices = mapped;
  return mapped;
}

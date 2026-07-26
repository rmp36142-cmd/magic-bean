import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { diskPath, ensureDir, publicUrl } from "@/lib/storage";
import { probeDurationMs } from "@/lib/ffmpeg/exec";

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

export type SynthesizedAudio = {
  publicPath: string; // e.g. /storage/audio/<shotId>/audio.mp3
  diskFilePath: string;
  durationMs: number;
};

// Free, no API key needed — uses the same service as Microsoft Edge's
// "Read aloud" feature. See lib/tts/edgeTts.ts for the swap point if a
// paid TTS provider is wanted later.
export async function synthesizeShotAudio(
  shotId: string,
  text: string,
): Promise<SynthesizedAudio> {
  const dir = diskPath("audio", shotId);
  await ensureDir(dir);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(DEFAULT_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioFilePath } = await tts.toFile(dir, text);
  tts.close();

  const durationMs = await probeDurationMs(audioFilePath);

  return {
    publicPath: publicUrl("audio", shotId, "audio.mp3"),
    diskFilePath: audioFilePath,
    durationMs,
  };
}

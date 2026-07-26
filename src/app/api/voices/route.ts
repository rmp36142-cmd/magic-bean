import { NextResponse } from "next/server";
import { listVoices } from "@/lib/tts/edgeTts";

export async function GET() {
  try {
    const voices = await listVoices();
    return NextResponse.json(voices);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取音色列表失败" },
      { status: 502 },
    );
  }
}

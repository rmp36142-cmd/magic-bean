export type AspectRatio = "16:9" | "9:16" | "1:1";

// Subtitle sizes here are REAL PIXELS. The export writes an ASS file with
// PlayResX/PlayResY pinned to width/height, so libass does no implicit scaling
// (see cuesToAss for why that matters).
export type AspectSpec = {
  ratio: AspectRatio;
  width: number;
  height: number;
  label: string;
  subtitleFontSizePx: number;
  subtitleOutlinePx: number;
  // Distance from the bottom edge. Vertical video needs a lot more, both to
  // clear platform UI overlays and because the frame is much taller.
  subtitleMarginVPx: number;
  subtitleMarginHPx: number;
  // Max CJK glyphs per line; we wrap ourselves so punctuation never starts a
  // line, and libass wrapping is disabled.
  subtitleMaxCharsPerLine: number;
};

export const ASPECTS: Record<AspectRatio, AspectSpec> = {
  "16:9": {
    ratio: "16:9",
    width: 1280,
    height: 720,
    label: "16:9 横屏（B站 / YouTube）",
    subtitleFontSizePx: 44,
    subtitleOutlinePx: 3,
    subtitleMarginVPx: 54,
    subtitleMarginHPx: 80,
    subtitleMaxCharsPerLine: 22,
  },
  "9:16": {
    ratio: "9:16",
    width: 720,
    height: 1280,
    label: "9:16 竖屏（抖音 / 快手 / 视频号）",
    subtitleFontSizePx: 46,
    subtitleOutlinePx: 3,
    subtitleMarginVPx: 260,
    subtitleMarginHPx: 40,
    subtitleMaxCharsPerLine: 13,
  },
  "1:1": {
    ratio: "1:1",
    width: 1080,
    height: 1080,
    label: "1:1 方形",
    subtitleFontSizePx: 52,
    subtitleOutlinePx: 3,
    subtitleMarginVPx: 96,
    subtitleMarginHPx: 60,
    subtitleMaxCharsPerLine: 17,
  },
};

// Overridable because the "right" CJK font depends on what the host has
// installed; fontconfig substitutes a CJK-capable face when this one is absent.
export const SUBTITLE_FONT = process.env.SUBTITLE_FONT || "Noto Sans CJK SC";

export const ASPECT_LIST: AspectSpec[] = [ASPECTS["16:9"], ASPECTS["9:16"], ASPECTS["1:1"]];

export function resolveAspect(value: string | null | undefined): AspectSpec {
  if (value && value in ASPECTS) return ASPECTS[value as AspectRatio];
  return ASPECTS["16:9"];
}

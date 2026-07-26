// Splitting a shot's narration into timed subtitle cues.
//
// Previously the whole shot was one cue, which meant a 3-sentence shot dumped
// a 3-line paragraph on screen for 15 seconds — covering a third of the frame
// and not tracking the speech at all. Here the narration is cut at natural
// pauses and each piece gets a slice of the shot's audio duration proportional
// to its length, which is a good approximation because TTS reads at a roughly
// constant rate.

// Sentence-ending punctuation, then softer breaks. Kept as separate tiers so we
// only fall back to commas when sentences alone are still too long.
const HARD_BREAK = /([。！？!?；;…]+)/;
const SOFT_BREAK = /([，,、：:—]+)/;

// Characters that must never begin a line (CJK 标点避头尾). libass has no such
// rule, which is why it happily wrapped a line onto a leading "，".
const NO_LINE_START = "，。、；：？！）》」』】…—,.;:?!)>\"'";

export type Cue = { text: string; startMs: number; endMs: number };

// Rough display width: CJK/fullwidth glyphs occupy about twice a latin one.
function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)
      ? 2
      : 1;
  }
  return w;
}

function splitKeepingDelimiter(text: string, pattern: RegExp): string[] {
  const parts = text.split(pattern);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = (parts[i] ?? "") + (parts[i + 1] ?? "");
    if (chunk.trim()) out.push(chunk.trim());
  }
  return out.length > 0 ? out : [text.trim()].filter(Boolean);
}

// Splits into pieces that each fit within maxWidth (2 lines' worth), cutting at
// sentence ends first, then commas, then hard-slicing if a single run is still
// too long (rare, but a script with no punctuation at all must not produce one
// giant cue).
function segmentText(text: string, maxWidth: number): string[] {
  const out: string[] = [];

  for (const sentence of splitKeepingDelimiter(text, HARD_BREAK)) {
    if (displayWidth(sentence) <= maxWidth) {
      out.push(sentence);
      continue;
    }
    // too long: try to merge comma-delimited clauses up to the budget
    let buffer = "";
    for (const clause of splitKeepingDelimiter(sentence, SOFT_BREAK)) {
      if (!buffer) {
        buffer = clause;
      } else if (displayWidth(buffer + clause) <= maxWidth) {
        buffer += clause;
      } else {
        out.push(buffer);
        buffer = clause;
      }
      while (displayWidth(buffer) > maxWidth) {
        out.push(sliceToWidth(buffer, maxWidth));
        buffer = buffer.slice(sliceToWidth(buffer, maxWidth).length);
      }
    }
    if (buffer.trim()) out.push(buffer.trim());
  }

  return out.filter((s) => s.trim().length > 0);
}

function sliceToWidth(text: string, maxWidth: number): string {
  let w = 0;
  let i = 0;
  for (const ch of text) {
    const cw = displayWidth(ch);
    if (w + cw > maxWidth) break;
    w += cw;
    i += ch.length;
  }
  return text.slice(0, Math.max(i, 1));
}

// Wraps one cue into at most 2 display lines, honouring 标点避头尾 by pulling a
// leading punctuation mark back onto the previous line.
export function wrapCueText(text: string, maxCharsPerLine: number): string {
  const maxWidth = maxCharsPerLine * 2; // maxCharsPerLine counted in CJK glyphs
  if (displayWidth(text) <= maxWidth) return text;

  let breakAt = 0;
  let w = 0;
  let i = 0;
  for (const ch of text) {
    const cw = displayWidth(ch);
    if (w + cw > maxWidth) break;
    w += cw;
    i += ch.length;
    breakAt = i;
  }
  if (breakAt <= 0 || breakAt >= text.length) return text;

  // never start the second line with punctuation
  while (breakAt < text.length && NO_LINE_START.includes(text[breakAt])) {
    breakAt += 1;
  }

  const first = text.slice(0, breakAt);
  const rest = text.slice(breakAt);
  return rest ? `${first}\n${rest}` : first;
}

// Builds cues for a single shot, with times RELATIVE TO THE SHOT START.
export function buildShotCues(
  text: string,
  shotDurationMs: number,
  maxCharsPerLine: number,
): Cue[] {
  const trimmed = text.trim();
  if (!trimmed || shotDurationMs <= 0) return [];

  // Budget two lines per cue.
  const pieces = segmentText(trimmed, maxCharsPerLine * 2 * 2);
  if (pieces.length === 0) return [];
  if (pieces.length === 1) {
    return [{ text: pieces[0], startMs: 0, endMs: shotDurationMs }];
  }

  const weights = pieces.map((p) => Math.max(displayWidth(p), 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const cues: Cue[] = [];
  let cursor = 0;
  pieces.forEach((piece, i) => {
    // Last cue always lands exactly on the shot end so rounding can't leave a
    // gap or overrun the shot boundary.
    const isLast = i === pieces.length - 1;
    const span = isLast
      ? shotDurationMs - cursor
      : Math.round((weights[i] / totalWeight) * shotDurationMs);
    const start = cursor;
    const end = isLast ? shotDurationMs : Math.min(cursor + span, shotDurationMs);
    if (end > start) cues.push({ text: piece, startMs: start, endMs: end });
    cursor = end;
  });

  return cues;
}

export type AbsoluteCue = { text: string; startMs: number; endMs: number };

// ASS timestamps are H:MM:SS.cc (centiseconds).
function assTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

export type AssStyle = {
  width: number;
  height: number;
  fontName: string;
  fontSizePx: number;
  outlinePx: number;
  marginVPx: number;
  marginHPx: number;
  maxCharsPerLine: number;
};

// Subtitles are emitted as ASS rather than SRT specifically so PlayResX/PlayResY
// can be pinned to the real video size. With SRT + force_style, libass
// interprets FontSize and MarginV in its own default 384x288 script space and
// then scales them by the video height — which silently produced wildly
// different results per aspect ratio (on a 720x1280 frame the text rendered
// several times too large and MarginV pushed it off the top of the screen).
// Here every value is in actual pixels.
//
// WrapStyle 2 disables libass's own line wrapping, so the CJK-aware breaks
// computed in wrapCueText are what actually appear.
export function cuesToAss(cues: AbsoluteCue[], style: AssStyle): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${style.width}`,
    `PlayResY: ${style.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: None",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontName},${style.fontSizePx},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${style.outlinePx},0,2,${style.marginHPx},${style.marginHPx},${style.marginVPx},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = cues.map((cue) => {
    const wrapped = wrapCueText(cue.text, style.maxCharsPerLine)
      .split("\n")
      .map(escapeAssText)
      .join("\\N");
    return `Dialogue: 0,${assTimestamp(cue.startMs)},${assTimestamp(cue.endMs)},Default,,0,0,0,,${wrapped}`;
  });

  return `${header}\n${events.join("\n")}\n`;
}

// Braces introduce override tags in ASS, and a literal backslash would start an
// escape; neither should ever come from narration text.
function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").trim();
}

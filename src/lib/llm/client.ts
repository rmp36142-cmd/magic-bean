import { fetchWithTimeout, LLM_TIMEOUT_MS } from "@/lib/http";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmConfigError extends Error {}
export class LlmRequestError extends Error {}

// Some gateways helpfully include the inbound request (headers and all) in
// their error bodies. That body is surfaced to the UI, so scrub the key.
function redactSecrets(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join("***");
}

// Calls any OpenAI-compatible `/chat/completions` endpoint. Covers DeepSeek,
// Kimi/Moonshot, GLM, OpenRouter, Ollama, self-hosted proxies, etc.
export async function chatComplete({
  baseUrl,
  apiKey,
  model,
  messages,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  if (!baseUrl || !apiKey || !model) {
    throw new LlmConfigError("LLM 未配置，请先在设置页填写 Base URL / API Key / Model");
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
      }),
    },
    LLM_TIMEOUT_MS,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LlmRequestError(
      // Never echo the request back — the Authorization header and key must not
      // reach the browser through an error message.
      `LLM 请求失败 (${res.status}): ${redactSecrets(body.slice(0, 500), apiKey)}`,
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new LlmRequestError("LLM 返回内容为空或格式不符合预期");
  }
  return content;
}

// Providers vary in how strictly they honor "reply with only JSON" — some
// wrap it in a ```json fence or add a sentence before/after. Extract the
// first balanced {...} or [...] block instead of trusting raw JSON.parse.
export function extractJsonBlock(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to bracket scanning
  }

  const openers = ["{", "["];
  const closers: Record<string, string> = { "{": "}", "[": "]" };
  for (const open of openers) {
    const start = trimmed.indexOf(open);
    if (start === -1) continue;
    const close = closers[open];
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === open) depth++;
      else if (trimmed[i] === close) {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new LlmRequestError("无法从 LLM 返回内容中解析出 JSON");
}

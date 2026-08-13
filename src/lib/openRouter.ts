import { config } from "dotenv";

// Load .env when running outside the Next.js runtime (e.g. tsx CLI scripts)
config();

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCallParams {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SITE_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://aiexecutions.com",
  "X-Title": "AI Executions",
};

export function getOpenRouterKey(): string {
  return process.env.NEXT_PUBLIC_OPEN_ROUTER_API_KEY || "";
}

export async function callOpenRouter(params: OpenRouterCallParams): Promise<string> {
  const key = getOpenRouterKey();
  if (!key) throw new Error("[OpenRouter] NEXT_PUBLIC_OPEN_ROUTER_API_KEY missing");

  const messages: OpenRouterMessage[] = [];
  if (params.systemInstruction) {
    messages.push({ role: "system", content: params.systemInstruction });
  }
  messages.push({ role: "user", content: params.prompt });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...SITE_HEADERS,
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_MODEL,
      messages,
      temperature: params.temperature ?? 0.1,
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[OpenRouter] ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
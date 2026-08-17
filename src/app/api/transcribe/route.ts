export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";
const MODEL = "openai/whisper-large-v3-turbo";

/**
 * Maps OpenRouter/network failures to a readable message and an HTTP status.
 */
function describeError(err: unknown): { message: string; status: number } {
  if (err instanceof SyntaxError && /JSON/i.test(err.message)) {
    return {
      message:
        "OpenRouter responded with an empty or non-JSON body. Try the file again in a moment.",
      status: 502,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/timed out|abort/i.test(message)) {
    return { message: "The transcription service timed out. Try the file again.", status: 504 };
  }
  if (/429|rate limit/i.test(message)) {
    return {
      message: "Rate limit hit on the transcription service. Wait a few seconds and try again.",
      status: 429,
    };
  }
  if (/401|unauthorized|api key/i.test(message)) {
    return {
      message: "The transcription service rejected the API key on the server.",
      status: 500,
    };
  }

  return { message, status: 500 };
}

/**
 * POST /api/transcribe
 * Transcribes a single audio file using OpenRouter's dedicated
 * audio/transcriptions endpoint (whisper-large-v3-turbo).
 * Files must be transcribed one at a time, in upload order, by the client.
 */
export async function POST(req: Request) {
  const apiKey = process.env.NEXT_PUBLIC_OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "NEXT_PUBLIC_OPEN_ROUTER_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No audio file provided." }, { status: 400 });
  }

  const allowedTypes = new Set([
    "audio/ogg",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/mp4",
    "audio/webm",
    "audio/m4a",
    "audio/x-m4a",
    "video/mp4",
    "video/webm",
  ]);
  const name = file.name.toLowerCase();
  const looksAudio = /\.(ogg|oga|mp3|wav|m4a|mp4|webm|flac)$/.test(name);
  if (!looksAudio && !allowedTypes.has(file.type)) {
    return Response.json(
      {
        error: `"${file.name}" is not a supported audio file. Allowed: OGG, MP3, WAV, M4A, MP4, WebM.`,
      },
      { status: 400 }
    );
  }

  try {
    const upstream = new FormData();
    upstream.append("file", file);
    upstream.append("model", MODEL);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aiexecutions.com",
        "X-Title": "AI Executions",
      },
      body: upstream,
    });

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      let detail = "Unknown upstream error.";
      if (raw) {
        try {
          const data = JSON.parse(raw) as { error?: { message?: string }; message?: string };
          detail = data.error?.message || data.message || raw.substring(0, 300);
        } catch {
          detail = raw.substring(0, 300);
        }
      }
      throw new Error(`[OpenRouter] ${res.status}: ${detail}`);
    }

    let text = "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { text?: string };
        text = typeof parsed.text === "string" ? parsed.text : "";
      } catch {
        // Some providers return the raw transcript as plain text.
        text = raw;
      }
    }

    text = text.trim();
    if (!text) {
      return Response.json(
        {
          error:
            "The audio was transcribed but produced no text. The file may be silent or contain no speech.",
        },
        { status: 422 }
      );
    }

    return Response.json({ fileName: file.name, text });
  } catch (err) {
    const { message, status } = describeError(err);
    return Response.json({ error: message }, { status });
  }
}
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Maps SDK/network failures to a readable message and an HTTP status.
 * The SDK's own JSON.parse can throw a bare SyntaxError when OpenAI
 * returns an empty body or an HTML error page, so that case is handled
 * explicitly instead of leaking an awkward "Unexpected end of JSON input".
 */
function describeError(err: unknown): { message: string; status: number } {
  if (err instanceof SyntaxError && /JSON/i.test(err.message)) {
    return {
      message:
        "OpenAI responded with an empty or non-JSON body. The service returned an error page; try the file again in a moment.",
      status: 502,
    };
  }

  if (err instanceof APIConnectionTimeoutError) {
    return { message: "The transcription service timed out. Try the file again.", status: 504 };
  }

  if (err instanceof APIConnectionError) {
    return {
      message: "Could not reach the transcription service. Check the network and try again.",
      status: 503,
    };
  }

  if (err instanceof RateLimitError) {
    return {
      message: "Rate limit hit on the transcription service. Wait a few seconds and try again.",
      status: 429,
    };
  }

  if (err instanceof AuthenticationError) {
    return {
      message: "The transcription service rejected the API key on the server.",
      status: 500,
    };
  }

  if (err instanceof PermissionDeniedError) {
    return {
      message: "The transcription service denied access with the server API key.",
      status: 500,
    };
  }

  if (err instanceof NotFoundError) {
    return { message: "The transcription service could not find the requested resource.", status: 500 };
  }

  if (err instanceof BadRequestError || err instanceof InternalServerError) {
    const detail = err instanceof Error ? err.message : "Unknown upstream error.";
    return { message: detail, status: err instanceof BadRequestError ? 400 : 502 };
  }

  if (err instanceof APIError) {
    const detail = err instanceof Error ? err.message : "Unknown upstream error.";
    const status = typeof err.status === "number" ? err.status : 502;
    return { message: detail, status };
  }

  const message = err instanceof Error ? err.message : String(err);
  return { message, status: 500 };
}

/**
 * POST /api/transcribe
 * Transcribes a single audio file (OGG/MP3) using OpenAI Whisper.
 * Files must be transcribed one at a time, in upload order, by the client.
 */
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
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
    const client = new OpenAI({ apiKey });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
      language: "es",
    });

    if (typeof transcription !== "string") {
      return Response.json({ error: "Transcription returned an unexpected format." }, { status: 500 });
    }

    const text = transcription.trim();
    if (!text) {
      return Response.json(
        { error: "The audio was transcribed but produced no text. The file may be silent or contain no speech." },
        { status: 422 }
      );
    }

    return Response.json({
      fileName: file.name,
      text,
    });
  } catch (err) {
    const { message, status } = describeError(err);
    return Response.json({ error: message }, { status });
  }
}

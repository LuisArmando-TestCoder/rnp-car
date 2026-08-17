import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

    return Response.json({
      fileName: file.name,
      text: transcription.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
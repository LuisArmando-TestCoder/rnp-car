import TranscribePanel from "@/components/TranscribePanel";

export const metadata = {
  title: "Audio Transcription",
  description: "Transcribe OGG and MP3 audio files sequentially with OpenAI Whisper.",
};

export default function TranscribePage() {
  return (
    <main style={{ minHeight: "100vh", padding: "4rem 1.5rem 3rem", maxWidth: 1100, margin: "0 auto" }}>
      <TranscribePanel showHeader />
    </main>
  );
}
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  CheckCircle,
  CloudArrowDown,
  Copy,
  FileAudio,
  FilePlus,
  Play,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import styles from "./transcribe-panel.module.scss";

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: "pending" | "transcribing" | "done" | "error";
  error?: string;
  text?: string;
}

interface TranscriptSection {
  fileName: string;
  text: string;
}

const SUPPORTED_EXT = /\.(ogg|oga|mp3|wav|m4a|mp4|webm|flac)$/i;
const SUPPORTED_TYPES = new Set([
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isSupported(file: File): boolean {
  return SUPPORTED_EXT.test(file.name) || SUPPORTED_TYPES.has(file.type);
}

function buildCombinedTranscript(sections: TranscriptSection[]): string {
  const parts = sections.map((s) => {
    const rule = "=".repeat(48);
    return [`${rule}`, `FILE: ${s.fileName}`, `${rule}`, "", s.text].join("\n");
  });
  return parts.join("\n\n\n");
}

interface TranscribePanelProps {
  /** Render the page-level header (eyebrow, title, subtitle). */
  showHeader?: boolean;
}

export default function TranscribePanel({ showHeader = false }: TranscribePanelProps) {
  const reduce = useReducedMotion();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [sections, setSections] = useState<TranscriptSection[]>([]);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const accepted = files.filter((f) => f.status === "done" || f.status === "error").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const progress = files.length === 0 ? 0 : Math.round((accepted / files.length) * 100);
  const currentIndex = files.findIndex((f) => f.status === "transcribing");
  const currentFile = currentIndex >= 0 ? files[currentIndex] : null;

  const combinedTranscript = useMemo(() => buildCombinedTranscript(sections), [sections]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const supported = incoming.filter(isSupported);
    const rejected = incoming.length - supported.length;

    const queued: QueuedFile[] = supported.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      status: "pending",
    }));

    setFiles((prev) => [...prev, ...queued]);
    if (rejected > 0) {
      setStatusMessage(
        `${rejected} file${rejected === 1 ? "" : "s"} skipped: only OGG, MP3, WAV, M4A, MP4, WebM and FLAC are supported.`
      );
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeFile = useCallback(
    (id: string) => {
      if (processing) return;
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setSections((prev) => {
        const removed = files.find((f) => f.id === id);
        if (!removed) return prev;
        return prev.filter((s) => s.fileName !== removed.name);
      });
    },
    [files, processing]
  );

  const clearAll = useCallback(() => {
    if (processing) return;
    setFiles([]);
    setSections([]);
    setStatusMessage(null);
  }, [processing]);

  const startProcessing = useCallback(async () => {
    if (processing || files.length === 0) return;
    setProcessing(true);
    setSections([]);
    setStatusMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const transcriptions: TranscriptSection[] = [];

    // Process strictly in upload order: index 0 is the first dropped file.
    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      if (controller.signal.aborted) break;

      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, status: "transcribing" as const } : f))
      );
      setStatusMessage(`Transcribing ${i + 1} of ${files.length}: ${entry.name}`);

      try {
        const formData = new FormData();
        formData.append("file", entry.file);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        // Read as text first so an empty or non-JSON body (e.g. a proxy
        // error page) is turned into a readable message instead of throwing
        // "Unexpected end of JSON input" from res.json().
        let body: { text?: string; error?: string } = {};
        const raw = await res.text();
        if (raw) {
          try {
            body = JSON.parse(raw) as { text?: string; error?: string };
          } catch {
            body = {};
          }
        }

        if (!res.ok || !body.text) {
          const message =
            body.error ||
            (raw
              ? "The server returned an unexpected response while transcribing."
              : "The server returned an empty response while transcribing.");
          throw new Error(message);
        }

        transcriptions.push({ fileName: entry.name, text: body.text });
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "done", text: body.text } : f))
        );
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Stopped."
            : err instanceof Error
              ? err.message
              : String(err);
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "error", error: message } : f))
        );
        transcriptions.push({ fileName: entry.name, text: `[Error: ${message}]` });
      }

      setSections([...transcriptions]);
    }

    abortRef.current = null;
    setProcessing(false);
    setStatusMessage(null);
  }, [files, processing]);

  const stopProcessing = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!combinedTranscript) return;
    try {
      await navigator.clipboard.writeText(combinedTranscript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      transcriptRef.current?.focus();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }, [combinedTranscript]);

  const handleDownload = useCallback(() => {
    if (!combinedTranscript) return;
    const blob = new Blob([combinedTranscript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcripcion-sequencial.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [combinedTranscript]);

  // Announce progress to screen readers.
  useEffect(() => {
    if (statusMessage) {
      const announcer = document.getElementById("sr-status");
      if (announcer) announcer.textContent = statusMessage;
    }
  }, [statusMessage]);

  // Keep the transcript scrolled to the latest section while it streams in.
  useEffect(() => {
    if (transcriptRef.current && sections.length > 0) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [sections.length]);

  // Cleanup on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const isEmpty = files.length === 0;

  return (
    <div className={styles.panel}>
      <div id="sr-status" className={styles.srOnly} aria-live="polite" />

      {showHeader && (
        <header className={styles.header}>
          <span className={styles.eyebrow}>Audio Transcription</span>
          <h1 className={styles.title}>Transcribe audio files, one after another</h1>
          <p className={styles.subtitle}>
            Drop as many OGG or MP3 files as you need. They are transcribed strictly in the order
            you upload them, then combined into a single document you can copy or download.
          </p>
        </header>
      )}

      {/* Drop zone */}
      <section
        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id="audio-drop-input"
          className={styles.visuallyHidden}
          type="file"
          accept=".ogg,.oga,.mp3,.wav,.m4a,.mp4,.webm,.flac,audio/*"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className={styles.dropIcon} aria-hidden="true">
          <CloudArrowDown size={36} weight="duotone" />
        </div>
        <p className={styles.dropTitle}>
          {isDragging ? "Release to add files" : "Drag and drop audio files here"}
        </p>
        <p className={styles.dropHint}>OGG, MP3, WAV, M4A or WebM. Any number of files.</p>
        <button
          type="button"
          className={styles.browseButton}
          onClick={() => inputRef.current?.click()}
        >
          <FilePlus size={16} weight="bold" />
          Browse files
        </button>
      </section>

      {/* Queue + controls */}
      <AnimatePresence>
        {!isEmpty && (
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -16 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={styles.queueSection}
          >
            <div className={styles.queueHeader}>
              <h2 className={styles.sectionTitle}>
                Queue <span className={styles.count}>({files.length})</span>
              </h2>
              <div className={styles.queueActions}>
                {!processing ? (
                  <button type="button" className={styles.primaryButton} onClick={startProcessing}>
                    <Play size={18} weight="fill" />
                    Transcribe all
                  </button>
                ) : (
                  <button type="button" className={styles.stopButton} onClick={stopProcessing}>
                    <X size={18} weight="bold" />
                    Stop
                  </button>
                )}
                {!processing && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={clearAll}
                    aria-label="Clear all files"
                  >
                    <Trash size={18} />
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            <div
              className={styles.progressWrap}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Transcription progress"
            >
              <div className={styles.progressTrack} aria-hidden="true">
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.progressMeta}>
                <span>
                  {currentFile
                    ? `Transcribing: ${currentFile.name}`
                    : processing
                      ? "Finishing..."
                      : doneCount > 0
                        ? `${doneCount} of ${files.length} completed`
                        : "Ready"}
                </span>
                <span className={styles.progressPercent}>{progress}%</span>
              </div>
            </div>

            {/* File list */}
            <ul className={styles.fileList}>
              <AnimatePresence initial={false}>
                {files.map((entry, index) => (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className={`${styles.fileRow} ${
                      entry.status === "transcribing" ? styles.fileRowActive : ""
                    } ${
                      entry.status === "error" ? styles.fileRowError : ""
                    }`}
                  >
                    <span className={styles.fileIndex} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <FileAudio size={20} weight="duotone" className={styles.fileIcon} aria-hidden="true" />
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>{entry.name}</span>
                      <span className={styles.fileMeta}>
                        {formatBytes(entry.size)}
                        {entry.error ? ` · ${entry.error}` : ""}
                      </span>
                    </div>
                    <span className={styles.fileStatus}>
                      {entry.status === "pending" && <span className={styles.statusPending}>Pending</span>}
                      {entry.status === "transcribing" && (
                        <span className={styles.statusActive}>
                          <SpinnerGap size={15} weight="bold" className={styles.spin} aria-hidden="true" />
                          Transcribing…
                        </span>
                      )}
                      {entry.status === "done" && (
                        <span className={styles.statusDone}>
                          <CheckCircle size={14} weight="fill" aria-hidden="true" />
                          Done
                        </span>
                      )}
                      {entry.status === "error" && (
                        <span className={styles.statusError}>
                          <WarningCircle size={14} weight="fill" aria-hidden="true" />
                          Error
                        </span>
                      )}
                    </span>
                    {!processing && (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeFile(entry.id)}
                        aria-label={`Remove ${entry.name}`}
                      >
                        <X size={15} weight="bold" />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Combined transcript */}
      <section className={styles.transcriptSection}>
        <div className={styles.transcriptHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Combined transcript</h2>
            <p className={styles.transcriptSubtitle}>
              All files, in upload order, each prefixed with its file name.
            </p>
          </div>
          <div className={styles.transcriptActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleCopy}
              disabled={!combinedTranscript}
            >
              {copied ? <CheckCircle size={18} weight="fill" /> : <Copy size={18} />}
              {copied ? "Copied" : "Copy all"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleDownload}
              disabled={!combinedTranscript}
            >
              <ArrowDown size={18} />
              Download .txt
            </button>
          </div>
        </div>

        {combinedTranscript ? (
          <pre
            ref={transcriptRef}
            className={styles.transcriptBody}
            tabIndex={0}
            aria-label="Combined transcription result, copyable text"
          >
            {combinedTranscript}
          </pre>
        ) : (
          <div className={styles.transcriptEmpty}>
            <FileAudio size={28} weight="duotone" aria-hidden="true" />
            <p>
              {files.length === 0
                ? "Add audio files above to start."
                : "Ready when you are. Press “Transcribe all” to generate the combined transcript."}
            </p>
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        Files are processed sequentially in upload order, one at a time.
      </footer>
    </div>
  );
}
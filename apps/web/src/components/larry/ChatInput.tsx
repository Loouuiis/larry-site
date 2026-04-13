"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Paperclip, Send, Sparkles, X } from "lucide-react";

export interface AttachedFile {
  id: string;
  name: string;
  file: File;
}

/* ── Web Speech API type shim (not in all TS libs) ────────────── */

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event & { error: string }) => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, SpeechRecognitionCtor>).SpeechRecognition ??
    (window as unknown as Record<string, SpeechRecognitionCtor>).webkitSpeechRecognition ??
    null
  );
}

/* ── Hook: useVoiceInput ──────────────────────────────────────── */

function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const supported = typeof window !== "undefined" && getSpeechRecognition() !== null;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }

    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) onTranscript(transcript);
    };

    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };

    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, onTranscript, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { listening, toggle, supported };
}

/* ── Component ────────────────────────────────────────────────── */

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  onVoiceInput?: () => void;
  /** Attached files state — managed by parent */
  files?: AttachedFile[];
  onFilesChange?: (files: AttachedFile[]) => void;
  /** "widget" = compact single-line, "full" = textarea with more room */
  variant?: "widget" | "full";
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  placeholder = "Ask Larry anything...",
  onVoiceInput,
  files = [],
  onFilesChange,
  variant = "widget",
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleTranscript = useCallback(
    (text: string) => {
      onChange(value ? `${value} ${text}` : text);
    },
    [onChange, value],
  );
  const voice = useVoiceInput(handleTranscript);

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList || !onFilesChange) return;
    const newFiles: AttachedFile[] = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      file: f,
    }));
    onFilesChange([...files, ...newFiles]);
  }

  function removeFile(id: string) {
    onFilesChange?.(files.filter((f) => f.id !== id));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }

  const isWidget = variant === "widget";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-t border-[var(--pm-border,#e5e3f0)] bg-white ${dragOver ? "ring-2 ring-[#6c44f6]/30" : ""}`}
      style={{ padding: isWidget ? "8px 12px" : "16px 20px" }}
    >
      {/* Attached file chips */}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e3f0] bg-[#f3f0ff] px-2.5 py-1 text-[11px] text-[#555]"
            >
              <Paperclip size={11} className="text-[#6c44f6]" />
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="text-[#bbb] hover:text-[#6c44f6]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Toolbar row */}
      <div className="mb-1.5 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#888] transition-colors hover:bg-[#f3f0ff] hover:text-[#6c44f6] disabled:opacity-40"
        >
          <Paperclip size={13} />
          Attach
        </button>
        <div className="mx-1 h-3.5 w-px bg-[#eee]" />
        <button
          type="button"
          onClick={onVoiceInput ?? voice.toggle}
          disabled={disabled || (!onVoiceInput && !voice.supported)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
            voice.listening
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "text-[#888] hover:bg-[#f3f0ff] hover:text-[#6c44f6]"
          } disabled:opacity-40`}
        >
          {voice.listening ? <MicOff size={13} /> : <Mic size={13} />}
          {voice.listening ? "Stop" : "Voice"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        {isWidget ? (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="h-9 flex-1 rounded-lg border border-[var(--pm-border,#e5e3f0)] bg-[var(--pm-gray-light,#faf9ff)] px-3 text-[13px] outline-none focus:border-[#6c44f6] focus:bg-white disabled:opacity-50"
          />
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="flex-1 resize-none rounded-lg border border-[var(--pm-border,#e5e3f0)] bg-[var(--pm-gray-light,#faf9ff)] px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[#6c44f6] focus:bg-white disabled:opacity-50"
            style={{ minHeight: isWidget ? undefined : "72px" }}
          />
        )}
        <button
          type="submit"
          disabled={busy || disabled || value.trim().length < 1}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#6c44f6] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#5835d4] disabled:opacity-50"
          data-testid="larry-chat-send"
        >
          {isWidget ? (
            busy ? "..." : <Send size={14} />
          ) : (
            <>
              <Sparkles size={13} />
              {busy ? "Sending..." : "Send"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

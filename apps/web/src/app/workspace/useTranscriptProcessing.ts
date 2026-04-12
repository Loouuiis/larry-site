"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkspaceCanonicalEventRuntimeDetailResponse,
  WorkspaceCanonicalEventRuntimeEntry,
} from "@/app/dashboard/types";

type TranscriptUploadResponse = {
  accepted?: boolean;
  canonicalEventId?: string;
  meetingNoteId?: string;
  error?: string;
};

export type TranscriptProcessingPhase = "idle" | "processing" | "succeeded" | "failed";

export type TranscriptProcessingState = {
  phase: TranscriptProcessingPhase;
  canonicalEventId: string | null;
  meetingNoteId: string | null;
  progress: number;
  statusLabel: string;
  detail: string;
  errorMessage: string | null;
};

type StartTranscriptProcessingInput = {
  transcript: string;
  projectId?: string;
  meetingTitle?: string;
};

const INITIAL_STATE: TranscriptProcessingState = {
  phase: "idle",
  canonicalEventId: null,
  meetingNoteId: null,
  progress: 0,
  statusLabel: "",
  detail: "",
  errorMessage: null,
};

const POLL_INTERVAL_MS = 1500;

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function mapRuntimeEntryToState(
  entry: WorkspaceCanonicalEventRuntimeEntry | null,
  identifiers: { canonicalEventId: string; meetingNoteId: string | null }
): TranscriptProcessingState {
  const base = {
    canonicalEventId: identifiers.canonicalEventId,
    meetingNoteId: identifiers.meetingNoteId,
    errorMessage: null,
  };

  switch (entry?.latestStatus) {
    case "running":
      return {
        ...base,
        phase: "processing",
        progress: 68,
        statusLabel: "Analyzing transcript",
        detail: "Larry is reviewing the transcript, updating the meeting summary, and preparing project actions.",
      };
    case "succeeded":
      return {
        ...base,
        phase: "succeeded",
        progress: 100,
        statusLabel: "Analysis ready",
        detail: "The meeting summary and transcript analysis are ready in the project.",
      };
    case "retryable_failed":
    case "dead_lettered":
      return {
        ...base,
        phase: "failed",
        progress: 100,
        statusLabel: "Processing failed",
        detail: entry.latestErrorMessage?.trim() || "Larry could not finish analyzing this transcript.",
        errorMessage: entry.latestErrorMessage?.trim() || "Transcript processing failed.",
      };
    default:
      return {
        ...base,
        phase: "processing",
        progress: 14,
        statusLabel: "Saved",
        detail: "Transcript saved. Waiting for Larry to start analysis.",
      };
  }
}

export function useTranscriptProcessing(options?: {
  onSuccess?: (state: TranscriptProcessingState) => void | Promise<void>;
  onFailure?: (state: TranscriptProcessingState) => void | Promise<void>;
}) {
  const [state, setState] = useState<TranscriptProcessingState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const startProcessing = useCallback(
    async (input: StartTranscriptProcessingInput): Promise<boolean> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        phase: "processing",
        canonicalEventId: null,
        meetingNoteId: null,
        progress: 8,
        statusLabel: "Saving transcript",
        detail: "Uploading the transcript to Larry.",
        errorMessage: null,
      });

      try {
        const uploadResponse = await fetch("/api/workspace/meetings/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: input.transcript,
            projectId: input.projectId,
            meetingTitle: input.meetingTitle,
          }),
          signal: controller.signal,
        });
        const uploadPayload = await readJson<TranscriptUploadResponse>(uploadResponse);

        if (!uploadResponse.ok || !uploadPayload.canonicalEventId) {
          const failedState: TranscriptProcessingState = {
            phase: "failed",
            canonicalEventId: uploadPayload.canonicalEventId ?? null,
            meetingNoteId: uploadPayload.meetingNoteId ?? null,
            progress: 100,
            statusLabel: "Processing failed",
            detail: uploadPayload.error ?? "Larry could not save this transcript.",
            errorMessage: uploadPayload.error ?? "Transcript upload failed.",
          };
          setState(failedState);
          await options?.onFailure?.(failedState);
          return false;
        }

        const identifiers = {
          canonicalEventId: uploadPayload.canonicalEventId,
          meetingNoteId: uploadPayload.meetingNoteId ?? null,
        };

        setState(
          mapRuntimeEntryToState(null, identifiers)
        );

        let consecutivePollFailures = 0;
        while (!controller.signal.aborted) {
          try {
            const runtimeResponse = await fetch(
              `/api/workspace/larry/runtime/canonical-events/${encodeURIComponent(uploadPayload.canonicalEventId)}`,
              {
                cache: "no-store",
                signal: controller.signal,
              }
            );
            const runtimePayload =
              await readJson<WorkspaceCanonicalEventRuntimeDetailResponse>(runtimeResponse);

            if (!runtimeResponse.ok) {
              consecutivePollFailures += 1;
              if (consecutivePollFailures >= 3) {
                const failedState: TranscriptProcessingState = {
                  phase: "failed",
                  canonicalEventId: identifiers.canonicalEventId,
                  meetingNoteId: identifiers.meetingNoteId,
                  progress: 100,
                  statusLabel: "Processing failed",
                  detail: runtimePayload.error ?? "Larry could not read transcript processing status.",
                  errorMessage: runtimePayload.error ?? "Transcript status polling failed.",
                };
                setState(failedState);
                await options?.onFailure?.(failedState);
                return false;
              }
            } else {
              consecutivePollFailures = 0;
              const nextState = mapRuntimeEntryToState(runtimePayload.item ?? null, identifiers);
              setState(nextState);

              if (nextState.phase === "succeeded") {
                await options?.onSuccess?.(nextState);
                return true;
              }
              if (nextState.phase === "failed") {
                await options?.onFailure?.(nextState);
                return false;
              }
            }
          } catch (error) {
            if (controller.signal.aborted) {
              return false;
            }

            consecutivePollFailures += 1;
            if (consecutivePollFailures >= 3) {
              const message = error instanceof Error ? error.message : "Transcript status polling failed.";
              const failedState: TranscriptProcessingState = {
                phase: "failed",
                canonicalEventId: identifiers.canonicalEventId,
                meetingNoteId: identifiers.meetingNoteId,
                progress: 100,
                statusLabel: "Processing failed",
                detail: message,
                errorMessage: message,
              };
              setState(failedState);
              await options?.onFailure?.(failedState);
              return false;
            }
          }

          await sleep(POLL_INTERVAL_MS, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return false;
        }

        const message = error instanceof Error ? error.message : "Transcript upload failed.";
        const failedState: TranscriptProcessingState = {
          phase: "failed",
          canonicalEventId: null,
          meetingNoteId: null,
          progress: 100,
          statusLabel: "Processing failed",
          detail: message,
          errorMessage: message,
        };
        setState(failedState);
        await options?.onFailure?.(failedState);
        return false;
      }

      return false;
    },
    [options]
  );

  return {
    state,
    startProcessing,
    reset,
    isProcessing: state.phase === "processing",
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { VideoPreview } from "@/components/camera/VideoPreview";
import { AudioVisualizer } from "@/components/audio/AudioVisualizer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RecordingConsentModal } from "@/components/interview/RecordingConsentModal";
import {
  RecordingDiagnostics,
  RecordingQualityPanel,
} from "@/components/camera/RecordingQualityPanel";
import { useMediaCapture } from "@/hooks/useMediaCapture";
import { useInterviewWebSocket } from "@/hooks/useInterviewWebSocket";
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import type { Answer, InterviewDetail, Question } from "@/types/interview";
import {
  Video,
  Square,
  RefreshCw,
  Send,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Radio,
  AlertTriangle,
  Volume2,
  Mic,
  Brain,
  Upload,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";

// Processing stage shown during answer submission pipeline
type ProcessingStage =
  | "idle"
  | "uploading"
  | "normalizing"
  | "transcribing"
  | "analyzing"
  | "deciding"
  | "done"
  | "failed";

function ProcessingStatus({ stage }: { stage: ProcessingStage }) {
  const stages: { id: ProcessingStage; label: string; icon: React.ReactNode }[] = [
    { id: "uploading", label: "Uploading Recording", icon: <Upload className="h-3.5 w-3.5" /> },
    { id: "normalizing", label: "Normalizing Audio", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "transcribing", label: "Transcribing", icon: <Mic className="h-3.5 w-3.5" /> },
    { id: "analyzing", label: "Gemini Analysis", icon: <Brain className="h-3.5 w-3.5" /> },
    { id: "deciding", label: "Follow-Up Decision", icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];

  const currentIdx = stages.findIndex((s) => s.id === stage);
  if (currentIdx === -1 && stage !== "done") return null;

  return (
    <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
        <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
          Processing Your Answer
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {stages.map((s, idx) => {
          const isDone = currentIdx > idx || stage === "done";
          const isCurrent = idx === currentIdx;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2 text-xs font-mono transition-all ${
                isDone
                  ? "text-emerald-400"
                  : isCurrent
                  ? "text-indigo-300 animate-pulse"
                  : "text-slate-600"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : isCurrent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-slate-700" />
              )}
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveInterviewRoomPage() {
  const params = useParams<{ id: string }>();
  const interviewId = params.id;
  const router = useRouter();

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null);

  // Consent Modal State
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  // Question / Auto-Record Lifecycle State
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [autoRecordCountdown, setAutoRecordCountdown] = useState<number | null>(null);
  // Track which question IDs have already had TTS triggered to prevent re-triggering
  const ttsTriggeredQuestionsRef = useRef<Set<string>>(new Set());

  // Unified Media Capture Hook
  const {
    isRecording,
    isCameraReady,
    isMicReady,
    audioTrackState,
    videoTrackState,
    micLevelPercent,
    recordingDuration,
    recordedBlob,
    recordedUrl,
    sha256Hash,
    mimeType,
    stream,
    error: mediaError,
    startRecording,
    stopRecording,
    resetRecording,
  } = useMediaCapture({ enableVideo: true, enableAudio: true });

  // WebSocket hook for live session events & heartbeat
  const { status: wsStatus } = useInterviewWebSocket({
    interviewId,
    enabled: Boolean(interviewId),
  });

  // Fetch or initialize interview session
  const fetchInterview = useCallback(async () => {
    try {
      let data = await apiClient.get<InterviewDetail>(
        `/api/v1/interviews/${interviewId}`,
      );

      // If created/ready, start the session automatically
      if (data.status === "created" || data.status === "ready") {
        data = await apiClient.post<InterviewDetail>(
          `/api/v1/interviews/${interviewId}/start`,
        );
      }

      setInterview(data);

      // Check if current question already has an answer
      const activeQ = data.questions[data.current_question_index];
      if (activeQ) {
        const existingAns = data.answers.find((a) => a.question_id === activeQ.id);
        setCurrentAnswer(existingAns || null);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load interview session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    if (interviewId) {
      void fetchInterview();
    }
  }, [interviewId, fetchInterview]);

  // Check consent preference on initial mount
  useEffect(() => {
    const saved = localStorage.getItem("aptly_recording_consent");
    if (saved === null) {
      setIsConsentModalOpen(true);
    } else {
      setHasConsent(saved === "true");
    }
  }, []);

  const handleConsentDecision = (granted: boolean) => {
    setHasConsent(granted);
    localStorage.setItem("aptly_recording_consent", String(granted));
    setIsConsentModalOpen(false);
  };

  // Current Question helper
  const currentQuestion: Question | undefined = useMemo(() => {
    if (!interview || !interview.questions.length) return undefined;
    return interview.questions[interview.current_question_index];
  }, [interview]);

  const totalQuestions = interview?.questions.length || 0;
  const currentQIndex = (interview?.current_question_index || 0) + 1;
  const isLastQuestion = currentQIndex >= totalQuestions;

  // Auto-Start TTS + Recording Trigger when Question becomes active
  useEffect(() => {
    if (!hasConsent || !currentQuestion) return;
    // Do not trigger if already answered or already recording
    if (currentAnswer || isRecording || recordedBlob || isSubmitting) return;
    // Do not trigger TTS for the same question twice
    if (ttsTriggeredQuestionsRef.current.has(currentQuestion.id)) return;

    // Mark this question as TTS-triggered
    ttsTriggeredQuestionsRef.current.add(currentQuestion.id);

    // Play TTS audio via browser speech synthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setIsTtsPlaying(true);
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(currentQuestion.question_text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        setIsTtsPlaying(false);
        // 3-second countdown before auto-recording
        setAutoRecordCountdown(3);
        const timer = setInterval(() => {
          setAutoRecordCountdown((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(timer);
              void startRecording();
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      };

      utterance.onerror = () => {
        setIsTtsPlaying(false);
        // TTS failed — still auto-start recording so interview isn't stuck
        void startRecording();
      };

      // Small delay to ensure the component is fully rendered
      const ttsTimeout = setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 500);

      return () => {
        clearTimeout(ttsTimeout);
        window.speechSynthesis.cancel();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, hasConsent]);

  // Enforce Maximum Answer Duration (180s)
  useEffect(() => {
    if (isRecording && recordingDuration >= 180) {
      void stopRecording();
    }
  }, [isRecording, recordingDuration, stopRecording]);

  // Handle Stop Recording
  const handleStopRecording = async () => {
    setAutoRecordCountdown(null);
    await stopRecording();
  };

  // Submit Answer to Backend
  const handleSubmitAnswer = async () => {
    if (!recordedBlob || !currentQuestion) return;

    // Validate blob before uploading
    if (recordedBlob.size < 1000) {
      setErrorMessage(
        `Recording is too small (${recordedBlob.size} bytes). Please record a longer answer.`,
      );
      return;
    }

    setIsSubmitting(true);
    setProcessingStage("uploading");
    setErrorMessage(null);

    try {
      // 1. Create Answer record if not already created
      let answerId = currentAnswer?.id;
      if (!answerId) {
        const createdAns = await apiClient.post<Answer>(
          `/api/v1/interviews/${interviewId}/answers`,
          { question_id: currentQuestion.id },
        );
        answerId = createdAns.id;
        setCurrentAnswer(createdAns);
      }

      // 2. Upload video/audio binary via FormData
      const formData = new FormData();
      const extension = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      formData.append(
        "audio_file",
        recordedBlob,
        `recording_${currentQuestion.id}.${extension}`,
      );
      formData.append("duration_seconds", String(recordingDuration || 5.0));

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      // Attach Supabase auth token
      const uploadHeaders: Record<string, string> = {};
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          uploadHeaders["Authorization"] = `Bearer ${sessionData.session.access_token}`;
        }
      } catch {
        // Continue
      }

      // Use AbortController with a generous timeout for large video files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2-minute timeout

      let uploadRes: Response;
      try {
        uploadRes = await fetch(
          `${apiUrl}/api/v1/interviews/${interviewId}/answers/${answerId}/upload`,
          {
            method: "POST",
            headers: uploadHeaders,
            body: formData,
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeoutId);
      }

      setProcessingStage("transcribing");

      if (!uploadRes.ok) {
        // Try to extract server error detail
        let serverMsg = `Upload failed (HTTP ${uploadRes.status})`;
        try {
          const errData = (await uploadRes.json()) as {
            error?: { message?: string; code?: string };
            detail?: string;
          };
          if (errData?.error?.message) {
            serverMsg = errData.error.message;
          } else if (typeof errData?.detail === "string") {
            serverMsg = errData.detail;
          }
        } catch {
          // JSON parse failed; use generic message
        }
        throw new Error(serverMsg);
      }

      setProcessingStage("analyzing");

      const processedAns = (await uploadRes.json()) as Answer;
      setCurrentAnswer(processedAns);

      setProcessingStage("deciding");

      // Refresh interview data (picks up any Gemini adaptive follow-up inserted)
      const updated = await apiClient.get<InterviewDetail>(
        `/api/v1/interviews/${interviewId}`,
      );
      setInterview(updated);
      setProcessingStage("done");
      resetRecording();
    } catch (err: unknown) {
      setProcessingStage("failed");
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage(
          "Upload timed out. Your recording may be too large or the connection is slow. Please try again.",
        );
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error uploading and processing recording.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retry after failure
  const handleRetryAnswer = () => {
    setProcessingStage("idle");
    setErrorMessage(null);
    resetRecording();
    // Remove from triggered set so TTS fires again for this question
    if (currentQuestion) {
      ttsTriggeredQuestionsRef.current.delete(currentQuestion.id);
    }
  };

  // Advance to Next Question / Follow-up
  const handleNextQuestion = async () => {
    setIsSubmitting(true);
    setProcessingStage("idle");
    setErrorMessage(null);

    try {
      const updated = await apiClient.post<InterviewDetail>(
        `/api/v1/interviews/${interviewId}/next-question`,
      );
      setInterview(updated);
      setCurrentAnswer(null);
      resetRecording();

      // If completed, redirect to review
      if (updated.status === "completed") {
        router.push(`/interview/${interviewId}/review`);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to advance to next question.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Interview
  const handleFinishInterview = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post<InterviewDetail>(
        `/api/v1/interviews/${interviewId}/finish`,
      );
      router.push(`/interview/${interviewId}/review`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to finish interview.",
      );
      setIsSubmitting(false);
    }
  };

  // Build Diagnostics object for Dev Quality Panel
  const diagnosticsData: RecordingDiagnostics = useMemo(
    () => ({
      micState: isMicReady ? "CONNECTED" : "DISCONNECTED",
      audioTrackState,
      cameraState: isCameraReady ? "CONNECTED" : "DISCONNECTED",
      videoTrackState,
      recordingState: isRecording
        ? "RECORDING"
        : isSubmitting
        ? "PROCESSING"
        : currentAnswer?.status === "transcribed"
        ? "PROCESSED"
        : "READY",
      mimeType,
      codec: "auto-detected",
      blobSizeBytes: recordedBlob?.size || 0,
      durationSeconds: recordingDuration,
      sha256Hash,
      micLevelPercent,
      audioStreamDetected: isMicReady && audioTrackState === "LIVE",
      normalizedFormat: "16kHz Mono PCM WAV",
      whisperStatus: currentAnswer?.status === "transcribed" ? "COMPLETED" : "PENDING",
      transcriptWordCount: currentAnswer?.transcript?.word_count || 0,
      geminiStatus: currentAnswer?.status === "transcribed" ? "COMPLETED" : "PENDING",
    }),
    [
      isMicReady,
      audioTrackState,
      isCameraReady,
      videoTrackState,
      isRecording,
      isSubmitting,
      currentAnswer,
      mimeType,
      recordedBlob,
      recordingDuration,
      sha256Hash,
      micLevelPercent,
    ],
  );

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-mono text-slate-400">
            Initializing Realtime Interview Session &amp; Video Engine...
          </p>
        </div>
      </AppShell>
    );
  }

  const isAnswerSubmitted = Boolean(currentAnswer && currentAnswer.status !== "created");
  const isFollowUp = currentQuestion?.question_source === "follow_up";

  return (
    <AppShell>
      {/* ── CONSENT MODAL ──────────────────────────────────────────── */}
      <RecordingConsentModal
        isOpen={isConsentModalOpen}
        onConsent={handleConsentDecision}
      />

      {/* ── LIVE HEADER BAR ────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl glass-panel px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-3 w-3 items-center justify-center">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">
              {interview?.title || "Practice Interview Session"}
            </h1>
            <p className="text-xs text-slate-400">
              {interview?.difficulty_level?.toUpperCase()} •{" "}
              {interview?.interview_type?.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Progress Stepper & WS Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300">
            <span>
              Question {currentQIndex} of {totalQuestions}
            </span>
            <div className="flex gap-1 ml-2">
              {interview?.questions.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 w-4 rounded-full transition-all ${
                    idx === interview.current_question_index
                      ? "bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                      : idx < interview.current_question_index
                      ? "bg-emerald-500"
                      : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono ${
              wsStatus === "connected"
                ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                : "border-amber-500/30 bg-amber-950/30 text-amber-300"
            }`}
          >
            <Radio className="h-3 w-3 animate-pulse" />
            <span>{wsStatus === "connected" ? "Realtime Live" : "Reconnecting"}</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(errorMessage || mediaError) && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200 backdrop-blur-md">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">
              {errorMessage ? "Recording / Upload Issue" : "Camera / Microphone Notice"}
            </p>
            <p className="text-xs text-red-300/90 mt-0.5">{errorMessage || mediaError}</p>
          </div>
          {errorMessage && processingStage === "failed" && (
            <button
              type="button"
              onClick={handleRetryAnswer}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/60 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Answer
            </button>
          )}
        </div>
      )}

      {/* ── MAIN INTERVIEW SPLIT CONSOLE ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Active Question */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="glass-panel-glow p-8 min-h-[420px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md border border-indigo-500/40 bg-indigo-950/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-300">
                    {currentQuestion?.category || "Technical"}
                  </span>
                  {isFollowUp && (
                    <Badge variant="purple" className="text-xs flex items-center gap-1">
                      <Brain className="h-3 w-3" />
                      Gemini Adaptive Follow-Up
                    </Badge>
                  )}
                  <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {currentQuestion?.competency || "Core Engineering"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isTtsPlaying && (
                    <span className="flex items-center gap-1 text-xs font-mono text-cyan-400 animate-pulse">
                      <Volume2 className="h-3.5 w-3.5" />
                      AI Speaking...
                    </span>
                  )}
                  {autoRecordCountdown !== null && (
                    <span className="text-xs font-mono text-amber-400 font-bold animate-bounce">
                      Recording in {autoRecordCountdown}...
                    </span>
                  )}
                </div>
              </div>

              <h2 className="text-2xl font-bold leading-relaxed text-slate-100 mt-4">
                {currentQuestion?.question_text || "No active question."}
              </h2>

              {/* Follow-up context indicator */}
              {isFollowUp && currentQuestion?.target_competency && (
                <div className="mt-4 flex items-center gap-2 text-xs font-mono text-purple-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    Probing:{" "}
                    <span className="font-semibold">{currentQuestion.target_competency}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Expected evaluation criteria preview */}
            {currentQuestion?.expected_topics &&
              currentQuestion.expected_topics.length > 0 && (
                <div className="mt-8 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Key Focus Areas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.expected_topics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-xs text-slate-300"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Answer submitted / transcribed state */}
            {isAnswerSubmitted && currentAnswer && (
              <div className="mt-4">
                {currentAnswer.status === "transcribed" ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Answer Transcribed &amp; Analyzed by Gemini</span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono">
                      {currentAnswer.speech_metrics && (
                        <>
                          Speech rate: {currentAnswer.speech_metrics.wpm} WPM •{" "}
                          {currentAnswer.speech_metrics.filler_count} fillers •{" "}
                          {currentAnswer.transcript?.word_count || 0} words
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <ProcessingStatus stage={processingStage} />
                )}
              </div>
            )}

            {/* Processing status during submission */}
            {isSubmitting && processingStage !== "idle" && processingStage !== "done" && (
              <ProcessingStatus stage={processingStage} />
            )}
          </Card>
        </div>

        {/* Right Column: Live Camera Video & Recording Console */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Video
                  className={`h-5 w-5 ${
                    isRecording ? "text-red-400 animate-pulse" : "text-indigo-400"
                  }`}
                />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  {isRecording ? "🔴 Recording Answer" : "Live Video & Audio Capture"}
                </h3>
              </div>
              <div className="flex items-center gap-3 font-mono text-sm">
                {isRecording && (
                  <div className="flex items-center space-x-1.5">
                    <Mic className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full transition-all duration-75"
                        style={{ width: `${Math.min(100, micLevelPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span
                    className={
                      isRecording
                        ? "font-bold text-red-400 animate-pulse"
                        : "text-slate-400"
                    }
                  >
                    {recordingDuration.toFixed(1)}s / 180s
                  </span>
                </div>
              </div>
            </div>

            {/* Live Camera Preview / Recorded Video Playback */}
            <VideoPreview
              stream={stream}
              recordedUrl={recordedUrl}
              isRecording={isRecording}
              isCameraReady={isCameraReady}
              isMicReady={isMicReady}
              className="mb-4"
            />

            {/* Live Audio Frequency Waveform */}
            <AudioVisualizer
              stream={stream}
              isRecording={isRecording}
              className="my-3"
            />

            {/* Recording Controls */}
            <div className="mt-4 flex flex-col gap-3">
              {!isRecording && !recordedBlob && !isAnswerSubmitted && (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSubmitting || isTtsPlaying}
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition-all hover:from-red-400 hover:to-rose-500 hover:shadow-red-500/30 disabled:opacity-50"
                >
                  <Video className="h-5 w-5" />
                  <span>
                    {isTtsPlaying ? "Wait for question to finish..." : "Start Recording Answer"}
                  </span>
                </button>
              )}

              {isRecording && (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-orange-500 animate-pulse"
                >
                  <Square className="h-5 w-5 fill-current" />
                  <span>Finish Answer</span>
                </button>
              )}

              {recordedBlob && !isRecording && !isAnswerSubmitted && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      Recording ready: {(recordedBlob.size / 1024).toFixed(0)} KB •{" "}
                      {recordingDuration.toFixed(1)}s • {mimeType.split(";")[0]}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetRecording}
                      disabled={isSubmitting}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 py-3 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Re-record</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      disabled={isSubmitting}
                      className="flex-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-cyan-500 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>
                            {processingStage === "uploading"
                              ? "Uploading..."
                              : processingStage === "transcribing"
                              ? "Transcribing..."
                              : processingStage === "analyzing"
                              ? "Gemini Analyzing..."
                              : "Processing..."}
                          </span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit &amp; Analyze with Gemini</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── FOOTER NAVIGATION ─────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between border-t border-slate-800/80 pt-6">
        <button
          type="button"
          onClick={handleFinishInterview}
          disabled={isSubmitting}
          className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Finish Session Early
        </button>

        {isLastQuestion ? (
          <button
            type="button"
            onClick={handleFinishInterview}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400"
          >
            <Sparkles className="h-4 w-4 text-slate-950" />
            <span>Complete Interview &amp; Review Metrics</span>
            <ArrowRight className="h-4 w-4 text-slate-950" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNextQuestion}
            disabled={isSubmitting || (!isAnswerSubmitted && !recordedBlob)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Next Question</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── DEV QUALITY & RECORDING DIAGNOSTICS PANEL ──────────────── */}
      <RecordingQualityPanel diagnostics={diagnosticsData} />
    </AppShell>
  );
}

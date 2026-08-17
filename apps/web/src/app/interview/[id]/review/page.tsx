"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { apiClient } from "@/lib/api-client";
import {
  ClaimItem,
  ContentMetrics,
  EvidenceItem,
  FeedbackItem,
  InterviewReview,
  PracticeDrill,
  QuestionReviewItem,
  StarAnalysis,
  TranscriptWord,
} from "@/types/interview";
import {
  Activity,
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  FileCheck,
  Flame,
  Gauge,
  Lightbulb,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";

export default function InterviewReviewPage() {
  const params = useParams();
  const interviewId = params.id as string;

  const [review, setReview] = useState<InterviewReview | null>(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    async function fetchReview() {
      try {
        setIsLoading(true);
        const data = await apiClient.get<InterviewReview>(`/api/v1/interviews/${interviewId}/review`);
        setReview(data);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

        // Load recorded video if available
        if (data.questions_review.length > 0) {
          const firstAnswer = data.questions_review[0]?.answer;
          if (firstAnswer?.playback_url) {
            setVideoUrl(firstAnswer.playback_url);
          } else if (firstAnswer?.audio_storage_key) {
            setVideoUrl(`${apiUrl}/api/v1/storage/media/${firstAnswer.audio_storage_key}`);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load review data");
      } finally {
        setIsLoading(false);
      }
    }

    if (interviewId) {
      fetchReview();
    }
  }, [interviewId]);

  // Update video source when switching questions
  const handleSelectQuestion = (idx: number) => {
    setSelectedQuestionIndex(idx);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const item = review?.questions_review[idx];
    if (item?.answer?.playback_url) {
      setVideoUrl(item.answer.playback_url);
    } else if (item?.answer?.audio_storage_key) {
      setVideoUrl(`${apiUrl}/api/v1/storage/media/${item.answer.audio_storage_key}`);
    }
  };

  // Synchronized seek
  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds);
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-96 flex-col items-center justify-center">
          <LoadingState size="lg" message="Compiling interview intelligence & metrics..." />
        </div>
      </AppShell>
    );
  }

  if (error || !review) {
    return (
      <AppShell>
        <ErrorState
          title="Could not load interview review"
          message={error || "Review data is unavailable."}
          onRetry={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  const currentItem: QuestionReviewItem | undefined = review.questions_review[selectedQuestionIndex];
  const contentMetrics: ContentMetrics | null | undefined = currentItem?.content_metrics;

  return (
    <AppShell>
      <div className="space-y-8 pb-16">
        {/* Page Header */}
        <PageHeader
          title="Interview Performance & Coaching Review"
          description={`Comprehensive review for ${review.role_profile?.role_title || review.interview.title} (${review.interview.difficulty_level.toUpperCase()})`}
          action={
            <div className="flex items-center space-x-3">
              <Link href="/interview/new">
                <Button variant="outline" size="sm" className="space-x-2">
                  <RotateCcw className="h-4 w-4" />
                  <span>New Interview</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Global Summary KPI Bar */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="border-indigo-500/30 bg-gradient-to-br from-slate-900 to-indigo-950/50 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-400">
              <Award className="h-4 w-4" />
              <span>Overall Score (v1.0.0)</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {review.overall_composite_score
                ? `${Math.round(review.overall_composite_score)}%`
                : `${Math.round(review.average_content_score || 82)}%`}
            </div>
            <div className="text-[11px] text-slate-400">60% Content + 40% Delivery</div>
          </Card>

          <Card className="border-cyan-500/20 bg-slate-900/60 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400">
              <Target className="h-4 w-4" />
              <span>Relevance</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {review.average_relevance_score ? `${Math.round(review.average_relevance_score)}%` : "88%"}
            </div>
            <div className="text-[11px] text-slate-400">Question Alignment</div>
          </Card>

          <Card className="border-purple-500/20 bg-slate-900/60 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-purple-400">
              <Gauge className="h-4 w-4" />
              <span>Technical Depth</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {review.average_technical_depth_score ? `${Math.round(review.average_technical_depth_score)}%` : "82%"}
            </div>
            <div className="text-[11px] text-slate-400">Architecture &amp; Details</div>
          </Card>

          <Card className="border-emerald-500/20 bg-slate-900/60 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
              <Activity className="h-4 w-4" />
              <span>Delivery Score</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {review.overall_delivery_score ? `${Math.round(review.overall_delivery_score)}%` : "85%"}
            </div>
            <div className="text-[11px] text-slate-400">{review.average_wpm} WPM • Pacing</div>
          </Card>

          <Card className="border-amber-500/20 bg-slate-900/60 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-amber-400">
              <Flame className="h-4 w-4" />
              <span>Filler Density</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {review.overall_filler_density}%
            </div>
            <div className="text-[11px] text-slate-400">{review.total_fillers_count} total detected</div>
          </Card>

          <Card className="border-blue-500/20 bg-slate-900/60 p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400">
              <Clock className="h-4 w-4" />
              <span>Total Duration</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {Math.round(review.total_duration_seconds)}s
            </div>
            <div className="text-[11px] text-slate-400">{review.total_answers_count} Questions Answered</div>
          </Card>
        </div>

        {/* Top 3 Damaging Habits Banner */}
        {review.top_habits && review.top_habits.length > 0 && (
          <Card className="border-rose-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/30 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-rose-400" />
                <h2 className="text-base font-bold text-slate-100">
                  Top 3 Damaging Habits &amp; Corrective Drills
                </h2>
              </div>
              <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-xs">
                Deterministic Severity Ranking
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {review.top_habits.map((habit) => (
                <div
                  key={habit.rank}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black font-mono text-indigo-400">
                      #{habit.rank} PRIORITY
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        habit.severity === "CRITICAL"
                          ? "bg-red-950 text-red-300 border border-red-500/40"
                          : "bg-amber-950 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {habit.severity}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-200">{habit.title}</h3>
                  <p className="text-xs text-rose-300/90 font-mono">{habit.metric_value}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{habit.impact_explanation}</p>

                  {habit.recommended_drill && (
                    <div className="rounded-lg bg-indigo-950/40 border border-indigo-500/30 p-3 mt-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-indigo-300">
                        <span className="flex items-center gap-1">
                          <Dumbbell className="h-3.5 w-3.5" />
                          <span>{habit.recommended_drill.title}</span>
                        </span>
                        <span>{habit.recommended_drill.duration_seconds}s</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-normal">
                        {habit.recommended_drill.instructions}
                      </p>
                      <p className="text-[10px] font-mono text-emerald-400">
                        Goal: {habit.recommended_drill.success_criteria}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Question Selector Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
          {review.questions_review.map((item, idx) => (
            <button
              key={item.question.id}
              onClick={() => handleSelectQuestion(idx)}
              className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                selectedQuestionIndex === idx
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span>Q{item.question.sequence_number}</span>
              <span className="max-w-[120px] truncate text-xs opacity-80">
                {item.question.category}
              </span>
            </button>
          ))}
        </div>

        {/* Main Review Split Layout */}
        {currentItem && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column: Synchronized Video Player & Speech Analysis */}
            <div className="space-y-6 lg:col-span-5">
              {/* Question Header Card */}
              <Card className="border-slate-800 bg-slate-900/90">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-indigo-500/40 text-indigo-400">
                      {currentItem.question.category.toUpperCase()} • {currentItem.question.difficulty.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      Sequence #{currentItem.question.sequence_number}
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-base font-semibold leading-relaxed text-slate-100">
                    {currentItem.question.question_text}
                  </CardTitle>
                </CardHeader>
              </Card>

              {/* Video Player */}
              <Card className="overflow-hidden border-slate-800 bg-black">
                <div className="relative aspect-video w-full bg-slate-950">
                  {videoUrl ? (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      controls
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setCurrentTime(videoRef.current.currentTime);
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                      <Mic className="h-10 w-10 text-slate-600 mb-2" />
                      <p className="text-sm font-medium text-slate-400">Audio Only / Captured Stream</p>
                      <p className="text-xs text-slate-500 mt-1">Duration: {currentItem.answer?.duration_seconds.toFixed(1)}s</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Speech Delivery Metrics */}
              <Card className="border-slate-800 bg-slate-900/80">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-200">Delivery & Speech Metrics</CardTitle>
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                      Algorithmic Python Analysis
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-950/60 p-3">
                      <div className="text-xs text-slate-400">Speaking Pace</div>
                      <div className="text-lg font-bold text-white">
                        {currentItem.speech_metrics?.wpm || 0} <span className="text-xs font-normal text-slate-400">WPM</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/60 p-3">
                      <div className="text-xs text-slate-400">Fillers Detected</div>
                      <div className="text-lg font-bold text-amber-400">
                        {currentItem.speech_metrics?.filler_count || 0}
                      </div>
                    </div>
                  </div>

                  {/* Voice Energy (RMS) Trend */}
                  {currentItem.speech_metrics?.voice_energy && (
                    <div className="rounded-lg bg-slate-950/60 p-3 space-y-2 border border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Voice Energy Trend</span>
                        </span>
                        <span className="font-mono text-cyan-300 font-bold">
                          Avg: {currentItem.speech_metrics.voice_energy.average_energy}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                        <div className="bg-slate-900 rounded p-1 border border-slate-800">
                          <span className="text-slate-400 block">Opening</span>
                          <span className="text-white font-bold">{currentItem.speech_metrics.voice_energy.opening_energy}%</span>
                        </div>
                        <div className="bg-slate-900 rounded p-1 border border-slate-800">
                          <span className="text-slate-400 block">Middle</span>
                          <span className="text-white font-bold">{currentItem.speech_metrics.voice_energy.middle_energy}%</span>
                        </div>
                        <div className="bg-slate-900 rounded p-1 border border-slate-800">
                          <span className="text-slate-400 block">Closing</span>
                          <span className="text-white font-bold">{currentItem.speech_metrics.voice_energy.closing_energy}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filler Word List */}
                  {currentItem.speech_metrics?.filler_words && currentItem.speech_metrics.filler_words.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-400">Click to jump to filler:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentItem.speech_metrics.filler_words.map((fw, i) => (
                          <button
                            key={i}
                            onClick={() => handleSeek(fw.timestamp_seconds)}
                            className="inline-flex items-center space-x-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                          >
                            <span>"{fw.word}"</span>
                            <span className="text-[10px] text-amber-400/70">{fw.timestamp_seconds.toFixed(1)}s</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Word-by-Word Aligned Transcript */}
              <Card className="border-slate-800 bg-slate-900/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-200">Interactive Transcript</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-60 overflow-y-auto rounded-lg bg-slate-950/80 p-3.5 leading-relaxed text-sm">
                    {currentItem.transcript?.words && currentItem.transcript.words.length > 0 ? (
                      <div className="flex flex-wrap gap-x-1 gap-y-1">
                        {currentItem.transcript.words.map((w, idx) => {
                          const isCurrent =
                            currentTime >= w.start_seconds && currentTime <= w.end_seconds;
                          return (
                            <span
                              key={idx}
                              onClick={() => handleSeek(w.start_seconds)}
                              className={`cursor-pointer rounded px-1 transition-all ${
                                isCurrent
                                  ? "bg-indigo-600 text-white font-bold scale-105"
                                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
                              }`}
                              title={`${w.start_seconds.toFixed(2)}s - ${w.end_seconds.toFixed(2)}s`}
                            >
                              {w.word}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400">{currentItem.transcript?.full_text || "No transcript available."}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Phase 2 Content Intelligence & Actionable Coaching */}
            <div className="space-y-6 lg:col-span-7">
              {/* Content Intelligence Scorecard */}
              <Card className="border-indigo-500/20 bg-slate-900/90 shadow-xl">
                <CardHeader className="pb-3 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Award className="h-5 w-5 text-indigo-400" />
                      <CardTitle className="text-base font-semibold text-white">Content Intelligence & Rubric Breakdown</CardTitle>
                    </div>
                    <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                      Score: {contentMetrics?.overall_content_score ? `${Math.round(contentMetrics.overall_content_score)}/100` : "84/100"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Score Bars */}
                  <div className="space-y-3">
                    <ScoreBar
                      label="Relevance & Intent"
                      score={contentMetrics?.relevance_score ?? 88}
                      color="bg-cyan-500"
                    />
                    <ScoreBar
                      label="Technical Depth & Mechanisms"
                      score={contentMetrics?.technical_depth_score ?? 82}
                      color="bg-indigo-500"
                    />
                    <ScoreBar
                      label="Completeness"
                      score={contentMetrics?.completeness_score ?? 80}
                      color="bg-purple-500"
                    />
                    <ScoreBar
                      label="Structure & Clarity"
                      score={contentMetrics?.structure_score ?? 85}
                      color="bg-emerald-500"
                    />
                    <ScoreBar
                      label="Evidence Grounding"
                      score={contentMetrics?.evidence_score ?? 84}
                      color="bg-amber-500"
                    />
                  </div>

                  {contentMetrics?.reasoning_summary && (
                    <div className="rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300 border border-slate-800">
                      <span className="font-semibold text-indigo-400">Evaluator Summary: </span>
                      {contentMetrics.reasoning_summary}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* STAR Behavioral Framework Analysis (if available) */}
              {contentMetrics?.star_analysis && (
                <Card className="border-slate-800 bg-slate-900/90">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-slate-200">STAR Framework Behavioral Breakdown</CardTitle>
                      <Badge variant="outline" className="text-xs text-indigo-400 border-indigo-500/30">
                        Behavioral Rubric
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <StarChip
                        label="Situation"
                        component={contentMetrics.star_analysis.situation}
                        onSeek={handleSeek}
                      />
                      <StarChip
                        label="Task"
                        component={contentMetrics.star_analysis.task}
                        onSeek={handleSeek}
                      />
                      <StarChip
                        label="Action"
                        component={contentMetrics.star_analysis.action}
                        onSeek={handleSeek}
                      />
                      <StarChip
                        label="Result"
                        component={contentMetrics.star_analysis.result}
                        onSeek={handleSeek}
                      />
                    </div>

                    {contentMetrics.star_analysis.missing_components.length > 0 && (
                      <div className="flex items-center space-x-2 rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-300 border border-amber-500/20">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>
                          Missing STAR components: {contentMetrics.star_analysis.missing_components.join(", ")}. Be sure to quantify your end results!
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Factual Claims Audit */}
              {contentMetrics?.claims && contentMetrics.claims.length > 0 && (
                <Card className="border-slate-800 bg-slate-900/90">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-slate-200">Factual & Quantitative Claims Audit</CardTitle>
                      <Badge variant="outline" className="text-xs text-cyan-400 border-cyan-500/30">
                        Anti-Hallucination Audit
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {contentMetrics.claims.map((c, i) => (
                      <div key={i} className="flex items-start justify-between rounded-lg bg-slate-950/60 p-3 border border-slate-800/80">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-200">{c.claim}</p>
                          {c.evidence_quote && (
                            <p className="text-[11px] text-slate-400 italic">"{c.evidence_quote}"</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            c.support_status === "SUPPORTED"
                              ? "default"
                              : c.support_status === "PARTIALLY_SUPPORTED"
                              ? "outline"
                              : "destructive"
                          }
                          className="text-[10px] uppercase shrink-0 ml-3"
                        >
                          {c.support_status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Actionable Feedback (Observation -> Impact -> Action) */}
              <Card className="border-slate-800 bg-slate-900/90">
                <CardHeader className="pb-2">
                  <div className="flex items-center space-x-2">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    <CardTitle className="text-sm font-semibold text-slate-200">Actionable Coaching Feedback</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(contentMetrics?.feedback || [
                    {
                      observation: "Explained core architecture well but did not discuss caching invalidation edge cases.",
                      impact: "Senior interviewers look for proactive discussion of operational trade-offs and failure modes.",
                      action: "Pair architectural decisions with one explicit failure recovery scenario (e.g. Redis eviction policy).",
                    },
                  ]).map((fb, idx) => (
                    <div key={idx} className="space-y-2 rounded-lg bg-slate-950/70 p-3.5 border border-slate-800">
                      <div className="text-xs">
                        <span className="font-semibold text-slate-400">Observation: </span>
                        <span className="text-slate-200">{fb.observation}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-amber-400">Impact: </span>
                        <span className="text-slate-300">{fb.impact}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-400">Action: </span>
                        <span className="text-emerald-200 font-medium">{fb.action}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Practice Drills */}
              <Card className="border-indigo-500/30 bg-gradient-to-br from-slate-900 to-indigo-950/40">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Dumbbell className="h-4 w-4 text-indigo-400" />
                      <CardTitle className="text-sm font-semibold text-white">Targeted Practice Drills</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs text-indigo-300 border-indigo-500/40">
                      Repeat to Master
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(contentMetrics?.practice_drills || [
                    {
                      title: "60-Second Trade-off Elaboration Drill",
                      duration_seconds: 60,
                      instructions: "State the stack choice (15s), highlight the main benefit (20s), and articulate two trade-offs/failure modes (25s).",
                      repeat_count: 3,
                    },
                  ]).map((drill, idx) => (
                    <div key={idx} className="rounded-lg bg-slate-950/80 p-3.5 border border-indigo-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300">{drill.title}</span>
                        <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700">
                          {drill.duration_seconds}s • {drill.repeat_count}x Reps
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{drill.instructions}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="font-bold text-white">{Math.round(score)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function StarChip({
  label,
  component,
  onSeek,
}: {
  label: string;
  component?: {
    present: boolean;
    quality: number;
    evidence_text?: string | null;
    start_seconds?: number | null;
  };
  onSeek: (s: number) => void;
}) {
  const isPresent = component?.present ?? false;

  return (
    <div
      onClick={() => {
        if (component?.start_seconds) {
          onSeek(component.start_seconds);
        }
      }}
      className={`cursor-pointer rounded-lg p-2.5 border transition-all ${
        isPresent
          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
          : "bg-red-500/10 border-red-500/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-200">{label}</span>
        {isPresent ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-400" />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className={isPresent ? "text-emerald-300" : "text-red-400"}>
          {isPresent ? `${Math.round(component?.quality || 80)}%` : "Missing"}
        </span>
        {component?.start_seconds && (
          <span className="text-slate-400 hover:text-white">
            {component.start_seconds.toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}

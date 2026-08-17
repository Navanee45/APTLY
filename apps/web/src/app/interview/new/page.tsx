"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiClient } from "@/lib/api-client";
import type { Job, RoleProfile, InterviewDetail } from "@/types/interview";
import {
  Briefcase,
  Sparkles,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Cpu,
  Layers,
  Code2,
} from "lucide-react";

const SAMPLE_JDS = [
  {
    title: "Senior Full-Stack Engineer",
    text: `We are looking for a Senior Full-Stack Engineer with 5+ years of experience building modern web applications.
Tech Stack: TypeScript, React, Next.js, Python, FastAPI, PostgreSQL, and Docker.
Responsibilities:
- Architect and develop high-performance APIs and responsive web interfaces.
- Design database schemas and optimize PostgreSQL queries for scale.
- Lead code reviews, automated CI/CD testing, and mentor junior engineers.
- Collaborate with product managers to deliver user-centric features.`,
  },
  {
    title: "Backend Infrastructure Engineer",
    text: `Seeking a Backend Infrastructure Engineer to scale our distributed cloud systems.
Requirements:
- Deep expertise in Python, Go, distributed consensus, Redis, and PostgreSQL.
- Experience with concurrency models, async I/O, and low-latency API design.
- Hands-on experience with Docker, Kubernetes, and monitoring (Prometheus/Grafana).
- Strong understanding of data integrity, zero-downtime migrations, and fault tolerance.`,
  },
  {
    title: "AI / ML Platform Engineer",
    text: `Join our AI core team building multimodal evaluation pipelines.
Requirements:
- Strong programming skills in Python, PyTorch, NumPy, and modern LLM orchestration.
- Experience building asynchronous audio processing, speech-to-text (Whisper), and vision pipelines.
- Knowledge of vector search, embedding models, and deterministic feature extraction.
- Proven track record of deploying machine learning models into high-throughput production.`,
  },
];

export default function NewInterviewPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");

  // Loading & Analyzed State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [analyzedJob, setAnalyzedJob] = useState<Job | null>(null);
  const [roleProfile, setRoleProfile] = useState<RoleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration State
  const [interviewType, setInterviewType] = useState<string>("mixed");
  const [difficultyLevel, setDifficultyLevel] = useState<string>("medium");
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(10);
  const [questionCount, setQuestionCount] = useState<number>(3);

  // Step 1: Analyze Job Description
  const handleAnalyzeJD = async () => {
    if (!jobDescription.trim() || jobDescription.length < 20) {
      setError("Please paste a job description of at least 20 characters.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      const result = await apiClient.post<Job>("/api/v1/jobs/analyze", {
        job_description: jobDescription,
        title: jobTitle || undefined,
        company: company || undefined,
      });

      setAnalyzedJob(result);
      if (result.role_profile) {
        setRoleProfile(result.role_profile);
      }
      setStep(2);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze job description. Please check your backend connection.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 3: Launch Interview Session
  const handleCreateInterview = async () => {
    setError(null);
    setIsCreating(true);

    try {
      const payload = {
        job_id: analyzedJob?.id || undefined,
        role_profile_id: roleProfile?.id || undefined,
        title: roleProfile?.role_title || jobTitle || "Practice Interview",
        interview_type: interviewType,
        difficulty_level: difficultyLevel,
        target_duration_minutes: targetDurationMinutes,
        question_count: questionCount,
      };

      const interview = await apiClient.post<InterviewDetail>(
        "/api/v1/interviews",
        payload,
      );

      // Navigate to the live interview room
      router.push(`/interview/${interview.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create interview session.",
      );
      setIsCreating(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Create Practice Interview"
        description="Paste any job description to generate role-tailored technical & behavioral interview questions."
      />

      {/* Stepper Indicator */}
      <div className="mb-8 flex items-center justify-between max-w-2xl mx-auto">
        <div
          className={`flex items-center gap-2 cursor-pointer ${
            step >= 1 ? "text-cyan-400" : "text-slate-500"
          }`}
          onClick={() => setStep(1)}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
              step >= 1
                ? "border-cyan-400 bg-cyan-950/60 text-cyan-300"
                : "border-slate-700 bg-slate-900 text-slate-500"
            }`}
          >
            1
          </div>
          <span className="text-sm font-medium">Job Description</span>
        </div>

        <div
          className={`h-0.5 flex-1 mx-3 ${
            step >= 2 ? "bg-cyan-500/50" : "bg-slate-800"
          }`}
        />

        <div
          className={`flex items-center gap-2 cursor-pointer ${
            step >= 2 ? "text-cyan-400" : "text-slate-500"
          }`}
          onClick={() => roleProfile && setStep(2)}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
              step >= 2
                ? "border-cyan-400 bg-cyan-950/60 text-cyan-300"
                : "border-slate-700 bg-slate-900 text-slate-500"
            }`}
          >
            2
          </div>
          <span className="text-sm font-medium">Role Profile</span>
        </div>

        <div
          className={`h-0.5 flex-1 mx-3 ${
            step >= 3 ? "bg-cyan-500/50" : "bg-slate-800"
          }`}
        />

        <div
          className={`flex items-center gap-2 cursor-pointer ${
            step >= 3 ? "text-cyan-400" : "text-slate-500"
          }`}
          onClick={() => roleProfile && setStep(3)}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
              step >= 3
                ? "border-cyan-400 bg-cyan-950/60 text-cyan-300"
                : "border-slate-700 bg-slate-900 text-slate-500"
            }`}
          >
            3
          </div>
          <span className="text-sm font-medium">Configure & Launch</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200 backdrop-blur-md">
          {error}
        </div>
      )}

      {/* ── STEP 1: JOB DESCRIPTION INPUT ─────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <Card className="glass-panel-glow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-slate-100">
                  Target Role & Job Posting
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Phase 1 Role Analyzer
              </span>
            </div>

            {/* Presets */}
            <div className="mb-4">
              <label className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2 block">
                Quick Presets:
              </label>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_JDS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setJobTitle(preset.title);
                      setJobDescription(preset.text);
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-cyan-500 hover:bg-slate-800 hover:text-cyan-300"
                  >
                    + {preset.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Job Title (Optional)
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Stripe, OpenAI, Google"
                  className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Job Description Text *
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={8}
                placeholder="Paste the full job posting requirements, responsibilities, tech stack, and qualifications here..."
                className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 p-4 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono leading-relaxed"
              />
              <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                <span>Supports plain text or markdown job descriptions</span>
                <span>{jobDescription.length} characters</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleAnalyzeJD}
                disabled={isAnalyzing || !jobDescription.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-indigo-500 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Extracting Competencies...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Analyze Role Profile</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── STEP 2: STRUCTURED ROLE PROFILE PREVIEW ────────────────────── */}
      {step === 2 && roleProfile && (
        <div className="space-y-6">
          <Card className="glass-panel-glow p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-100">
                    {roleProfile.role_title}
                  </h2>
                  <StatusBadge status="active" label={roleProfile.seniority} />
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Domain: {roleProfile.domain}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Edit Job Description
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  <span>Continue to Setup</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Extracted Skill Tags */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3">
                  <Code2 className="h-4 w-4" />
                  <span>Technical Skills</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roleProfile.technical_skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">
                  <Layers className="h-4 w-4" />
                  <span>Tools & Frameworks</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roleProfile.tools.map((tool, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-200"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Responsibilities & Topics */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/80">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Core Responsibilities
                </h3>
                <ul className="space-y-2 text-sm text-slate-300">
                  {roleProfile.responsibilities.map((resp, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Key Evaluation Focus Topics
                </h3>
                <ul className="space-y-2 text-sm text-slate-300">
                  {roleProfile.interview_topics.map((topic, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Cpu className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── STEP 3: CONFIGURE & LAUNCH ─────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <Card className="glass-panel-glow p-6">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
              <Sliders className="h-5 w-5 text-cyan-400" />
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Interview Configuration
                </h2>
                <p className="text-xs text-slate-400">
                  Customize interview focus, question count, and difficulty.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Interview Category */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 block">
                  Interview Focus / Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "mixed", label: "Mixed (Tech + STAR)" },
                    { id: "technical", label: "Deep Technical" },
                    { id: "behavioral", label: "Behavioral / STAR" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setInterviewType(item.id)}
                      className={`rounded-xl border p-3 text-xs font-medium transition-all text-center ${
                        interviewType === item.id
                          ? "border-cyan-500 bg-cyan-950/60 text-cyan-300 ring-1 ring-cyan-500"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Level */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 block">
                  Target Difficulty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "easy", label: "Standard / Warm-up" },
                    { id: "medium", label: "Production Realistic" },
                    { id: "hard", label: "Staff / Hard" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDifficultyLevel(item.id)}
                      className={`rounded-xl border p-3 text-xs font-medium transition-all text-center ${
                        difficultyLevel === item.id
                          ? "border-indigo-500 bg-indigo-950/60 text-indigo-300 ring-1 ring-indigo-500"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Count */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 flex items-center justify-between">
                  <span>Questions in Session</span>
                  <span className="font-mono text-cyan-400">{questionCount} Questions</span>
                </label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setQuestionCount(cnt)}
                      className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-all ${
                        questionCount === cnt
                          ? "border-cyan-500 bg-cyan-950/60 text-cyan-300"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {cnt} Qs
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Duration */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 flex items-center justify-between">
                  <span>Estimated Duration</span>
                  <span className="font-mono text-indigo-400">{targetDurationMinutes} Minutes</span>
                </label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setTargetDurationMinutes(mins)}
                      className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-all ${
                        targetDurationMinutes === mins
                          ? "border-indigo-500 bg-indigo-950/60 text-indigo-300"
                          : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Launch Action */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-6">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                Back to Profile
              </button>

              <button
                type="button"
                onClick={handleCreateInterview}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-400 hover:to-cyan-400 hover:shadow-emerald-500/30 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    <span>Generating Questions & Session...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-slate-950" />
                    <span>Launch Interview Session</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

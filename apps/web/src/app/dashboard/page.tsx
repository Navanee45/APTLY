"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

interface ProgressSummary {
  total_interviews: number;
  latest_score: number;
  latest_role?: string;
  best_score: number;
  average_score: number;
  average_wpm: number;
  average_filler_density: number;
  persistent_weaknesses: Array<{ title: string; occurrences: number }>;
  top_improvements: Array<{ metric: string; improvement: string; details: string }>;
  is_empty: boolean;
}

interface InterviewItem {
  id: string;
  title: string;
  status: string;
  interview_type: string;
  difficulty_level: string;
  target_duration_minutes: number;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [recentInterviews, setRecentInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [authLoading, isAuthenticated, router]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sumRes, itvRes] = await Promise.allSettled([
        apiClient.get<ProgressSummary>("/api/v1/progress/summary"),
        apiClient.get<InterviewItem[]>("/api/v1/interviews?limit=5"),
      ]);

      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value);
      }
      if (itvRes.status === "fulfilled") {
        setRecentInterviews(itvRes.value);
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading your personalized dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-3">
                {profile?.target_seniority || "Mid-Level"} • {profile?.target_role || "Software Engineer"}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Welcome back, {profile?.display_name || "Candidate"}
              </h1>
              <p className="mt-2 text-slate-400 max-w-xl text-sm sm:text-base">
                Your practice data, speech analytics, and coaching plans are securely isolated to your private account.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/interview/setup"
                className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95"
              >
                Start Practice Session
              </Link>
              <Link
                href="/progress"
                className="inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-medium text-sm transition-all"
              >
                AI Coaching Plan
              </Link>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Latest Score</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">{summary?.latest_score ?? 0}%</span>
              {summary?.latest_role && (
                <span className="text-xs text-slate-400 truncate max-w-[120px]">
                  ({summary.latest_role})
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Personal Best</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-400">{summary?.best_score ?? 0}%</span>
              <span className="text-xs text-slate-500">all-time</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Average Pace</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-indigo-400">{summary?.average_wpm ?? 0}</span>
              <span className="text-xs text-slate-400">words / min</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Total Interviews</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-cyan-400">{summary?.total_interviews ?? 0}</span>
              <span className="text-xs text-slate-400">completed</span>
            </div>
          </div>
        </div>

        {/* Priority Focus Areas & Improvements */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Priority Focus Areas */}
          <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Priority Focus Areas
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Persistent behavioral and delivery habits detected in your answers.
              </p>

              <div className="mt-4 space-y-3">
                {summary?.persistent_weaknesses && summary.persistent_weaknesses.length > 0 ? (
                  summary.persistent_weaknesses.map((w, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/60"
                    >
                      <span className="text-sm font-medium text-slate-200">{w.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 font-semibold">
                        {w.occurrences}x detected
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic py-4">
                    No recurring weaknesses identified yet. Complete practice sessions to populate insights.
                  </p>
                )}
              </div>
            </div>

            <Link
              href="/progress"
              className="mt-6 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
            >
              View detailed weakness breakdown &rarr;
            </Link>
          </div>

          {/* Recent Practice Sessions */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Recent Practice Sessions</h2>
              <Link
                href="/history"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                View all ({summary?.total_interviews ?? 0}) &rarr;
              </Link>
            </div>

            {recentInterviews.length > 0 ? (
              <div className="space-y-3">
                {recentInterviews.map((itv) => (
                  <div
                    key={itv.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-slate-800/60 hover:border-slate-700 transition-all"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-white">{itv.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        <span className="capitalize">{itv.interview_type}</span>
                        <span>•</span>
                        <span className="capitalize">{itv.difficulty_level}</span>
                        <span>•</span>
                        <span>{new Date(itv.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                          itv.status === "completed"
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                            : "bg-indigo-950/60 text-indigo-300 border border-indigo-500/30"
                        }`}
                      >
                        {itv.status}
                      </span>
                      {itv.status === "completed" ? (
                        <Link
                          href={`/interview/${itv.id}/review`}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                        >
                          Review
                        </Link>
                      ) : (
                        <Link
                          href={`/interview/${itv.id}`}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                        >
                          Resume
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-sm text-slate-400">No practice sessions found.</p>
                <Link
                  href="/interview/setup"
                  className="mt-3 inline-block px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all"
                >
                  Start Your First Session
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

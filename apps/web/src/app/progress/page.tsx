"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

interface TrajectoryPoint {
  id: string;
  interview_id: string;
  created_at: string;
  role_title: string;
  overall_score: number;
  content_score: number;
  delivery_score: number;
  relevance_score: number;
  technical_depth_score: number;
  wpm: number;
  filler_density: number;
  total_pauses_count: number;
  top_habits: Array<{ title: string; severity: string; impact_explanation: string }>;
}

interface ProgressResponse {
  user_id: string;
  scoring_algorithm_version: string;
  total_sessions: number;
  trajectory: TrajectoryPoint[];
  is_empty: boolean;
}

interface CoachingPlanResponse {
  document_id: string;
  title: string;
  plan: {
    summary: string;
    priority_focus_areas: string[];
    schedule: Array<{
      day: string;
      focus: string;
      drill_title: string;
      duration_minutes: number;
      instructions: string;
      target_criteria: string;
    }>;
  };
  created_at: string;
}

export default function ProgressPage() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [activePlan, setActivePlan] = useState<CoachingPlanResponse | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated) {
      loadProgress();
    }
  }, [authLoading, isAuthenticated, router]);

  const loadProgress = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ProgressResponse>("/api/v1/progress");
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    try {
      const res = await apiClient.post<CoachingPlanResponse>("/api/v1/progress/coaching-plan");
      setActivePlan(res);
    } catch (err: any) {
      alert(err?.message || "Failed to generate coaching plan. Ensure you have completed at least one interview.");
    } finally {
      setGeneratingPlan(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Calculating progress trajectories...</p>
        </div>
      </div>
    );
  }

  const points = data?.trajectory || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Performance Trajectory</h1>
            <p className="text-sm text-slate-400 mt-1">
              Version-stable skill progression and evidence-based score evolution.
            </p>
          </div>
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan || points.length === 0}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {generatingPlan ? "Generating Plan with Gemini..." : "Generate 4-Day Practice Plan"}
          </button>
        </div>

        {/* AI Coaching Plan Alert/Modal if newly generated */}
        {activePlan && (
          <div className="bg-gradient-to-r from-indigo-950/60 to-slate-900 border border-indigo-500/40 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                  Personalized AI Plan
                </span>
                <h2 className="text-2xl font-bold text-white mt-2">{activePlan.title}</h2>
              </div>
              <Link
                href={`/documents/${activePlan.document_id}`}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                View Full Document &rarr;
              </Link>
            </div>

            <p className="text-sm text-slate-300">{activePlan.plan.summary}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {activePlan.plan.schedule.map((item, i) => (
                <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-400">
                    <span>{item.day}</span>
                    <span>{item.duration_minutes}m</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white">{item.drill_title}</h4>
                  <p className="text-xs text-slate-400 line-clamp-3">{item.instructions}</p>
                  <div className="pt-2 border-t border-slate-800 text-[11px] text-emerald-400 font-medium">
                    Goal: {item.target_criteria}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historical Scoring Table & Trajectory */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Interview Progression History</h3>
            <span className="text-xs text-slate-500">
              Algorithm: v{data?.scoring_algorithm_version || "1.0.0"}
            </span>
          </div>

          {points.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4 text-center">Overall</th>
                    <th className="py-3.5 px-4 text-center">Content</th>
                    <th className="py-3.5 px-4 text-center">Delivery</th>
                    <th className="py-3.5 px-4 text-center">Pace (WPM)</th>
                    <th className="py-3.5 px-4 text-center">Fillers / min</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {points.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 px-4 text-xs font-mono text-slate-400">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 font-medium text-white">{p.role_title}</td>
                      <td className="py-4 px-4 text-center font-bold text-white">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
                          {p.overall_score}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center font-semibold text-slate-200">
                        {p.content_score}%
                      </td>
                      <td className="py-4 px-4 text-center font-semibold text-slate-200">
                        {p.delivery_score}%
                      </td>
                      <td className="py-4 px-4 text-center font-mono">{p.wpm}</td>
                      <td className="py-4 px-4 text-center font-mono">{p.filler_density}</td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/interview/${p.interview_id}/review`}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <p className="text-slate-400 text-sm">No progression records yet.</p>
              <Link
                href="/interview/setup"
                className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all"
              >
                Complete First Mock Interview
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

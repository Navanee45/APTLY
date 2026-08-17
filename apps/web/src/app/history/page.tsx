"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

interface InterviewItem {
  id: string;
  title: string;
  status: string;
  interview_type: string;
  difficulty_level: string;
  target_duration_minutes: number;
  created_at: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated) {
      loadInterviews();
    }
  }, [authLoading, isAuthenticated, router]);

  const loadInterviews = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<InterviewItem[]>("/api/v1/interviews?limit=50");
      setInterviews(data || []);
    } catch {
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this interview and its recordings?")) {
      return;
    }
    setDeletingId(id);
    try {
      await apiClient.delete(`/api/v1/interviews/${id}`);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      alert(err?.message || "Failed to delete interview.");
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading practice history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Practice History</h1>
            <p className="text-sm text-slate-400 mt-1">
              All your recorded interviews, transcripts, and post-interview analyses.
            </p>
          </div>
          <Link
            href="/interview/setup"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all"
          >
            New Interview
          </Link>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          {interviews.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {interviews.map((itv) => (
                <div
                  key={itv.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/20 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-white">{itv.title}</h3>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                          itv.status === "completed"
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                            : "bg-indigo-950/60 text-indigo-300 border border-indigo-500/30"
                        }`}
                      >
                        {itv.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="capitalize">{itv.interview_type}</span>
                      <span>•</span>
                      <span className="capitalize">{itv.difficulty_level}</span>
                      <span>•</span>
                      <span>{itv.target_duration_minutes} mins</span>
                      <span>•</span>
                      <span>{new Date(itv.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {itv.status === "completed" ? (
                      <Link
                        href={`/interview/${itv.id}/review`}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                      >
                        View Report
                      </Link>
                    ) : (
                      <Link
                        href={`/interview/${itv.id}`}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                      >
                        Resume
                      </Link>
                    )}

                    <button
                      onClick={() => handleDelete(itv.id)}
                      disabled={deletingId === itv.id}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-500/30 transition-all disabled:opacity-50"
                      title="Delete interview"
                    >
                      {deletingId === itv.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <p className="text-slate-400 text-sm">No interviews found for your account.</p>
              <Link
                href="/interview/setup"
                className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all"
              >
                Start First Practice Session
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

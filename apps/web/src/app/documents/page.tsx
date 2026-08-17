"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

interface DocumentItem {
  id: string;
  interview_id?: string;
  document_type: string;
  title: string;
  document_version: string;
  scoring_algorithm_version: string;
  metadata: any;
  created_at: string;
}

interface DocumentsResponse {
  user_id: string;
  total_count: number;
  items: DocumentItem[];
}

export default function DocumentsPage() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated) {
      loadDocuments();
    }
  }, [authLoading, isAuthenticated, filterType, router]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const url = filterType ? `/api/v1/documents?document_type=${filterType}` : "/api/v1/documents";
      const res = await apiClient.get<DocumentsResponse>(url);
      setDocuments(res.items || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await apiClient.delete(`/api/v1/documents/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err?.message || "Failed to delete document.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading document archives...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Coaching Archives & Reports</h1>
            <p className="text-sm text-slate-400 mt-1">
              Your personal library of generated practice plans, performance reports, and interview summaries.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Types</option>
              <option value="INTERVIEW_REPORT">Interview Reports</option>
              <option value="PRACTICE_PLAN">Practice Plans</option>
              <option value="SUMMARY">Summaries</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.length > 0 ? (
            documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group block bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl p-6 backdrop-blur-md transition-all shadow-lg hover:shadow-indigo-500/10 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      doc.document_type === "PRACTICE_PLAN"
                        ? "bg-purple-950/60 text-purple-300 border border-purple-500/30"
                        : "bg-indigo-950/60 text-indigo-300 border border-indigo-500/30"
                    }`}
                  >
                    {doc.document_type.replace("_", " ")}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                  {doc.title}
                </h3>

                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-indigo-400 font-medium group-hover:underline">
                    Read Document &rarr;
                  </span>
                  <button
                    onClick={(e) => handleDelete(doc.id, e)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
              <p className="text-sm text-slate-400">No documents found in your archive.</p>
              <Link
                href="/progress"
                className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all"
              >
                Generate an AI Practice Plan
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

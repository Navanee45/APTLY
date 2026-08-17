"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

interface DocumentDetail {
  id: string;
  interview_id?: string;
  document_type: string;
  title: string;
  content_markdown: string;
  metadata: any;
  document_version: string;
  scoring_algorithm_version: string;
  created_at: string;
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated && id) {
      loadDocument();
    }
  }, [authLoading, isAuthenticated, id, router]);

  const loadDocument = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiClient.get<DocumentDetail>(`/api/v1/documents/${id}`);
      setDoc(data);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load document.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !doc) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-red-400">Access Denied or Not Found</h2>
          <p className="text-xs text-slate-400">
            {errorMsg || "This document does not exist or does not belong to your account."}
          </p>
          <Link
            href="/documents"
            className="inline-block px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
          >
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/documents"
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            &larr; Back to all documents
          </Link>
          <div className="flex items-center gap-2">
            {doc.interview_id && (
              <Link
                href={`/interview/${doc.interview_id}/review`}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                View Linked Interview
              </Link>
            )}
          </div>
        </div>

        <article className="bg-slate-900/70 border border-slate-800/80 rounded-3xl p-6 sm:p-10 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
                {doc.document_type.replace("_", " ")}
              </span>
              <span className="text-xs text-slate-500">
                Created on {new Date(doc.created_at).toLocaleString()}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{doc.title}</h1>
          </div>

          <div className="prose prose-invert max-w-none text-slate-300 space-y-4 whitespace-pre-wrap leading-relaxed text-sm sm:text-base font-sans">
            {doc.content_markdown}
          </div>
        </article>
      </div>
    </div>
  );
}

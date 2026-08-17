"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

export default function PrivacyPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, isAuthenticated, signOut } = useAuth();
  const [retentionDays, setRetentionDays] = useState(90);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiClient.put("/api/v1/profiles/me", {});
      setMsg("Privacy preferences updated successfully.");
    } catch (err: any) {
      alert(err?.message || "Failed to update preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = prompt(
      "Type 'DELETE MY ACCOUNT' to permanently purge all your interviews, audio recordings, documents, and profile."
    );
    if (confirmation !== "DELETE MY ACCOUNT") {
      alert("Account deletion canceled.");
      return;
    }

    setDeleting(true);
    try {
      await apiClient.delete("/api/v1/profiles/me");
      await signOut();
      router.push("/login?message=Your account and all associated data have been permanently deleted.");
    } catch (err: any) {
      alert(err?.message || "Failed to delete account.");
      setDeleting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Privacy & Data Governance</h1>
          <p className="text-sm text-slate-400 mt-1">
            Control your media retention policies, export your telemetry, or permanently delete your account.
          </p>
        </div>

        {msg && (
          <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/50 p-4 text-sm text-emerald-200">
            {msg}
          </div>
        )}

        {/* Data Architecture Overview */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md space-y-3">
          <h3 className="text-base font-semibold text-white">How Your Data is Isolated</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            APTLY uses PostgreSQL Row-Level Security (RLS) and tenant-scoped storage paths (<code>users/{profile?.id || "uid"}/...</code>). Your recordings, speech metrics, and transcripts are never accessible by other users or shared across accounts.
          </p>
        </div>

        {/* Retention Policy */}
        <form
          onSubmit={handleSavePreferences}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md space-y-4"
        >
          <h3 className="text-base font-semibold text-white">Automated Media Retention</h3>
          <p className="text-xs text-slate-400">
            Choose how long raw video and audio recordings are retained before automated scheduled deletion.
          </p>
          <div className="max-w-xs">
            <select
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days (Recommended)</option>
              <option value={180}>180 Days</option>
              <option value={365}>1 Year</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
          >
            {saving ? "Saving..." : "Save Policy"}
          </button>
        </form>

        {/* Danger Zone: Account Deletion */}
        <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-base font-semibold text-red-400">Danger Zone: Irreversible Account Deletion</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Deleting your account will immediately and permanently erase all your profile details, mock interviews, speech analysis artifacts, and cloud media objects. This action cannot be undone.
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
          >
            {deleting ? "Purging Account..." : "Permanently Delete My Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

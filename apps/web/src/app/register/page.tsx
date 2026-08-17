"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [targetSeniority, setTargetSeniority] = useState("Mid-Level");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            target_role: targetRole,
            target_seniority: targetSeniority,
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setSuccessMsg(
          "Registration successful! Please check your email inbox to confirm your account."
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-indigo-500/20">
            A
          </div>
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            APTLY
          </span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
          Create your practice account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-slate-800/80 sm:rounded-2xl sm:px-10">
          {errorMsg && (
            <div className="mb-6 rounded-lg bg-red-950/50 border border-red-500/50 p-4 text-sm text-red-200">
              <span className="font-semibold">Error:</span> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-6 rounded-lg bg-emerald-950/50 border border-emerald-500/50 p-4 text-sm text-emerald-200">
              {successMsg}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleRegister}>
            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-slate-300"
              >
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-white placeholder-slate-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Alex Mercer"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-white placeholder-slate-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  placeholder="alex@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="targetRole"
                  className="block text-sm font-medium text-slate-300"
                >
                  Target Role
                </label>
                <div className="mt-1">
                  <input
                    id="targetRole"
                    type="text"
                    required
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="block w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-white placeholder-slate-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="targetSeniority"
                  className="block text-sm font-medium text-slate-300"
                >
                  Seniority
                </label>
                <div className="mt-1">
                  <select
                    id="targetSeniority"
                    value={targetSeniority}
                    onChange={(e) => setTargetSeniority(e.target.value)}
                    className="block w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-white placeholder-slate-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="Junior">Junior (0-2 yrs)</option>
                    <option value="Mid-Level">Mid-Level (3-5 yrs)</option>
                    <option value="Senior">Senior (5-8 yrs)</option>
                    <option value="Staff / Lead">Staff / Lead (8+ yrs)</option>
                    <option value="Executive">Executive / Director</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-white placeholder-slate-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 py-3 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

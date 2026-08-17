"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { LogOut, CheckCircle2, ArrowRight } from "lucide-react";

export default function SignOutPage() {
  const router = useRouter();
  const [isSignedOut, setIsSignedOut] = useState(false);

  useEffect(() => {
    async function doSignOut() {
      try {
        await supabase.auth.signOut();
      } catch {
        // Continue
      } finally {
        setIsSignedOut(true);
      }
    }
    doSignOut();
  }, []);

  return (
    <AppShell>
      <div className="flex min-h-[70vh] items-center justify-center py-12 px-4">
        <Card className="glass-panel-glow p-8 max-w-md w-full text-center space-y-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-indigo-400 mx-auto">
            {isSignedOut ? (
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            ) : (
              <LogOut className="h-7 w-7 text-slate-400 animate-pulse" />
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold text-white">
              {isSignedOut ? "Signed Out Successfully" : "Signing You Out..."}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Your practice sessions and metrics remain safely stored.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-cyan-400 transition-all"
            >
              <span>Sign In Again</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Return to Homepage
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

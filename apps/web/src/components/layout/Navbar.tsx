/**
 * APTLY — Navigation Bar Component
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  FileText,
  History,
  Home,
  LogOut,
  PlusCircle,
  Shield,
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/interview/setup", label: "Practice", icon: PlusCircle },
  { href: "/history", label: "History", icon: History },
  { href: "/progress", label: "Progress", icon: BarChart2 },
  { href: "/documents", label: "Documents", icon: FileText },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, isAuthenticated, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setDropdownOpen(false);
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="flex items-center gap-2.5 font-extrabold tracking-tight text-white hover:opacity-90 transition-opacity"
            aria-label="APTLY — home"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-indigo-500/20">
              A
            </div>
            <span className="text-lg bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              APTLY
            </span>
          </Link>

          {/* Desktop Navigation */}
          {isAuthenticated && (
            <nav aria-label="Main navigation" className="hidden md:block">
              <ul className="flex items-center gap-1" role="list">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));
                  return (
                    <li key={href}>
                      <Link
                        id={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        href={href}
                        className={cn(
                          "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold tracking-wide transition-all",
                          isActive
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 shadow-sm"
                            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                        )}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>

        {/* User Actions & Auth Status */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors focus:outline-none"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  {profile?.display_name ? profile.display_name[0].toUpperCase() : "U"}
                </div>
                <span className="hidden sm:inline text-xs font-medium text-slate-200 max-w-[120px] truncate">
                  {profile?.display_name || user?.email?.split("@")[0]}
                </span>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 backdrop-blur-xl">
                  <div className="px-4 py-2 border-b border-slate-800/80">
                    <p className="text-xs font-semibold text-white truncate">
                      {profile?.display_name || "Candidate"}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                    <p className="text-[10px] text-indigo-400 mt-0.5 font-medium">
                      {profile?.target_role} ({profile?.target_seniority})
                    </p>
                  </div>

                  <Link
                    href="/dashboard"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" />
                    Dashboard
                  </Link>

                  <Link
                    href="/privacy"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Privacy & Data Controls
                  </Link>

                  <div className="border-t border-slate-800/80 my-1" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all"
              >
                Create Account
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

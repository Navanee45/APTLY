"use client";

import { Camera, Mic, Volume2, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import type { PermissionStatus } from "@/hooks/useMediaCapture";

interface DeviceSelectorProps {
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  onSelectAudioDevice: (deviceId: string) => void;
  onSelectVideoDevice: (deviceId: string) => void;
  cameraPermission: PermissionStatus;
  micPermission: PermissionStatus;
  micLevelPercent: number;
  className?: string;
}

export function DeviceSelector({
  audioDevices,
  videoDevices,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  onSelectAudioDevice,
  onSelectVideoDevice,
  cameraPermission,
  micPermission,
  micLevelPercent,
  className = "",
}: DeviceSelectorProps) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/90 p-4 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <Settings2 className="h-4 w-4 text-indigo-400" />
          <span>Device Configuration &amp; Pre-flight</span>
        </div>

        {/* Readiness Badges */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
              cameraPermission === "granted"
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30"
                : "bg-red-950/80 text-red-300 border border-red-500/30"
            }`}
          >
            {cameraPermission === "granted" ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <AlertCircle className="h-3 w-3 text-red-400" />
            )}
            <span>Camera: {cameraPermission.toUpperCase()}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
              micPermission === "granted"
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30"
                : "bg-red-950/80 text-red-300 border border-red-500/30"
            }`}
          >
            {micPermission === "granted" ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <AlertCircle className="h-3 w-3 text-red-400" />
            )}
            <span>Mic: {micPermission.toUpperCase()}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Camera Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-indigo-400" />
            <span>Video Camera Input</span>
          </label>
          <select
            value={selectedVideoDeviceId}
            onChange={(e) => onSelectVideoDevice(e.target.value)}
            disabled={videoDevices.length === 0}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          >
            {videoDevices.length === 0 ? (
              <option value="">Default Camera</option>
            ) : (
              videoDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Microphone Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5 text-emerald-400" />
            <span>Microphone Input</span>
          </label>
          <select
            value={selectedAudioDeviceId}
            onChange={(e) => onSelectAudioDevice(e.target.value)}
            disabled={audioDevices.length === 0}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          >
            {audioDevices.length === 0 ? (
              <option value="">Default Microphone</option>
            ) : (
              audioDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Microphone ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Mic Volume Level Bar */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 shrink-0">
          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>Live Level: {micLevelPercent}%</span>
        </div>
        <div className="h-2 flex-1 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-75"
            style={{ width: `${Math.min(100, micLevelPercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

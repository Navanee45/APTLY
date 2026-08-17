"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, VideoOff } from "lucide-react";

interface VideoPreviewProps {
  stream: MediaStream | null;
  recordedUrl: string | null;
  isRecording: boolean;
  isCameraReady: boolean;
  isMicReady: boolean;
  className?: string;
}

export function VideoPreview({
  stream,
  recordedUrl,
  isRecording,
  isCameraReady,
  isMicReady,
  className = "",
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);

  // Attach stream to video element — handles both initial mount and stream updates
  const attachStream = useCallback(
    async (node: HTMLVideoElement, mediaStream: MediaStream) => {
      if (node.srcObject === mediaStream) return; // Already attached
      node.srcObject = mediaStream;
      node.muted = true;
      try {
        await node.play();
      } catch {
        // Autoplay policy may block — re-try on user interaction; not fatal
      }
    },
    [],
  );

  // Callback ref: fires when the DOM node mounts
  const handleVideoMount = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && stream && !recordedUrl) {
        void attachStream(node, stream);
      }
    },
    // intentionally NOT including stream here — we use the useEffect below for stream updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordedUrl],
  );

  // Effect: re-attach when stream arrives asynchronously AFTER the DOM node is already mounted
  useEffect(() => {
    const node = videoRef.current;
    if (!node || !stream || recordedUrl) return;

    void attachStream(node, stream);

    const handleMetadata = () => {
      setVideoWidth(node.videoWidth);
      setVideoHeight(node.videoHeight);
    };
    node.addEventListener("loadedmetadata", handleMetadata);
    return () => {
      node.removeEventListener("loadedmetadata", handleMetadata);
    };
  }, [stream, recordedUrl, attachStream]);

  // Actual camera-ready check: only true if we have a live video track AND the video element
  // is actually rendering frames (videoWidth > 0 after metadata loads)
  const isActuallyCameraReady = isCameraReady && (videoWidth > 0 || !stream);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl backdrop-blur-xl ${
        isRecording ? "border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.2)]" : ""
      } ${className}`}
    >
      {/* Live Stream or Recorded Playback */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
        {!recordedUrl ? (
          stream ? (
            <video
              ref={handleVideoMount}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover -scale-x-100"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setVideoWidth(v.videoWidth);
                setVideoHeight(v.videoHeight);
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-500">
              <VideoOff className="h-10 w-10 text-slate-600" />
              <p className="text-xs font-mono">Initializing Camera Preview...</p>
            </div>
          )
        ) : (
          <video
            src={recordedUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        )}

        {/* Top HUD Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono font-medium backdrop-blur-md ${
                isActuallyCameraReady
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-900/80 text-slate-400 border border-slate-700"
              }`}
            >
              <Camera className="h-3 w-3" />
              <span>
                {isActuallyCameraReady
                  ? `CAM ${videoWidth > 0 ? `${videoWidth}×${videoHeight}` : "READY"}`
                  : stream
                  ? "CAM INIT..."
                  : "NO CAM"}
              </span>
            </div>

            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono font-medium backdrop-blur-md ${
                isMicReady
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-900/80 text-slate-400 border border-slate-700"
              }`}
            >
              <Mic className="h-3 w-3" />
              <span>{isMicReady ? "MIC LIVE" : "NO MIC"}</span>
            </div>
          </div>

          {/* Recording Badge */}
          {isRecording && (
            <div className="flex items-center gap-2 rounded-lg bg-red-950/90 border border-red-500/60 px-3 py-1 text-xs font-bold text-red-300 animate-pulse backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
              <span>🔴 REC</span>
            </div>
          )}
        </div>

        {/* Bottom Timestamp / Mode HUD */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-400 pointer-events-none">
          <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
            {recordedUrl ? "RECORDED PLAYBACK" : "LIVE CAMERA FEED"}
          </span>
          {videoWidth > 0 && !recordedUrl && (
            <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 backdrop-blur-sm">
              {videoWidth}×{videoHeight}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

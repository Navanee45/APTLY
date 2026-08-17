"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingLifecycleState =
  | "IDLE"
  | "PREPARING"
  | "READY"
  | "RECORDING"
  | "STOPPING"
  | "RECORDED"
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export interface UseMediaCaptureOptions {
  enableVideo?: boolean;
  enableAudio?: boolean;
}

export interface MediaCaptureState {
  // Explicit State Machine
  recordingState: RecordingLifecycleState;
  setRecordingState: (state: RecordingLifecycleState) => void;
  isRecording: boolean;

  // Device Readiness
  isCameraReady: boolean;
  isMicReady: boolean;
  audioTrackState: "LIVE" | "ENDED" | "MUTED" | "NONE";
  videoTrackState: "LIVE" | "ENDED" | "MUTED" | "NONE";
  cameraPermission: PermissionStatus;
  micPermission: PermissionStatus;

  // Device Enumeration & Selection
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  setSelectedAudioDeviceId: (deviceId: string) => void;
  setSelectedVideoDeviceId: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;

  // Metrics & Stream
  micLevelPercent: number;
  recordingDuration: number;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  sha256Hash: string;
  stream: MediaStream | null;
  mimeType: string;
  error: string | null;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  resetRecording: () => void;
}

const MIME_PRIORITY = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/wav",
];

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "user",
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export function useMediaCapture({
  enableVideo = true,
  enableAudio = true,
}: UseMediaCaptureOptions = {}): MediaCaptureState {
  const [recordingState, setRecordingState] = useState<RecordingLifecycleState>("IDLE");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMicReady, setIsMicReady] = useState(false);
  const [audioTrackState, setAudioTrackState] = useState<"LIVE" | "ENDED" | "MUTED" | "NONE">("NONE");
  const [videoTrackState, setVideoTrackState] = useState<"LIVE" | "ENDED" | "MUTED" | "NONE">("NONE");
  const [cameraPermission, setCameraPermission] = useState<PermissionStatus>("prompt");
  const [micPermission, setMicPermission] = useState<PermissionStatus>("prompt");

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");

  const [micLevelPercent, setMicLevelPercent] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [sha256Hash, setSha256Hash] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mimeType, setMimeType] = useState<string>("video/webm");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Detect supported MIME type dynamically
  const getSupportedMimeType = useCallback(() => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "video/webm";
    }
    for (const mime of MIME_PRIORITY) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return "";
  }, []);

  // Compute SHA-256 Checksum in browser
  const computeChecksum = async (blob: Blob): Promise<string> => {
    try {
      const buffer = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return "";
    }
  };

  // Enumerate input devices
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === "audioinput");
      const videos = devices.filter((d) => d.kind === "videoinput");

      setAudioDevices(audios);
      setVideoDevices(videos);

      if (!selectedAudioDeviceId && audios.length > 0) {
        setSelectedAudioDeviceId(audios[0].deviceId);
      }
      if (!selectedVideoDeviceId && videos.length > 0) {
        setSelectedVideoDeviceId(videos[0].deviceId);
      }
    } catch {
      // ignore
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  // Setup Web Audio API volume monitor
  const setupAudioMonitoring = (mediaStream: MediaStream) => {
    try {
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevelPercent(normalized);
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch {
      // Audio context might fail in background tabs; gracefully ignore
    }
  };

  // Initialize Media Devices
  useEffect(() => {
    let mounted = true;

    async function setupStream() {
      setRecordingState("PREPARING");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraPermission("unsupported");
          setMicPermission("unsupported");
          throw new Error("Camera/Microphone capture is not supported by your browser.");
        }

        const videoConstraints: MediaTrackConstraints | boolean = enableVideo
          ? {
              ...(typeof DEFAULT_CONSTRAINTS.video === "object" ? DEFAULT_CONSTRAINTS.video : {}),
              ...(selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : {}),
            }
          : false;

        const audioConstraints: MediaTrackConstraints | boolean = enableAudio
          ? {
              ...(typeof DEFAULT_CONSTRAINTS.audio === "object" ? DEFAULT_CONSTRAINTS.audio : {}),
              ...(selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : {}),
            }
          : false;

        const constraints: MediaStreamConstraints = {
          video: videoConstraints,
          audio: audioConstraints,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!mounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        // Clean up previous stream
        if (streamRef.current && streamRef.current !== mediaStream) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);

        const vTracks = mediaStream.getVideoTracks();
        const aTracks = mediaStream.getAudioTracks();

        setIsCameraReady(vTracks.length > 0);
        setIsMicReady(aTracks.length > 0);
        setCameraPermission(vTracks.length > 0 ? "granted" : "prompt");
        setMicPermission(aTracks.length > 0 ? "granted" : "prompt");

        setVideoTrackState(
          vTracks.length > 0 ? (vTracks[0].readyState === "live" ? "LIVE" : "ENDED") : "NONE",
        );
        setAudioTrackState(
          aTracks.length > 0 ? (aTracks[0].readyState === "live" ? "LIVE" : "ENDED") : "NONE",
        );

        setupAudioMonitoring(mediaStream);
        await refreshDevices();
        setError(null);
        setRecordingState("READY");
      } catch (err: unknown) {
        if (!mounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Could not access camera or microphone. Please allow permissions in your browser.";
        setError(msg);
        setIsCameraReady(false);
        setIsMicReady(false);
        setCameraPermission("denied");
        setMicPermission("denied");
        setRecordingState("FAILED");
      }
    }

    void setupStream();

    return () => {
      mounted = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [enableVideo, enableAudio, selectedAudioDeviceId, selectedVideoDeviceId, refreshDevices]);

  const startRecording = useCallback(async () => {
    setError(null);
    setRecordedBlob(null);
    setSha256Hash("");
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    chunksRef.current = [];

    // Ensure active stream
    let activeStream = streamRef.current;
    if (!activeStream || !activeStream.active) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: enableVideo ? DEFAULT_CONSTRAINTS.video : false,
          audio: enableAudio ? DEFAULT_CONSTRAINTS.audio : false,
        });
        streamRef.current = activeStream;
        setStream(activeStream);
        setupAudioMonitoring(activeStream);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to activate camera/microphone.",
        );
        setRecordingState("FAILED");
        return;
      }
    }

    try {
      const selectedMime = getSupportedMimeType();
      setMimeType(selectedMime);

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      const recorder = new MediaRecorder(activeStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(); // Continuous stream capture
      setRecordingState("RECORDING");
      startTimeRef.current = Date.now();
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to start MediaRecorder recording.",
      );
      setRecordingState("FAILED");
    }
  }, [recordedUrl, enableVideo, enableAudio, getSupportedMimeType]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    setRecordingState("STOPPING");
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecordingState("RECORDED");
        resolve(recordedBlob);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      recorder.onstop = async () => {
        const finalType = mimeType || "video/webm";
        const combinedBlob = new Blob(chunksRef.current, { type: finalType });
        const url = URL.createObjectURL(combinedBlob);
        const hash = await computeChecksum(combinedBlob);

        setRecordedBlob(combinedBlob);
        setRecordedUrl(url);
        setSha256Hash(hash);
        setRecordingState("RECORDED");
        resolve(combinedBlob);
      };

      try {
        if (recorder.state === "recording") {
          recorder.requestData();
        }
        recorder.stop();
      } catch {
        recorder.stop();
      }
    });
  }, [recordedBlob, mimeType]);

  const resetRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    chunksRef.current = [];
    setRecordedBlob(null);
    setRecordedUrl(null);
    setSha256Hash("");
    setRecordingDuration(0);
    setError(null);
    setRecordingState(isCameraReady && isMicReady ? "READY" : "IDLE");
  }, [recordedUrl, isCameraReady, isMicReady]);

  return {
    recordingState,
    setRecordingState,
    isRecording: recordingState === "RECORDING",
    isCameraReady,
    isMicReady,
    audioTrackState,
    videoTrackState,
    cameraPermission,
    micPermission,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    setSelectedAudioDeviceId,
    setSelectedVideoDeviceId,
    refreshDevices,
    micLevelPercent,
    recordingDuration,
    recordedBlob,
    recordedUrl,
    sha256Hash,
    stream,
    mimeType,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  };
}

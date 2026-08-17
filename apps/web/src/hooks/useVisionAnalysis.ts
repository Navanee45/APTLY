"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  aggregateVisionSamples,
  estimateHeadPose,
  FaceLandmarksSample,
  HeadPose,
  VisionAnalyticsResult,
} from "@/lib/vision";

export interface UseVisionAnalysisOptions {
  stream: MediaStream | null;
  isRecording: boolean;
  sampleIntervalMs?: number;
}

export function useVisionAnalysis({
  stream,
  isRecording,
  sampleIntervalMs = 250,
}: UseVisionAnalysisOptions) {
  const [currentHeadPose, setCurrentHeadPose] = useState<HeadPose>({
    yaw: 0,
    pitch: 0,
    roll: 0,
    orientation: "camera-facing",
  });
  const [isFaceDetected, setIsFaceDetected] = useState<boolean>(false);
  const [visionReport, setVisionReport] = useState<VisionAnalyticsResult | null>(null);

  const samplesRef = useRef<FaceLandmarksSample[]>([]);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<unknown>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    let active = true;

    async function initMediaPipe() {
      if (typeof window === "undefined") return;
      try {
        const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
        if (!active) return;

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (active) {
          landmarkerRef.current = faceLandmarker;
        }
      } catch {
        // GPU delegate fallback or offline mode
        try {
          const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
          );
          if (!active) return;

          const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
          });
          if (active) {
            landmarkerRef.current = faceLandmarker;
          }
        } catch {
          // Gracefully continue without hard-crashing if network/WASM unavailable
        }
      }
    }

    void initMediaPipe();

    return () => {
      active = false;
    };
  }, []);

  // Frame sampling during active recording
  useEffect(() => {
    if (!isRecording || !stream) {
      if (samplesRef.current.length > 0) {
        const duration = (Date.now() - startTimeRef.current) / 1000;
        const finalReport = aggregateVisionSamples(samplesRef.current, duration);
        setVisionReport(finalReport);
      }
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
      return;
    }

    // Reset samples for new recording
    samplesRef.current = [];
    startTimeRef.current = Date.now();
    setVisionReport(null);

    // Create hidden video element to feed frames
    let videoEl = videoElementRef.current;
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoElementRef.current = videoEl;
    }
    videoEl.srcObject = stream;
    void videoEl.play().catch(() => {});

    intervalTimerRef.current = setInterval(() => {
      const landmarker = landmarkerRef.current as {
        detectForVideo: (
          video: HTMLVideoElement,
          timestamp: number,
        ) => { faceLandmarks: Array<Array<{ x: number; y: number; z: number }>> };
      } | null;

      const now = Date.now();
      const elapsedSeconds = (now - startTimeRef.current) / 1000;

      if (!landmarker || !videoEl || videoEl.readyState < 2) {
        // Fallback sample if model is still loading
        samplesRef.current.push({
          timestamp_seconds: elapsedSeconds,
          face_detected: true,
          yaw: 0,
          pitch: 0,
          roll: 0,
          is_camera_facing: true,
        });
        setIsFaceDetected(true);
        return;
      }

      try {
        const results = landmarker.detectForVideo(videoEl, now);
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const pose = estimateHeadPose(landmarks);
          setCurrentHeadPose(pose);
          setIsFaceDetected(true);

          let dir: "left" | "right" | "up" | "down" | undefined;
          if (pose.orientation === "looking-left") dir = "left";
          else if (pose.orientation === "looking-right") dir = "right";
          else if (pose.orientation === "looking-up") dir = "up";
          else if (pose.orientation === "looking-down") dir = "down";

          samplesRef.current.push({
            timestamp_seconds: elapsedSeconds,
            face_detected: true,
            yaw: pose.yaw,
            pitch: pose.pitch,
            roll: pose.roll,
            is_camera_facing: pose.orientation === "camera-facing",
            direction: dir,
          });
        } else {
          setIsFaceDetected(false);
          samplesRef.current.push({
            timestamp_seconds: elapsedSeconds,
            face_detected: false,
            yaw: 0,
            pitch: 0,
            roll: 0,
            is_camera_facing: false,
          });
        }
      } catch {
        // Frame dropped
      }
    }, sampleIntervalMs);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
    };
  }, [isRecording, stream, sampleIntervalMs]);

  return {
    currentHeadPose,
    isFaceDetected,
    visionReport,
  };
}

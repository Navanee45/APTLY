/**
 * APTLY — MediaPipe Face Mesh & Computer Vision Analytics Engine
 *
 * Implements deterministic client-side facial landmark tracking,
 * head-pose estimation (yaw, pitch, roll), eye-contact ratio estimation,
 * and temporal look-away event detection.
 */

export interface HeadPose {
  yaw: number; // Left (-) / Right (+)
  pitch: number; // Down (-) / Up (+)
  roll: number; // Tilt
  orientation: "camera-facing" | "looking-left" | "looking-right" | "looking-up" | "looking-down";
}

export interface LookAwayEvent {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  direction: "left" | "right" | "up" | "down";
}

export interface VisionAnalyticsResult {
  face_present_ratio: number;
  eye_contact_ratio: number | null; // null if face visibility < 30%
  eye_contact_status: "OPTIMAL" | "GOOD" | "NEEDS_IMPROVEMENT" | "UNAVAILABLE";
  average_head_pose: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  look_away_events: LookAwayEvent[];
  total_frames_analyzed: number;
}

export interface FaceLandmarksSample {
  timestamp_seconds: number;
  face_detected: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  is_camera_facing: boolean;
  direction?: "left" | "right" | "up" | "down";
}

/**
 * Approximate Head Pose from 3D Face Landmarks
 * Key landmarks:
 * Nose tip: 1
 * Chin: 152
 * Left eye corner: 33
 * Right eye corner: 263
 * Left mouth corner: 61
 * Right mouth corner: 291
 */
export function estimateHeadPose(landmarks: Array<{ x: number; y: number; z: number }>): HeadPose {
  if (!landmarks || landmarks.length < 468) {
    return { yaw: 0, pitch: 0, roll: 0, orientation: "camera-facing" };
  }

  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  // Eye midpoint
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

  // Yaw: horizontal offset of nose tip relative to eye midpoint normalized by eye distance
  const yaw = ((noseTip.x - eyeMidX) / (eyeDist || 1)) * 90;

  // Pitch: vertical offset of nose tip relative to eye-chin midpoint
  const faceMidY = (eyeMidY + chin.y) / 2;
  const pitch = ((faceMidY - noseTip.y) / (eyeDist || 1)) * 90;

  // Roll: tilt angle between eyes
  const roll = (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;

  let orientation: HeadPose["orientation"] = "camera-facing";
  if (yaw < -16) orientation = "looking-left";
  else if (yaw > 16) orientation = "looking-right";
  else if (pitch < -14) orientation = "looking-down";
  else if (pitch > 18) orientation = "looking-up";

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
    orientation,
  };
}

/**
 * Aggregate Frame-Level Samples into Final Vision Analytics Report
 */
export function aggregateVisionSamples(
  samples: FaceLandmarksSample[],
  totalDurationSeconds: number,
): VisionAnalyticsResult {
  if (!samples || samples.length === 0) {
    return {
      face_present_ratio: 0.0,
      eye_contact_ratio: null,
      eye_contact_status: "UNAVAILABLE",
      average_head_pose: { yaw: 0, pitch: 0, roll: 0 },
      look_away_events: [],
      total_frames_analyzed: 0,
    };
  }

  const totalFrames = samples.length;
  const facePresentCount = samples.filter((s) => s.face_detected).length;
  const facePresentRatio = Math.round((facePresentCount / totalFrames) * 100) / 100;

  // If face visibility is insufficient (<30%), eye contact is marked UNAVAILABLE
  if (facePresentRatio < 0.3) {
    return {
      face_present_ratio: facePresentRatio,
      eye_contact_ratio: null,
      eye_contact_status: "UNAVAILABLE",
      average_head_pose: { yaw: 0, pitch: 0, roll: 0 },
      look_away_events: [],
      total_frames_analyzed: totalFrames,
    };
  }

  const detectedSamples = samples.filter((s) => s.face_detected);
  const cameraFacingCount = detectedSamples.filter((s) => s.is_camera_facing).length;
  const eyeContactRatio = Math.round((cameraFacingCount / detectedSamples.length) * 100) / 100;

  let eyeContactStatus: VisionAnalyticsResult["eye_contact_status"] = "NEEDS_IMPROVEMENT";
  if (eyeContactRatio >= 0.75) eyeContactStatus = "OPTIMAL";
  else if (eyeContactRatio >= 0.55) eyeContactStatus = "GOOD";

  const avgYaw =
    Math.round(
      (detectedSamples.reduce((sum, s) => sum + s.yaw, 0) / detectedSamples.length) * 10,
    ) / 10;
  const avgPitch =
    Math.round(
      (detectedSamples.reduce((sum, s) => sum + s.pitch, 0) / detectedSamples.length) * 10,
    ) / 10;
  const avgRoll =
    Math.round(
      (detectedSamples.reduce((sum, s) => sum + s.roll, 0) / detectedSamples.length) * 10,
    ) / 10;

  // Detect sustained look-away events (>= 1.5 seconds)
  const lookAwayEvents: LookAwayEvent[] = [];
  let currentEventStart: number | null = null;
  let currentDirection: LookAwayEvent["direction"] | null = null;

  for (let i = 0; i < detectedSamples.length; i++) {
    const s = detectedSamples[i];
    if (!s.is_camera_facing && s.direction) {
      if (currentEventStart === null) {
        currentEventStart = s.timestamp_seconds;
        currentDirection = s.direction;
      }
    } else {
      if (currentEventStart !== null && currentDirection) {
        const duration = Math.round((s.timestamp_seconds - currentEventStart) * 10) / 10;
        if (duration >= 1.5) {
          lookAwayEvents.push({
            start_seconds: Math.round(currentEventStart * 10) / 10,
            end_seconds: Math.round(s.timestamp_seconds * 10) / 10,
            duration_seconds: duration,
            direction: currentDirection,
          });
        }
        currentEventStart = null;
        currentDirection = null;
      }
    }
  }

  // Handle trailing event
  if (currentEventStart !== null && currentDirection) {
    const lastTs = detectedSamples[detectedSamples.length - 1].timestamp_seconds;
    const duration = Math.round((lastTs - currentEventStart) * 10) / 10;
    if (duration >= 1.5) {
      lookAwayEvents.push({
        start_seconds: Math.round(currentEventStart * 10) / 10,
        end_seconds: Math.round(lastTs * 10) / 10,
        duration_seconds: duration,
        direction: currentDirection,
      });
    }
  }

  return {
    face_present_ratio: facePresentRatio,
    eye_contact_ratio: eyeContactRatio,
    eye_contact_status: eyeContactStatus,
    average_head_pose: { yaw: avgYaw, pitch: avgPitch, roll: avgRoll },
    look_away_events: lookAwayEvents,
    total_frames_analyzed: totalFrames,
  };
}

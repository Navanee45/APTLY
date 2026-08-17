# APTLY — Current Implementation Status Audit (Milestone 0)

> Generated as part of the PS-S04 Master Hardening & Completion Audit.
> Baseline date: 2026-08-17.

---

## 1. Domain Status Overview

| Subsystem | Status | Description |
|---|---|---|
| **Web Architecture** (`apps/web`) | **COMPLETE** | Next.js 15, App Router, TypeScript, TailwindCSS, layout, navbar, client state. |
| **Backend API** (`apps/api`) | **COMPLETE** | FastAPI, async SQLAlchemy, Pydantic v2 schemas, structured logging, centralized errors. |
| **Database** (`SQLite / Supabase Postgres`) | **COMPLETE** | Asyncpg/aiosqlite support, full migrations across `interviews`, `jobs`, `questions`, `answers`, `transcripts`, `speech_metrics`, `content_metrics`. |
| **Media Capture & Devices** (`useMediaCapture`) | **PARTIAL** | Live stream preview, audio visualizer, continuous WebM recording with on-stop requestData, metadata HUD (`videoWidth`). Device enumeration and explicit state machine needed. |
| **Storage Subsystem** (`Supabase Storage`) | **PARTIAL** | Direct binary upload via service role key verified working (`aptly-media`). Private signed URL retrieval and user isolation need completion. |
| **Speech-to-Text** (`WhisperX / faster-whisper`) | **COMPLETE** | 16kHz WAV extraction, word-level timestamps, cross-attention alignment, CPU/CUDA fallback. |
| **LLM Provider** (`Google Gemini`) | **COMPLETE** | Official `google-genai` SDK, configured with active `gemini-flash-latest`, structured JSON generation with retry. |
| **Adaptive Interview Engine** | **PARTIAL** | Follow-up question generation grounded in candidate transcript. Dynamic difficulty adjustment needs hardening. |
| **Content Intelligence (STAR & Claims)** | **COMPLETE** | Relevance, completeness, technical depth, STAR breakdown, claims audit, actionable feedback drills. |
| **Delivery Analytics** (`SpeechMetrics`) | **PARTIAL** | WPM calculation, filler word counting (`um`, `uh`, `like`), pause detection with timestamps. Voice energy & frame-level RMS missing. |
| **Vision Analysis** (`MediaPipe`) | **MISSING** | Face landmarks, head-pose estimation (yaw/pitch/roll), eye-contact ratio, look-away events. |
| **Post-Interview Reporting** | **PARTIAL** | Aggregate scores, WPM, filler density, per-question review. Top 3 damaging habits ranking & unified multimodal timeline missing. |
| **Scoring Algorithm Versioning** | **PARTIAL** | `scoring_algorithm_version: "1.0"` schema present. Formal deterministic weighted normalization needs hardening. |
| **Multi-User Authentication & RLS** | **MISSING** | Supabase Auth login/signup UI, JWT verification dependency, `user_id` scoping on tables and storage buckets. |
| **Progress & History Tracking** | **PARTIAL** | `/progress` page stub present. Role-filtered trend lines and session history need completion. |
| **Privacy & Deletion** | **PARTIAL** | Recording consent modal present. Complete interview + storage object deletion lifecycle needed. |

---

## 2. Detailed Audit Categorization

### COMPLETE
- **FastAPI Core Foundation**: Strict typed endpoints, request validation, structured request ID tracing, clean error envelopes without Python stack traces.
- **Gemini LLM Provider**: Fully operational pure Gemini engine using `gemini-flash-latest` with structured JSON schema responses.
- **WhisperX Transcription**: Word-level timestamps (`start_seconds`, `end_seconds`, `confidence`) with robust temporary file lifecycle on Windows.
- **Database ORM & Migrations**: Complete models for `Job`, `RoleProfile`, `Interview`, `Question`, `Answer`, `Transcript`, `SpeechMetrics`, `ContentMetrics`.
- **Role Profiler**: Natural language parsing of JDs into seniority, domains, tools, and competency matrices.
- **Audio Normalization**: FFmpeg 16kHz mono 16-bit PCM WAV normalization pipeline.
- **Full 8-Step Lifecycle**: Verified E2E backend integration test suite (`tests/` passing 68/70).

### PARTIAL
- **MediaRecorder Capture** (`useMediaCapture.ts`):
  - *Current*: Live preview, continuous WebM recording, mic volume monitoring.
  - *Missing*: Explicit device selector dropdown, audio input enumeration, camera permission error recovery guide.
- **Post-Interview Review** (`/interview/[id]/review`):
  - *Current*: Overview cards, question accordion, transcript text, speech metrics, STAR breakdown.
  - *Missing*: Click-to-seek video sync from transcript words, interactive filler/pause timeline.
- **Realtime WebSocket Channel** (`realtime.py`):
  - *Current*: Session state push, sequence tracking, heartbeat pong.
  - *Missing*: Dynamic service role dependency injection instead of local stub instances.
- **Delivery Analysis** (`speech_metrics.py`):
  - *Current*: WPM, filler word detection, pause duration and timestamps.
  - *Missing*: Voice energy RMS amplitude calculation across temporal frames.

### BROKEN (Fixed in previous session)
- **Supabase Storage Uploads**: Fixed timeout and exception string serialization.
- **Video Preview Black Screen**: Fixed via reactive `useEffect` video attachment.
- **WhisperX Temp File Unlink**: Fixed file retention during active model inference.
- **Gemini 404 Model Aliasing**: Fixed by configuring `gemini-flash-latest`.

### MISSING
- **MediaPipe Computer Vision**:
  - Head pose classification (`camera-facing`, `left`, `right`, `up`, `down`).
  - Eye-contact approximation ratio.
  - Temporal look-away sustained event detection (`start_seconds` → `end_seconds`).
- **Media Preflight & Test Pages**:
  - `/debug/media` (live camera/mic/codec playground).
  - `/debug/preflight` (readiness checklist for all 8 subsystems).
- **Top 3 Damaging Habits Analyzer**:
  - Deterministic severity-ranked habit prioritization (e.g. Excessive Fillers, Long Dead-Air Pauses, Incomplete STAR Results).
- **Multi-User Auth & RLS**:
  - Supabase JWT validation on API requests, user-scoped storage paths `users/{user_id}/interviews/{interview_id}/`.
- **Progress Dashboard**:
  - Trajectory charts, role-specific scoring trends, baseline vs best comparisons.

---

## 3. Execution Roadmap

1. **Milestone 1**: Media Foundation (`/debug/media`, device selector, explicit state machine, click-to-seek playback).
2. **Milestone 2**: Supabase Storage Signed URLs & User Isolation.
3. **Milestone 3**: WhisperX Transcript ↔ Recording Synchronization (click word/filler to seek).
4. **Milestone 4 & 5**: Adaptive Gemini Intelligence, Structured STAR & Claims Coaching.
5. **Milestone 6**: Voice Energy RMS & Complete Delivery Analytics.
6. **Milestone 7**: MediaPipe Computer Vision (Gaze, Head Pose, Look-Away Events).
7. **Milestone 8 & 9**: Multimodal Evidence Timeline, Top 3 Damaging Habits, Practice Drills.
8. **Milestone 10**: Version-Stable Scoring Engine (`v1.0.0`).
9. **Milestone 11 & 12**: Multi-User Authentication, RLS Policies, `/progress` & `/history`.
10. **Milestone 13 & 14**: Privacy Consent, Data Deletion, Security Hardening.
11. **Milestone 15-28**: Preflight Check (`/debug/preflight`), Live 10-minute Interview Validation, Traceability Documentation.

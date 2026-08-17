# APTLY Multi-User Architecture & Security Audit (Phase 0)

**Audit Date**: 2026-08-17  
**Auditor**: Antigravity Principal Software Architect & Supabase Database Architect  
**Objective**: Audit the entire codebase against the Multi-User Isolated Logical Workspace requirements before making code modifications.

---

## 1. Executive Summary & Component Classification

| Subsystem / Area | Status | Classification | Finding & Architectural Gap |
| :--- | :--- | :--- | :--- |
| **Supabase Auth Integration** | Backend / Frontend | **MISSING** | Auth endpoints, token verification middleware (`get_current_user`), and client auth context are missing. |
| **User Profile & Ownership Graph** | Database / ORM | **MISSING** | `profiles` table does not exist. `interviews` table lacks `user_id` foreign key. |
| **Row Level Security (RLS)** | Database Policies | **UNSAFE** | RLS is not yet enabled on user-owned tables. |
| **Storage Isolation** | Supabase Storage | **PARTIAL** | Storage provider exists and writes to `aptly-media`, but keys do not enforce the mandatory `users/{user_id}/interviews/{interview_id}/...` tenant prefix. |
| **Protected Frontend Routes** | Next.js Router | **MISSING** | No route guards or redirect to `/login` for `/dashboard`, `/interview/*`, `/history`, `/progress`, `/reports`, `/settings`. |
| **User Dashboard** | Frontend UI | **MOCK** | Shows static Phase 0 placeholder cards; does not query current user's interviews or scores. |
| **Personal Interview History** | Frontend & API | **MISSING** | `/history` route does not exist. No endpoint for user-scoped interview pagination. |
| **Personal Reports Archive** | Frontend & API | **PARTIAL** | Individual review exists at `/interview/[id]/review`, but global `/reports` archive with user ownership filters is missing. |
| **User Progress Database** | Database & Service | **MISSING** | `user_progress` table and progress calculation engine tracking multi-session trajectories do not exist. |
| **User Documents & Coaching History**| Database & Engine | **MISSING** | `user_documents` and `coaching_history` models do not exist. |
| **Version-Stable Scoring (v1.0.0)** | Scoring Engine | **COMPLETE** | Scoring algorithm version `1.0.0` is stamped on `Interview`, `SpeechMetrics`, and `ContentMetrics`. |
| **AI Context Isolation (Gemini)** | LLM Service | **PARTIAL** | AI evaluation operates per-answer, but user-level coaching summaries are not yet anchored to authenticated `user_id`. |
| **Account & Interview Deletion** | Data Lifecycle | **MISSING** | No cascade deletion endpoint for user profile, documents, and private storage assets. |

---

## 2. In-Depth Subsystem Analysis

### A. Authentication & User Identity
- **Current State**: Backend uses no authentication middleware (`app/core/security.py` states Phase 0 placeholder). Endpoints do not extract or verify JWT bearer tokens.
- **Requirement**: Implement FastAPI dependency `get_current_user` verifying Supabase JWT tokens via `SUPABASE_URL` / JWKS or secret verification. Frontend must manage sessions via `@supabase/ssr` / `@supabase/supabase-js`.

### B. Data Models & Relational Ownership
- **Current State**:
  - `interviews` table has `id`, `title`, `job_id`, `role_profile_id`, `status`, but NO `user_id`.
  - `jobs`, `questions`, `answers`, `transcripts`, `speech_metrics`, `content_metrics` cascade from `interviews`.
- **Target Schema Migration**:
  - Add `profiles` table (`id` UUID -> `auth.users.id`, `display_name`, `avatar_url`, `created_at`, `updated_at`).
  - Add `user_id` (UUID, indexed, non-null) to `interviews`.
  - Create `user_progress` table (`id`, `user_id`, `interview_id`, `scoring_algorithm_version`, `overall_score`, `content_score`, `delivery_score`, `wpm`, `filler_density`, `created_at`).
  - Create `user_documents` table (`id`, `user_id`, `interview_id`, `document_type`, `title`, `content_markdown`, `metadata_json`, `document_version`, `created_at`).
  - Create `user_preferences` table (`id`, `user_id`, `preferred_role`, `difficulty`, `auto_record`, `privacy_settings`).

### C. Storage Structure & Access Isolation
- **Current State**: Media is uploaded under `{data_class}/{interview_id}/{uuid}.{ext}`.
- **Requirement**: Re-scope all storage paths strictly to:
  ```text
  users/{user_id}/interviews/{interview_id}/{data_class}/{filename}
  ```
  Enforce storage security so User A cannot read or presign User B's files.

### D. Gemini AI Context Boundary
- **Current State**: Prompts receive candidate transcript per answer.
- **Requirement**: Pass only the authenticated user's coaching history into adaptive interview prompts. Never aggregate multiple candidates into shared prompts.

---

## 3. Step-by-Step Implementation Roadmap

1. **Step 1: Auth & User Context**
   - Install `@supabase/supabase-js` and `@supabase/ssr` in `apps/web`.
   - Implement `auth.py` in `apps/api/app/core/` with JWT decoding and `get_current_user` dependency.
   - Support dev authentication fallback (header-based token decoding) for local tests.

2. **Step 2: Database Schema & Migration**
   - Create models: `Profile`, `UserProgress`, `UserDocument`, `UserPreference`.
   - Add `user_id` to `Interview` model.
   - Run SQLite / PostgreSQL migration script to apply tables and columns.
   - Enable PostgreSQL RLS scripts in `docs/supabase-rls.sql`.

3. **Step 3: API Ownership & User-Scoped Endpoints**
   - Update `POST /api/v1/interviews` to derive `user_id` directly from `current_user`.
   - Update `GET /api/v1/interviews` to list only `current_user.id` sessions with pagination.
   - Add IDOR checks preventing User A from fetching User B's interview or review.
   - Add `/api/v1/progress` and `/api/v1/documents` endpoints.
   - Add account and interview cascade deletion endpoints.

4. **Step 4: Frontend Auth, Protected Routes & UI Pages**
   - Build `/login`, `/register`, `/forgot-password`, `/reset-password`.
   - Create auth context / state provider in Next.js.
   - Build `/dashboard` personalized with user name, recent interviews, and scores.
   - Build `/history` showing personal interview archives.
   - Build `/progress` with version-stable trajectory charts and personal weakness tracking.
   - Build `/reports` document archive.
   - Build `/privacy` explaining data retention and user ownership.

5. **Step 5: Automated Testing & Verification**
   - Multi-user isolation tests (User A vs User B).
   - IDOR rejection tests (403 Forbidden / 404 Not Found).
   - Full regression test suite passing.

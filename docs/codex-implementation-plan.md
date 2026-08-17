# APTLY Verified Implementation Plan

This plan follows the findings in `docs/codex-ui-audit.md`. A milestone is not complete until its stated validation has passed; unverified external integrations remain explicitly unverified.

## Milestone 1 — P0 authorization and storage isolation

- Replace unverified JWT-claim fallback with Supabase JWKS validation; preserve a clearly gated local development bypass only.
- Require authenticated ownership on `start`, answer creation/upload, `next-question`, `finish`, media streaming, and media signing.
- Resolve media access through an answer/interview owned by the requester; do not accept an unrestricted storage key as authority.
- Prefix new objects with `users/{user_id}/interviews/{interview_id}/` and migrate/backfill only with an approved data migration plan.
- Return safe error envelopes without provider exception text.

**Validation:** FastAPI unit tests for absent, expired, tampered, and valid JWTs; two-user API tests covering every route and direct media URLs; Supabase RLS policy test run against a real project before release.

## Milestone 2 — Recording and interview lifecycle reliability

- Centralize the live-interview state machine and permit only the documented valid transitions.
- Make start/stop/upload idempotent and reject empty final blobs.
- Retain device selection when reacquiring streams; handle permission denial, device change, track end, route change, and unmount.
- Remove or consolidate the divergent legacy audio recorder.
- Add recording validation UI with duration, file size, audio/video track status, and playback before processing.

**Validation:** unit tests for transitions and blob validation; Playwright/browser manual matrix for permissions, interruption, repeated short recordings, and route changes.

## Milestone 3 — Restore quality gates and truthful data states

- Fix all current frontend lint errors/warnings and type every API error path.
- Replace fabricated dashboard/review defaults with explicit empty, loading, failed, and demo-labelled states.
- Standardize scoring version to `1.0.0` through model, migration, API, and UI.
- Repair API test environment and run ruff, mypy, and pytest.

**Validation:** clean lint/typecheck/test/build; API suite runnable locally; no production screen emits mock scores, reports, or drills.

## Milestone 4 — Evidence-backed analytics and reports

- Persist voice-energy frames and MediaPipe estimate events with source timestamps.
- Build the unified evidence timeline; make every transcript/event seek control keyboard accessible.
- Build `/reports`, `/reports/[id]`, and `/practice` using persisted evidence only.
- Rank top habits deterministically with evidence, impact, target, and drill; display scoring version on reports and progress.

**Validation:** seeded non-production fixture tests; empty-state tests; transcript/timeline seek E2E tests; content assertions that no fallback coaching appears.

## Milestone 5 — Premium product system and responsive navigation

- Define semantic tokens for surfaces, typography, spacing, status, focus, motion, and charts.
- Build desktop sidebar and mobile bottom navigation covering Dashboard, Interviews, Progress, Reports, Practice, and Settings.
- Complete `/settings`, enhance device check/new interview, and use staged processing UI without fabricated percentages.
- Audit focus order, contrast, screen-reader summaries, errors, empty states, and viewport layouts.

**Validation:** component visual checks at desktop/tablet/mobile; keyboard-only route walkthrough; automated accessibility checks where available.

## Milestone 6 — Purposeful 3D and demo

- Add only the required R3F dependencies after the product core is stable.
- Implement lazy `AIOrb`, `InterviewCore`, and `ProgressOrb` with capped DPR, reduced-motion/static fallback, visibility pause, and no essential data solely in 3D.
- Add strictly isolated `/demo` data only after production/real-user flows are secure.

**Validation:** bundle analysis, reduced-motion test, low-power fallback test, and demo-data isolation test.

## Release gate

Run web lint/typecheck/unit/E2E/production build and API ruff/mypy/unit/integration suites. Then complete `docs/ps-s04-ui-validation.md` and `docs/codex-final-audit.md` with only observed results and remaining limitations.

"""
APTLY API — Interview, Question, Answer, and SpeechMetrics Schemas
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.common import AptlyBaseModel, VersionedSchema
from app.schemas.content_intelligence import (
    ClaimItem,
    EvidenceItem,
    FeedbackItem,
    PracticeDrill,
    StarAnalysis,
)
from app.schemas.jobs import RoleProfileResponse

# ── Question Schemas ──────────────────────────────────────────────────────────


class QuestionResponse(AptlyBaseModel):
    """Schema for an interview question."""

    id: UUID
    interview_id: UUID
    sequence_number: int
    category: str
    question_type: str
    competency: str
    difficulty: str
    question_text: str
    expected_topics: list[str] = Field(default_factory=list)
    prompt_version: str = "v1"
    question_source: str = "generated"  # "generated" | "follow_up" | "adaptive"
    follow_up_depth: int = 0
    target_competency: str | None = None


# ── Transcript & Speech Metrics Schemas ───────────────────────────────────────


class FillerOccurrence(AptlyBaseModel):
    """Individual filler word detection with timestamp."""

    word: str
    timestamp_seconds: float
    duration_seconds: float = 0.2


class PauseOccurrence(AptlyBaseModel):
    """Individual long pause with timestamps and duration."""

    start_seconds: float
    end_seconds: float
    duration_seconds: float


class SpeechMetricsResponse(VersionedSchema):
    """Deterministic speech metrics computed from word timestamps."""

    id: UUID
    answer_id: UUID
    wpm: float
    speaking_duration_seconds: float
    total_words: int
    filler_count: int
    filler_density: float  # fillers / word_count
    filler_words: list[FillerOccurrence] = Field(default_factory=list)
    pause_count: int
    total_pause_seconds: float
    pauses: list[PauseOccurrence] = Field(default_factory=list)
    voice_energy: dict[str, Any] | None = None
    created_at: datetime


class TranscriptResponse(VersionedSchema):
    """Full word-level aligned transcript."""

    id: UUID
    answer_id: UUID
    full_text: str
    word_count: int
    language: str = "en"
    segments: list[dict[str, Any]] = Field(default_factory=list)
    words: list[dict[str, Any]] = Field(default_factory=list)
    model_provider: str = "mock"
    model_version: str = "mock-v1.0"
    created_at: datetime


# ── Content Intelligence Schemas ───────────────────────────────────────────


class ContentMetricsResponse(VersionedSchema):
    """Persisted semantic content intelligence for an answer."""

    id: UUID
    answer_id: UUID
    question_type: str
    relevance_score: float
    technical_depth_score: float
    completeness_score: float
    structure_score: float
    evidence_score: float
    overall_content_score: float
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    star_analysis: StarAnalysis | None = None
    claims: list[ClaimItem] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    feedback: list[FeedbackItem] = Field(default_factory=list)
    practice_drills: list[PracticeDrill] = Field(default_factory=list)
    reasoning_summary: str = ""
    provider: str = "mock"
    model: str = "gpt-4o-mini"
    prompt_version: str = "content-v1.0"
    created_at: datetime


# ── Answer Schemas ────────────────────────────────────────────────────────────


class AnswerCreateRequest(AptlyBaseModel):
    """Payload to initialize a candidate answer for a question."""

    question_id: UUID


class AnswerResponse(AptlyBaseModel):
    """Candidate answer entity."""

    id: UUID
    interview_id: UUID
    question_id: UUID
    sequence_number: int
    status: str
    duration_seconds: float
    started_at: datetime | None = None
    ended_at: datetime | None = None
    audio_storage_key: str | None = None
    audio_size_bytes: int | None = None
    playback_url: str | None = None
    transcript: TranscriptResponse | None = None
    speech_metrics: SpeechMetricsResponse | None = None
    content_metrics: ContentMetricsResponse | None = None
    created_at: datetime


# ── Interview Schemas ─────────────────────────────────────────────────────────


class InterviewCreateRequest(AptlyBaseModel):
    """Payload to create and configure a new interview session."""

    job_id: UUID | None = Field(
        default=None, description="Associated job ID if created from a JD."
    )
    role_profile_id: UUID | None = Field(
        default=None, description="Associated role profile ID."
    )
    title: str = Field(default="Practice Interview", max_length=255)
    interview_type: str = Field(
        default="mixed", description="mixed, technical, behavioral"
    )
    difficulty_level: str = Field(default="medium", description="easy, medium, hard")
    target_duration_minutes: int = Field(default=10, ge=3, le=60)
    question_count: int = Field(default=3, ge=1, le=10)


class InterviewResponse(VersionedSchema):
    """Summary representation of an Interview."""

    id: UUID
    title: str
    status: str
    interview_type: str
    difficulty_level: str
    target_duration_minutes: int
    current_question_index: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class InterviewDetailResponse(InterviewResponse):
    """Full detail view of an Interview including questions and answers."""

    role_profile: RoleProfileResponse | None = None
    questions: list[QuestionResponse] = Field(default_factory=list)
    answers: list[AnswerResponse] = Field(default_factory=list)


# ── Post-Interview Review Schemas ─────────────────────────────────────────────


class QuestionReviewItem(AptlyBaseModel):
    """Detailed review of an individual question and answer."""

    question: QuestionResponse
    answer: AnswerResponse | None = None
    transcript: TranscriptResponse | None = None
    speech_metrics: SpeechMetricsResponse | None = None
    content_metrics: ContentMetricsResponse | None = None


class InterviewReviewResponse(VersionedSchema):
    """Comprehensive post-interview review view."""

    interview: InterviewResponse
    role_profile: RoleProfileResponse | None = None
    total_duration_seconds: float
    total_answers_count: int
    average_wpm: float
    total_fillers_count: int
    overall_filler_density: float
    total_pauses_count: int
    average_content_score: float = 0.0
    average_relevance_score: float = 0.0
    average_technical_depth_score: float = 0.0
    overall_delivery_score: float = 0.0
    overall_composite_score: float = 0.0
    top_habits: list[dict[str, Any]] = Field(default_factory=list)
    questions_review: list[QuestionReviewItem] = Field(default_factory=list)

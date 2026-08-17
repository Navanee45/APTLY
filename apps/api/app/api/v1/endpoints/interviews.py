"""
APTLY API — Interview Endpoints
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.idempotency import get_idempotency_key
from app.dependencies import (
    get_db,
    get_llm_provider,
    get_storage,
    get_transcription_provider,
)
from app.schemas.interviews import (
    AnswerCreateRequest,
    AnswerResponse,
    ContentMetricsResponse,
    InterviewCreateRequest,
    InterviewDetailResponse,
    InterviewReviewResponse,
    QuestionResponse,
    SpeechMetricsResponse,
    TranscriptResponse,
)
from app.services.interview_service import InterviewService
from app.services.providers.base import LLMProvider, TranscriptionProvider
from app.services.storage.base import StorageProvider

router = APIRouter(prefix="/interviews", tags=["Interviews"])


def _get_interview_service(
    db: AsyncSession = Depends(get_db),
    llm_provider: LLMProvider = Depends(get_llm_provider),
    transcription_provider: TranscriptionProvider = Depends(get_transcription_provider),
    storage_provider: StorageProvider = Depends(get_storage),
) -> InterviewService:
    return InterviewService(
        db_session=db,
        llm_provider=llm_provider,
        transcription_provider=transcription_provider,
        storage_provider=storage_provider,
    )


async def _require_owned_interview(
    interview_id: UUID,
    user: UserContext,
    service: InterviewService,
) -> Any:
    """Return an interview only when it belongs to the authenticated caller."""
    detail = await service.get_interview_detail(interview_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTERVIEW_NOT_FOUND", "message": "Interview was not found."},
        )
    if detail.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this interview."},
        )
    return detail


@router.post(
    "",
    response_model=InterviewDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and configure interview",
    description="Creates an interview session and dynamically generates tailored questions.",
)
async def create_interview(
    payload: InterviewCreateRequest,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
    idempotency_key: UUID | None = Depends(get_idempotency_key),
) -> InterviewDetailResponse:
    """Create a new practice interview session for the authenticated user."""
    interview = await service.create_interview(
        title=payload.title,
        interview_type=payload.interview_type,
        difficulty_level=payload.difficulty_level,
        target_duration_minutes=payload.target_duration_minutes,
        question_count=payload.question_count,
        job_id=payload.job_id,
        role_profile_id=payload.role_profile_id,
        user_id=user.id,
    )

    detail = await service.get_interview_detail(interview.id)
    if not detail:
        raise HTTPException(status_code=500, detail="Failed to load created interview.")

    return _to_detail_response(detail)


@router.get(
    "",
    response_model=list[InterviewDetailResponse],
    summary="List user interviews",
    description="Returns all interviews owned by the authenticated user with optional pagination.",
)
async def list_interviews(
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
    limit: int = 20,
    offset: int = 0,
    status_filter: str | None = None,
) -> list[InterviewDetailResponse]:
    """List authenticated user's interviews."""
    interviews = await service.list_user_interviews(
        user_id=user.id, limit=limit, offset=offset, status=status_filter
    )
    return [_to_detail_response(itv) for itv in interviews]


@router.get(
    "/{interview_id}",
    response_model=InterviewDetailResponse,
    summary="Get interview details",
    description="Fetches an interview, ensuring caller is the authenticated owner.",
)
async def get_interview(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> InterviewDetailResponse:
    """Retrieve full interview details."""
    detail = await service.get_interview_detail(interview_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INTERVIEW_NOT_FOUND",
                "message": f"Interview '{interview_id}' not found.",
            },
        )
    # IDOR Security Check
    if detail.user_id and detail.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this interview."},
        )
    return _to_detail_response(detail)


@router.post(
    "/{interview_id}/start",
    response_model=InterviewDetailResponse,
    summary="Start interview session",
    description="Transitions the interview to active/running state and activates Question 1.",
)
async def start_interview(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> InterviewDetailResponse:
    """Start the live interview."""
    await _require_owned_interview(interview_id, user, service)
    interview = await service.start_interview(interview_id)
    return _to_detail_response(interview)


@router.post(
    "/{interview_id}/answers",
    response_model=AnswerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create answer record",
    description="Initializes a candidate answer recording for a question.",
)
async def create_answer(
    interview_id: UUID,
    payload: AnswerCreateRequest,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> AnswerResponse:
    """Create an answer record."""
    interview = await _require_owned_interview(interview_id, user, service)
    if payload.question_id not in {question.id for question in interview.questions}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "QUESTION_NOT_FOUND", "message": "Question was not found in this interview."},
        )
    answer = await service.create_answer(interview_id, payload.question_id)
    return _to_answer_response(answer)


@router.post(
    "/{interview_id}/answers/{answer_id}/upload",
    response_model=AnswerResponse,
    summary="Upload answer audio",
    description="Uploads binary audio recording (WebM/WAV) and triggers async speech processing.",
)
async def upload_answer_audio(
    interview_id: UUID,
    answer_id: UUID,
    audio_file: Annotated[UploadFile, File(description="Binary audio recording file")],
    user: Annotated[UserContext, Depends(get_current_user)],
    duration_seconds: Annotated[
        float, Form(description="Total recorded duration in seconds")
    ] = 0.0,
    service: InterviewService = Depends(_get_interview_service),
) -> AnswerResponse:
    """Upload recorded audio and process transcript/metrics."""
    interview = await _require_owned_interview(interview_id, user, service)
    if answer_id not in {answer.id for answer in interview.answers}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ANSWER_NOT_FOUND", "message": "Answer was not found in this interview."},
        )
    audio_data = await audio_file.read()
    if len(audio_data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EMPTY_AUDIO_RECORDING",
                "message": "Uploaded audio payload is empty.",
            },
        )

    content_type = audio_file.content_type or "audio/webm"
    answer = await service.upload_and_process_answer(
        interview_id=interview_id,
        answer_id=answer_id,
        audio_data=audio_data,
        content_type=content_type,
        duration_seconds=duration_seconds,
    )
    return _to_answer_response(answer)


@router.post(
    "/{interview_id}/next-question",
    response_model=InterviewDetailResponse,
    summary="Advance to next question",
    description="Advances the interview to the next question index or marks it completed.",
)
async def next_question(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> InterviewDetailResponse:
    """Advance to the next question."""
    await _require_owned_interview(interview_id, user, service)
    interview = await service.advance_question(interview_id)
    return _to_detail_response(interview)


@router.post(
    "/{interview_id}/finish",
    response_model=InterviewDetailResponse,
    summary="Finish interview session",
    description="Finalizes the interview and marks it complete.",
)
async def finish_interview(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> InterviewDetailResponse:
    """Finish the interview."""
    await _require_owned_interview(interview_id, user, service)
    interview = await service.finish_interview(interview_id)
    return _to_detail_response(interview)


@router.get(
    "/{interview_id}/review",
    response_model=InterviewReviewResponse,
    summary="Get post-interview review",
    description="Returns comprehensive speech metrics, transcripts, and question-by-question breakdown for the owner.",
)
async def get_interview_review(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> InterviewReviewResponse:
    """Retrieve post-interview review data with IDOR verification."""
    detail = await service.get_interview_detail(interview_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTERVIEW_NOT_FOUND", "message": f"Interview '{interview_id}' not found."},
        )
    if detail.user_id and detail.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this interview review."},
        )
    review = await service.compile_review(interview_id)
    return InterviewReviewResponse(**review)


@router.delete(
    "/{interview_id}",
    summary="Delete interview",
    description="Permanently deletes an interview and all associated recordings/metrics for the owner.",
)
async def delete_interview(
    interview_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    service: InterviewService = Depends(_get_interview_service),
) -> dict[str, Any]:
    """Delete an interview."""
    detail = await service.get_interview_detail(interview_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTERVIEW_NOT_FOUND", "message": f"Interview '{interview_id}' not found."},
        )
    if detail.user_id and detail.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this interview."},
        )
    await service.delete_interview(interview_id, user.id)
    return {"status": "deleted", "interview_id": str(interview_id)}


# ── Response Mappers ──────────────────────────────────────────────────────────


def _to_detail_response(interview: Any) -> InterviewDetailResponse:
    questions_res = [
        QuestionResponse(
            id=q.id,
            interview_id=q.interview_id,
            sequence_number=q.sequence_number,
            category=q.category,
            question_type=q.question_type,
            competency=q.competency,
            difficulty=q.difficulty,
            question_text=q.question_text,
            expected_topics=q.expected_topics,
            prompt_version=q.prompt_version,
            question_source=getattr(q, "question_source", "generated") or "generated",
            follow_up_depth=getattr(q, "follow_up_depth", 0) or 0,
            target_competency=getattr(q, "target_competency", None),
        )
        for q in interview.questions
    ]

    answers_res = [_to_answer_response(a) for a in getattr(interview, "answers", [])]

    return InterviewDetailResponse(
        id=interview.id,
        title=interview.title,
        status=interview.status,
        interview_type=interview.interview_type,
        difficulty_level=interview.difficulty_level,
        target_duration_minutes=interview.target_duration_minutes,
        current_question_index=interview.current_question_index,
        started_at=interview.started_at,
        completed_at=interview.completed_at,
        created_at=interview.created_at,
        questions=questions_res,
        answers=answers_res,
    )


def _to_answer_response(answer: Any) -> AnswerResponse:
    transcript_res = None
    if getattr(answer, "transcript", None):
        t = answer.transcript
        transcript_res = TranscriptResponse(
            id=t.id,
            answer_id=t.answer_id,
            full_text=t.full_text,
            word_count=t.word_count,
            language=t.language,
            segments=t.segments_json,
            words=t.words_json,
            model_provider=t.model_provider,
            model_version=t.model_version,
            created_at=t.created_at,
        )

    speech_metrics_res = None
    if getattr(answer, "speech_metrics", None):
        m = answer.speech_metrics
        speech_metrics_res = SpeechMetricsResponse(
            id=m.id,
            answer_id=m.answer_id,
            wpm=m.wpm,
            speaking_duration_seconds=m.speaking_duration_seconds,
            total_words=m.total_words,
            filler_count=m.filler_count,
            filler_density=m.filler_density,
            filler_words=m.filler_words_json,
            pause_count=m.pause_count,
            total_pause_seconds=m.total_pause_seconds,
            pauses=m.pauses_json,
            created_at=m.created_at,
        )

    content_metrics_res = None
    if getattr(answer, "content_metrics", None):
        cm = answer.content_metrics
        content_metrics_res = ContentMetricsResponse(
            id=cm.id,
            answer_id=cm.answer_id,
            question_type=cm.question_type,
            relevance_score=cm.relevance_score,
            technical_depth_score=cm.technical_depth_score,
            completeness_score=cm.completeness_score,
            structure_score=cm.structure_score,
            evidence_score=cm.evidence_score,
            overall_content_score=cm.overall_content_score,
            strengths=cm.strengths_json,
            weaknesses=cm.weaknesses_json,
            star_analysis=cm.star_analysis_json,
            claims=cm.claims_json,
            evidence=cm.evidence_json,
            feedback=cm.feedback_json,
            practice_drills=cm.practice_drills_json,
            reasoning_summary=cm.reasoning_summary,
            provider=cm.provider,
            model=cm.model,
            prompt_version=cm.prompt_version,
            created_at=cm.created_at,
        )

    return AnswerResponse(
        id=answer.id,
        interview_id=answer.interview_id,
        question_id=answer.question_id,
        sequence_number=answer.sequence_number,
        status=answer.status,
        duration_seconds=answer.duration_seconds,
        started_at=answer.started_at,
        ended_at=answer.ended_at,
        audio_storage_key=answer.audio_storage_key,
        audio_size_bytes=answer.audio_size_bytes,
        transcript=transcript_res,
        speech_metrics=speech_metrics_res,
        content_metrics=content_metrics_res,
        created_at=answer.created_at,
    )

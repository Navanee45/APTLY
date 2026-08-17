"""
APTLY API — Interview Service

Orchestrates the complete interview lifecycle:
- Session creation & question generation
- State machine transition enforcement
- Answer creation, binary upload registration, and async background processing
- Deterministic speech metrics derivation & persistence
- Post-interview review compilation
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AptlyException
from app.core.logging import get_logger
from app.models.answer import Answer
from app.models.interview import Interview
from app.models.job import Job, RoleProfile
from app.models.metrics import SpeechMetrics
from app.models.profile import Profile
from app.models.progress import UserProgress
from app.models.question import Question
from app.models.transcript import Transcript
from app.models.user_document import UserDocument
from app.schemas.content_intelligence import ContentAnalysisInput
from app.services.adaptive_interview.engine import GeminiAdaptiveEngine
from app.services.content_intelligence.service import ContentAnalysisService
from app.services.media_normalizer import MediaNormalizerService
from app.services.providers.base import (
    LLMProvider,
    TranscriptionProvider,
    TranscriptionRequest,
)
from app.services.question_generator import QuestionGeneratorService
from app.services.role_analyzer import RoleAnalyzerService
from app.services.speech_metrics import SpeechMetricsService
from app.services.storage.base import StorageProvider, UploadRequest

logger = get_logger(__name__)

# Valid state machine transitions
VALID_INTERVIEW_TRANSITIONS: dict[str, set[str]] = {
    "created": {"ready", "failed"},
    "ready": {"running", "failed"},
    "running": {"question_active", "failed"},
    "question_active": {"answering", "completing", "failed", "next_question"},
    "answering": {"answer_submitted", "question_active", "failed"},
    "answer_submitted": {
        "processing",
        "next_question",
        "question_active",
        "completing",
        "failed",
    },
    "processing": {"next_question", "question_active", "completing", "failed"},
    "next_question": {"question_active", "completing", "failed"},
    "completing": {"completed", "failed"},
    "completed": set(),  # Terminal
    "failed": {"ready", "running"},  # Recovery
}


class InvalidStateTransitionError(AptlyException):
    """Raised when an illegal state transition is attempted."""

    status_code = 400
    error_code = "INVALID_STATE_TRANSITION"

    def __init__(self, current_status: str, target_status: str) -> None:
        super().__init__(
            message=f"Cannot transition interview from '{current_status}' to '{target_status}'.",
        )


class InterviewService:
    """
    Core business logic and state machine coordinator for interviews.
    """

    def __init__(
        self,
        db_session: AsyncSession,
        llm_provider: LLMProvider,
        transcription_provider: TranscriptionProvider,
        storage_provider: StorageProvider,
    ) -> None:
        self.db = db_session
        self.llm_provider = llm_provider
        self.transcription_provider = transcription_provider
        self.storage_provider = storage_provider
        self.role_analyzer = RoleAnalyzerService(llm_provider)
        self.question_generator = QuestionGeneratorService(llm_provider)
        self.speech_metrics_service = SpeechMetricsService()
        self.content_analysis_service = ContentAnalysisService(llm_provider)
        self.media_normalizer = MediaNormalizerService()
        self.adaptive_engine = GeminiAdaptiveEngine(llm_provider=llm_provider)

    def transition_state(self, interview: Interview, new_status: str) -> None:
        """Enforce strict state machine transitions."""
        allowed = VALID_INTERVIEW_TRANSITIONS.get(interview.status, set())
        if new_status not in allowed:
            raise InvalidStateTransitionError(interview.status, new_status)
        interview.status = new_status

    async def create_interview(
        self,
        title: str,
        interview_type: str = "mixed",
        difficulty_level: str = "medium",
        target_duration_minutes: int = 10,
        question_count: int = 3,
        job_id: UUID | None = None,
        role_profile_id: UUID | None = None,
        user_id: UUID | None = None,
    ) -> Interview:
        """Create and configure a new interview session with generated questions."""
        # 1. Ensure Profile exists if user_id is provided
        if user_id:
            profile = await self.db.get(Profile, user_id)
            if not profile:
                profile = Profile(id=user_id, display_name="Candidate")
                self.db.add(profile)
                await self.db.flush()

        # 2. Fetch role profile if provided
        role_profile: RoleProfile | None = None
        if role_profile_id:
            role_profile = await self.db.get(RoleProfile, role_profile_id)
        elif job_id:
            stmt = select(RoleProfile).where(RoleProfile.job_id == job_id)
            res = await self.db.execute(stmt)
            role_profile = res.scalar_one_or_none()

        # If no role profile provided, create a default generic one
        if not role_profile:
            job = Job(
                raw_text="Generic Software Engineering Practice Interview",
                title=title,
            )
            self.db.add(job)
            await self.db.flush()

            role_profile = RoleProfile(
                job_id=job.id,
                role_title=title,
                seniority="Mid-Level",
                domain="Software Engineering",
                technical_skills=["System Design", "Python", "APIs", "Databases"],
                tools=["Git", "Docker"],
                responsibilities=["Backend Development", "System Reliability"],
                behavioral_competencies=["Problem Solving", "Communication"],
                interview_topics=["Architecture", "Debugging", "Collaboration"],
                preferred_experience=["3+ years engineering"],
            )
            self.db.add(role_profile)
            await self.db.flush()

        # 3. Create Interview entity with user_id
        interview = Interview(
            title=title or role_profile.role_title,
            job_id=role_profile.job_id,
            role_profile_id=role_profile.id,
            user_id=user_id,
            status="created",
            interview_type=interview_type,
            difficulty_level=difficulty_level,
            target_duration_minutes=target_duration_minutes,
            current_question_index=0,
        )
        self.db.add(interview)
        await self.db.flush()

        # 3. Generate Questions
        questions = await self.question_generator.generate_questions(
            interview_id=interview.id,
            role_profile=role_profile,
            interview_type=interview_type,
            difficulty_level=difficulty_level,
            question_count=question_count,
        )
        for q in questions:
            self.db.add(q)

        self.transition_state(interview, "ready")
        await self.db.commit()
        await self.db.refresh(interview)

        logger.info(
            "interview_created",
            interview_id=str(interview.id),
            question_count=len(questions),
            status=interview.status,
        )
        return interview

    async def get_interview_detail(self, interview_id: UUID) -> Interview | None:
        """Fetch full interview entity with eager-loaded relationships."""
        stmt = (
            select(Interview)
            .where(Interview.id == interview_id)
            .options(
                selectinload(Interview.role_profile),
                selectinload(Interview.questions),
                selectinload(Interview.answers).selectinload(Answer.transcript),
                selectinload(Interview.answers).selectinload(Answer.speech_metrics),
                selectinload(Interview.answers).selectinload(Answer.content_metrics),
                selectinload(Interview.answers).selectinload(Answer.question),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def start_interview(self, interview_id: UUID) -> Interview:
        """Start the interview session and activate Question 1."""
        interview = await self.get_interview_detail(interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        if interview.status in ("created", "ready"):
            self.transition_state(interview, "running")
            interview.started_at = datetime.now(UTC)
            interview.current_question_index = 0
            self.transition_state(interview, "question_active")
            await self.db.commit()
            await self.db.refresh(interview)

        return interview

    async def create_answer(self, interview_id: UUID, question_id: UUID) -> Answer:
        """Create a candidate answer record for the active question."""
        interview = await self.get_interview_detail(interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        # Check existing answer for idempotency
        stmt = select(Answer).where(
            Answer.interview_id == interview_id, Answer.question_id == question_id
        )
        res = await self.db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            return existing

        question = await self.db.get(Question, question_id)
        if not question:
            raise AptlyException(
                f"Question '{question_id}' not found.", code="QUESTION_NOT_FOUND"
            )

        now = datetime.now(UTC)
        answer = Answer(
            interview_id=interview_id,
            question_id=question_id,
            sequence_number=question.sequence_number,
            status="created",
            started_at=now,
        )
        self.db.add(answer)

        if interview.status in ("question_active", "running"):
            self.transition_state(interview, "answering")

        await self.db.commit()
        await self.db.refresh(answer)
        return answer

    async def upload_and_process_answer(
        self,
        interview_id: UUID,
        answer_id: UUID,
        audio_data: bytes,
        content_type: str = "audio/webm",
        duration_seconds: float = 0.0,
    ) -> Answer:
        """
        Store audio bytes, mark answer uploaded, and trigger async speech processing.
        """
        answer = await self.db.get(Answer, answer_id)
        if not answer:
            raise AptlyException(
                f"Answer '{answer_id}' not found.", code="ANSWER_NOT_FOUND"
            )

        interview = await self.db.get(Interview, interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        # 1. Upload original audio/video to storage
        owner_id_str = str(interview.user_id) if interview.user_id else None
        sha256_hash = self.media_normalizer.compute_sha256(audio_data)
        upload_req = UploadRequest(
            data=audio_data,
            content_type=content_type,
            data_class="raw_audio",
            owner_id=owner_id_str,
            interview_id=str(interview_id),
            answer_id=str(answer_id),
            extension="webm",
        )
        upload_res = await self.storage_provider.upload(upload_req)

        # 2. Extract & Normalize Audio via FFmpeg to 16kHz Mono WAV
        normalized_wav_bytes = audio_data
        try:
            wav_bytes, media_info = self.media_normalizer.normalize_bytes(audio_data, extension="webm")
            normalized_wav_bytes = wav_bytes

            # Upload normalized WAV artifact to Supabase Storage
            wav_upload_req = UploadRequest(
                data=normalized_wav_bytes,
                content_type="audio/wav",
                data_class="raw_audio",
                owner_id=owner_id_str,
                interview_id=str(interview_id),
                answer_id=str(answer_id),
                extension="wav",
            )
            wav_upload_res = await self.storage_provider.upload(wav_upload_req)
            answer.normalized_storage_key = wav_upload_res.storage_key
            if media_info.get("duration_seconds"):
                duration_seconds = float(media_info["duration_seconds"])
        except Exception as norm_err:
            logger.warning("audio_normalization_skipped_or_failed", error=str(norm_err))

        # 3. Update answer metadata
        answer.audio_storage_key = upload_res.storage_key
        answer.audio_size_bytes = upload_res.size_bytes
        answer.audio_checksum_sha256 = sha256_hash
        answer.duration_seconds = duration_seconds or max(
            3.0, round(len(audio_data) / 16000.0, 1)
        )
        answer.ended_at = datetime.now(UTC)
        answer.status = "uploaded"
        answer.processing_status = "processing"

        if interview.status in ("answering", "question_active"):
            self.transition_state(interview, "answer_submitted")

        await self.db.commit()
        await self.db.refresh(answer)

        logger.info(
            "answer_audio_uploaded",
            interview_id=str(interview_id),
            answer_id=str(answer_id),
            size_bytes=len(audio_data),
            storage_key=answer.audio_storage_key,
            normalized_key=answer.normalized_storage_key,
            sha256=sha256_hash,
        )

        # 4. Trigger async transcription, metrics computation, and adaptive follow-up
        try:
            await self._process_answer_pipeline(answer, normalized_wav_bytes, "audio/wav")
        except Exception as proc_err:
            logger.error(
                "pipeline_processing_failed",
                answer_id=str(answer_id),
                error=str(proc_err),
            )
            answer.status = "transcribed"
            answer.processing_status = "error"
            await self.db.commit()
            await self.db.refresh(answer)

        return answer

    async def _process_answer_pipeline(
        self,
        answer: Answer,
        audio_data: bytes,
        content_type: str,
    ) -> None:
        """
        Non-blocking speech processing pipeline:
        Transcribe normalized audio -> Compute speech metrics -> Content Intelligence -> Adaptive follow-up.
        """
        logger.info("transcription_started", answer_id=str(answer.id))
        answer.status = "processing"
        answer.transcription_status = "in_progress"
        await self.db.commit()

        # Step A: Transcribe via provider (receives 16kHz mono WAV)
        transcription_res = await self.transcription_provider.transcribe(
            TranscriptionRequest(
                audio_bytes=audio_data,
                content_type=content_type,
                language="en",
                metadata={"answer_id": str(answer.id)},
            )
        )

        words_data = [
            {
                "word": w.word,
                "start_seconds": w.start_seconds,
                "end_seconds": w.end_seconds,
                "confidence": w.confidence,
            }
            for w in transcription_res.words
        ]

        transcript = Transcript(
            answer_id=answer.id,
            full_text=transcription_res.text,
            word_count=len(transcription_res.words),
            language=transcription_res.language,
            segments_json=[],
            words_json=words_data,
            model_provider=transcription_res.provider,
            model_version=transcription_res.model_version,
            schema_version="1.0",
        )
        self.db.add(transcript)
        answer.transcription_status = "completed"

        # Step B: Compute deterministic speech metrics & Voice Energy
        metrics_computed = self.speech_metrics_service.compute(
            words=words_data,
            total_audio_duration_seconds=answer.duration_seconds,
        )

        voice_energy_res = self.speech_metrics_service.compute_voice_energy(audio_data)
        voice_energy_dict = {
            "average_energy": voice_energy_res.average_energy,
            "energy_variance": voice_energy_res.energy_variance,
            "opening_energy": voice_energy_res.opening_energy,
            "middle_energy": voice_energy_res.middle_energy,
            "closing_energy": voice_energy_res.closing_energy,
            "timeline": voice_energy_res.timeline,
        }

        speech_metrics = SpeechMetrics(
            answer_id=answer.id,
            schema_version="1.0",
            wpm=metrics_computed.wpm,
            speaking_duration_seconds=metrics_computed.speaking_duration_seconds,
            total_words=metrics_computed.total_words,
            filler_count=metrics_computed.filler_count,
            filler_density=metrics_computed.filler_density,
            filler_words_json=metrics_computed.filler_words,
            pause_count=metrics_computed.pause_count,
            total_pause_seconds=metrics_computed.total_pause_seconds,
            pauses_json=metrics_computed.pauses,
            voice_energy_json=voice_energy_dict,
        )
        self.db.add(speech_metrics)

        # Step C: Phase 2 Content Intelligence Analysis
        content_metrics_record = None
        try:
            question = await self.db.get(Question, answer.question_id)
            interview = await self.db.get(Interview, answer.interview_id)
            role_profile = None
            if interview and interview.role_profile_id:
                role_profile = await self.db.get(RoleProfile, interview.role_profile_id)

            analysis_input = ContentAnalysisInput(
                role_title=role_profile.role_title if role_profile else "Software Engineer",
                seniority=role_profile.seniority if role_profile else "Mid-Level",
                domain=role_profile.domain if role_profile else "Engineering",
                technical_skills=role_profile.technical_skills if role_profile else [],
                question_text=question.question_text if question else "Technical question",
                question_category=question.category if question else "technical",
                expected_topics=question.expected_topics if question else [],
                full_transcript=transcription_res.text,
                words=words_data,
                duration_seconds=answer.duration_seconds,
            )

            content_result = await self.content_analysis_service.analyze_answer(analysis_input)
            content_metrics_record = await self.content_analysis_service.persist_content_metrics(
                db=self.db,
                answer_id=answer.id,
                result=content_result,
                provider=getattr(self.llm_provider, "PROVIDER_NAME", "gemini"),
                model=getattr(self.llm_provider, "MODEL_NAME", "gemini-2.5-flash"),
            )
            logger.info(
                "content_intelligence_completed",
                answer_id=str(answer.id),
                score=content_result.overall_content_score,
            )

            # Step D: Phase 3 Adaptive Follow-Up Question Generation
            if question:
                followup = await self.adaptive_engine.maybe_generate_followup(
                    db=self.db,
                    parent_question=question,
                    candidate_transcript=transcription_res.text,
                    content_metrics=content_metrics_record,
                    role_context=(
                        {"role_title": role_profile.role_title, "domain": role_profile.domain}
                        if role_profile
                        else None
                    ),
                )
                if followup:
                    logger.info(
                        "adaptive_followup_ready_for_turn",
                        parent_q=str(question.id),
                        followup_q=str(followup.id),
                        text=followup.question_text,
                    )
        except Exception as content_err:
            logger.error(
                "content_intelligence_or_adaptive_failed",
                answer_id=str(answer.id),
                error=str(content_err),
            )

        answer.status = "transcribed"
        answer.processing_status = "processed"
        await self.db.commit()
        await self.db.refresh(answer)

        logger.info(
            "speech_processing_completed",
            answer_id=str(answer.id),
            words=transcript.word_count,
            wpm=speech_metrics.wpm,
            fillers=speech_metrics.filler_count,
        )

    async def advance_question(self, interview_id: UUID) -> Interview:
        """Advance the interview to the next question or completion."""
        interview = await self.get_interview_detail(interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        next_idx = interview.current_question_index + 1
        if next_idx < len(interview.questions):
            interview.current_question_index = next_idx
            # Gracefully transition regardless of current state
            # The interview may be in any "live" state when user clicks "next"
            if interview.status not in ("running", "question_active", "next_question"):
                try:
                    self.transition_state(interview, "next_question")
                except InvalidStateTransitionError:
                    pass  # Already in an acceptable state
            interview.status = "question_active"  # Force target state directly
        else:
            # Move to completion — try multi-step or force it
            try:
                if interview.status != "completing":
                    self.transition_state(interview, "completing")
                self.transition_state(interview, "completed")
            except InvalidStateTransitionError:
                interview.status = "completed"  # Force terminal state
            interview.completed_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(interview)
        return interview

    async def finish_interview(self, interview_id: UUID) -> Interview:
        """Mark the interview complete."""
        interview = await self.get_interview_detail(interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        if interview.status != "completed":
            if interview.status in (
                "running",
                "question_active",
                "answering",
                "answer_submitted",
                "processing",
                "next_question",
            ):
                self.transition_state(interview, "completing")
                self.transition_state(interview, "completed")
                interview.completed_at = datetime.now(UTC)
                await self.db.commit()
                await self.db.refresh(interview)

        return interview

    async def compile_review(self, interview_id: UUID) -> dict[str, Any]:
        """Compile a complete post-interview review view."""
        interview = await self.get_interview_detail(interview_id)
        if not interview:
            raise AptlyException(
                f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND"
            )

        total_duration = 0.0
        total_words = 0
        total_fillers = 0
        total_pauses = 0
        wpm_list: list[float] = []
        content_scores_list: list[float] = []
        relevance_scores_list: list[float] = []
        tech_depth_scores_list: list[float] = []
        questions_review: list[dict[str, Any]] = []

        # Map answers by question_id
        answers_by_q = {ans.question_id: ans for ans in interview.answers}

        for q in interview.questions:
            ans = answers_by_q.get(q.id)
            item: dict[str, Any] = {
                "question": {
                    "id": q.id,
                    "interview_id": q.interview_id,
                    "sequence_number": q.sequence_number,
                    "category": q.category,
                    "question_type": q.question_type,
                    "competency": q.competency,
                    "difficulty": q.difficulty,
                    "question_text": q.question_text,
                    "expected_topics": q.expected_topics,
                    "prompt_version": q.prompt_version,
                },
                "answer": None,
                "transcript": None,
                "speech_metrics": None,
                "content_metrics": None,
            }

            if ans:
                total_duration += ans.duration_seconds
                playback_url = None
                if ans.audio_storage_key:
                    try:
                        presigned = await self.storage_provider.generate_presigned_url(
                            ans.audio_storage_key, expires_in_seconds=3600
                        )
                        playback_url = presigned.url
                    except Exception as sign_err:
                        logger.warning("signed_playback_url_failed", key=ans.audio_storage_key, error=str(sign_err))

                item["answer"] = {
                    "id": ans.id,
                    "interview_id": ans.interview_id,
                    "question_id": ans.question_id,
                    "sequence_number": ans.sequence_number,
                    "status": ans.status,
                    "duration_seconds": ans.duration_seconds,
                    "started_at": ans.started_at,
                    "ended_at": ans.ended_at,
                    "audio_storage_key": ans.audio_storage_key,
                    "audio_size_bytes": ans.audio_size_bytes,
                    "playback_url": playback_url,
                    "created_at": ans.created_at,
                }

                if ans.transcript:
                    total_words += ans.transcript.word_count
                    item["transcript"] = {
                        "id": ans.transcript.id,
                        "answer_id": ans.transcript.answer_id,
                        "full_text": ans.transcript.full_text,
                        "word_count": ans.transcript.word_count,
                        "language": ans.transcript.language,
                        "segments": ans.transcript.segments_json,
                        "words": ans.transcript.words_json,
                        "model_provider": ans.transcript.model_provider,
                        "model_version": ans.transcript.model_version,
                        "created_at": ans.transcript.created_at,
                    }

                if ans.speech_metrics:
                    m = ans.speech_metrics
                    total_fillers += m.filler_count
                    total_pauses += m.pause_count
                    if m.wpm > 0:
                        wpm_list.append(m.wpm)

                    item["speech_metrics"] = {
                        "id": m.id,
                        "answer_id": m.answer_id,
                        "wpm": m.wpm,
                        "speaking_duration_seconds": m.speaking_duration_seconds,
                        "total_words": m.total_words,
                        "filler_count": m.filler_count,
                        "filler_density": m.filler_density,
                        "filler_words": [
                            {
                                "word": fw.get("word", ""),
                                "timestamp_seconds": float(
                                    fw.get("timestamp_seconds", 0.0)
                                ),
                                "duration_seconds": float(
                                    fw.get("duration_seconds", 0.2)
                                ),
                            }
                            for fw in m.filler_words_json
                        ],
                        "pause_count": m.pause_count,
                        "total_pause_seconds": m.total_pause_seconds,
                        "pauses": [
                            {
                                "start_seconds": float(p.get("start_seconds", 0.0)),
                                "end_seconds": float(p.get("end_seconds", 0.0)),
                                "duration_seconds": float(
                                    p.get("duration_seconds", 0.0)
                                ),
                            }
                            for p in m.pauses_json
                        ],
                        "voice_energy": getattr(m, "voice_energy_json", None),
                        "created_at": m.created_at,
                    }

                if ans.content_metrics:
                    cm = ans.content_metrics
                    content_scores_list.append(cm.overall_content_score)
                    relevance_scores_list.append(cm.relevance_score)
                    tech_depth_scores_list.append(cm.technical_depth_score)

                    item["content_metrics"] = {
                        "id": cm.id,
                        "answer_id": cm.answer_id,
                        "question_type": cm.question_type,
                        "relevance_score": cm.relevance_score,
                        "technical_depth_score": cm.technical_depth_score,
                        "completeness_score": cm.completeness_score,
                        "structure_score": cm.structure_score,
                        "evidence_score": cm.evidence_score,
                        "overall_content_score": cm.overall_content_score,
                        "strengths": cm.strengths_json,
                        "weaknesses": cm.weaknesses_json,
                        "star_analysis": cm.star_analysis_json,
                        "claims": cm.claims_json,
                        "evidence": cm.evidence_json,
                        "feedback": cm.feedback_json,
                        "practice_drills": cm.practice_drills_json,
                        "reasoning_summary": cm.reasoning_summary,
                        "provider": cm.provider,
                        "model": cm.model,
                        "prompt_version": cm.prompt_version,
                        "created_at": cm.created_at,
                    }

            questions_review.append(item)

        avg_wpm = round(sum(wpm_list) / len(wpm_list), 1) if wpm_list else 0.0
        overall_filler_density = (
            round((total_fillers / total_words) * 100, 2) if total_words > 0 else 0.0
        )
        avg_content = (
            round(sum(content_scores_list) / len(content_scores_list), 1)
            if content_scores_list
            else 0.0
        )
        avg_relevance = (
            round(sum(relevance_scores_list) / len(relevance_scores_list), 1)
            if relevance_scores_list
            else 0.0
        )
        avg_tech_depth = (
            round(sum(tech_depth_scores_list) / len(tech_depth_scores_list), 1)
            if tech_depth_scores_list
            else 0.0
        )

        # Compute Deterministic Delivery Score (v1.0.0)
        # WPM Score (Target: 130-160 WPM)
        wpm_score = 100.0
        if avg_wpm > 160:
            wpm_score = max(40.0, 100.0 - (avg_wpm - 160) * 1.5)
        elif avg_wpm < 130 and avg_wpm > 0:
            wpm_score = max(40.0, 100.0 - (130 - avg_wpm) * 1.2)

        # Filler Score (Target: < 2.0% density)
        filler_score = max(20.0, 100.0 - (overall_filler_density * 12.0))

        # Pause Score
        pause_score = max(30.0, 100.0 - (total_pauses * 6.0))

        overall_delivery_score = round(
            0.4 * wpm_score + 0.4 * filler_score + 0.2 * pause_score, 1
        )

        # Composite Score: 60% Content + 40% Delivery
        overall_composite_score = (
            round(0.6 * avg_content + 0.4 * overall_delivery_score, 1)
            if avg_content > 0
            else overall_delivery_score
        )

        # Top 3 Damaging Habits
        from app.services.content_intelligence.habit_ranker import HabitRankerService
        top_habits = HabitRankerService.rank_top_habits(
            questions_review=questions_review,
            overall_filler_density=overall_filler_density,
            average_wpm=avg_wpm,
            total_fillers=total_fillers,
            total_pauses=total_pauses,
        )

        # Automatically record UserProgress & UserDocument if user_id is present
        if interview.user_id:
            role_name = interview.role_profile.role_title if interview.role_profile else interview.title
            # Check existing progress entry
            prog_stmt = select(UserProgress).where(UserProgress.interview_id == interview.id)
            prog_res = (await self.db.execute(prog_stmt)).scalar_one_or_none()
            if not prog_res:
                prog = UserProgress(
                    user_id=interview.user_id,
                    interview_id=interview.id,
                    scoring_algorithm_version="1.0.0",
                    role_title=role_name,
                    interview_type=interview.interview_type,
                    overall_score=overall_composite_score,
                    content_score=avg_content,
                    delivery_score=overall_delivery_score,
                    relevance_score=avg_relevance,
                    technical_depth_score=avg_tech_depth,
                    wpm=avg_wpm,
                    filler_density=overall_filler_density,
                    total_pauses_count=total_pauses,
                    top_habits_json=top_habits,
                    strengths_json=[h.get("title", "") for h in top_habits if h.get("severity") == "MEDIUM"],
                    weaknesses_json=[h.get("title", "") for h in top_habits if h.get("severity") in ("CRITICAL", "HIGH")],
                )
                self.db.add(prog)

            # Check existing document entry
            doc_stmt = select(UserDocument).where(
                UserDocument.interview_id == interview.id,
                UserDocument.document_type == "INTERVIEW_REPORT",
            )
            doc_res = (await self.db.execute(doc_stmt)).scalar_one_or_none()
            if not doc_res:
                doc = UserDocument(
                    user_id=interview.user_id,
                    interview_id=interview.id,
                    document_type="INTERVIEW_REPORT",
                    title=f"Performance Report: {role_name}",
                    content_markdown=f"# Interview Performance Report: {role_name}\n\n**Overall Score**: {overall_composite_score}%\n**Delivery Score**: {overall_delivery_score}%\n**Content Score**: {avg_content}%\n**Speaking Rate**: {avg_wpm} WPM\n\n### Priority Focus Areas\n" + "\n".join(f"- {h['title']}: {h['impact_explanation']}" for h in top_habits),
                    metadata_json={
                        "overall_score": overall_composite_score,
                        "delivery_score": overall_delivery_score,
                        "content_score": avg_content,
                        "wpm": avg_wpm,
                        "top_habits": top_habits,
                    },
                    scoring_algorithm_version="1.0.0",
                )
                self.db.add(doc)

            try:
                await self.db.commit()
            except Exception as commit_err:
                logger.warning("user_progress_persist_skipped", error=str(commit_err))

        return {
            "interview": {
                "id": interview.id,
                "title": interview.title,
                "status": interview.status,
                "interview_type": interview.interview_type,
                "difficulty_level": interview.difficulty_level,
                "target_duration_minutes": interview.target_duration_minutes,
                "current_question_index": interview.current_question_index,
                "started_at": interview.started_at,
                "completed_at": interview.completed_at,
                "created_at": interview.created_at,
            },
            "role_profile": (
                {
                    "id": interview.role_profile.id,
                    "job_id": interview.role_profile.job_id,
                    "role_title": interview.role_profile.role_title,
                    "seniority": interview.role_profile.seniority,
                    "domain": interview.role_profile.domain,
                    "technical_skills": interview.role_profile.technical_skills,
                    "tools": interview.role_profile.tools,
                    "responsibilities": interview.role_profile.responsibilities,
                    "behavioral_competencies": interview.role_profile.behavioral_competencies,
                    "interview_topics": interview.role_profile.interview_topics,
                    "preferred_experience": interview.role_profile.preferred_experience,
                    "prompt_version": interview.role_profile.prompt_version,
                    "created_at": interview.role_profile.created_at,
                }
                if interview.role_profile
                else None
            ),
            "total_duration_seconds": round(total_duration, 1),
            "total_answers_count": len(interview.answers),
            "average_wpm": avg_wpm,
            "total_fillers_count": total_fillers,
            "overall_filler_density": overall_filler_density,
            "total_pauses_count": total_pauses,
            "average_content_score": avg_content,
            "average_relevance_score": avg_relevance,
            "average_technical_depth_score": avg_tech_depth,
            "overall_delivery_score": overall_delivery_score,
            "overall_composite_score": overall_composite_score,
            "top_habits": top_habits,
            "questions_review": questions_review,
        }

    async def list_user_interviews(
        self,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
    ) -> list[Interview]:
        """List paginated interviews exclusively owned by user_id."""
        stmt = (
            select(Interview)
            .where(Interview.user_id == user_id, Interview.deleted_at.is_(None))
            .order_by(Interview.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if status:
            stmt = stmt.where(Interview.status == status)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def delete_interview(self, interview_id: UUID, user_id: UUID) -> bool:
        """Permanently delete an interview and its storage assets, ensuring caller is the owner."""
        interview = await self.db.get(Interview, interview_id)
        if not interview:
            raise AptlyException(f"Interview '{interview_id}' not found.", code="INTERVIEW_NOT_FOUND")
        if interview.user_id and interview.user_id != user_id:
            raise AptlyException("Access denied to this interview.", code="FORBIDDEN_INTERVIEW_ACCESS")

        # Delete associated media files from storage
        for ans in interview.answers:
            if ans.audio_storage_key:
                try:
                    await self.storage_provider.delete(ans.audio_storage_key)
                except Exception:
                    pass
            if ans.normalized_storage_key:
                try:
                    await self.storage_provider.delete(ans.normalized_storage_key)
                except Exception:
                    pass

        await self.db.delete(interview)
        await self.db.commit()
        return True

    async def delete_user_account(self, user_id: UUID) -> bool:
        """Cascade delete all user data: profile, interviews, documents, progress, and storage assets."""
        # 1. Fetch all user interviews
        stmt = select(Interview).where(Interview.user_id == user_id)
        res = await self.db.execute(stmt)
        interviews = list(res.scalars().all())

        # 2. Delete storage assets
        for itv in interviews:
            for ans in itv.answers:
                if ans.audio_storage_key:
                    try:
                        await self.storage_provider.delete(ans.audio_storage_key)
                    except Exception:
                        pass
                if ans.normalized_storage_key:
                    try:
                        await self.storage_provider.delete(ans.normalized_storage_key)
                    except Exception:
                        pass

        # 3. Delete Profile (cascades interviews, progress, documents, preferences)
        profile = await self.db.get(Profile, user_id)
        if profile:
            await self.db.delete(profile)
            await self.db.commit()
        return True

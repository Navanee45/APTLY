"""
APTLY API — Question Generator Service

Generates role-aware, structured interview questions from a RoleProfile.
Uses LLMProvider with deterministic fallback templates in mock mode.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.logging import get_logger
from app.models.job import RoleProfile
from app.models.question import Question
from app.services.providers.base import LLMProvider, LLMStructuredRequest

logger = get_logger(__name__)

PROMPT_VERSION = "question_generation/v1"


class QuestionGeneratorService:
    """
    Generates dynamic interview questions tailored to a specific RoleProfile.
    """

    def __init__(self, llm_provider: LLMProvider) -> None:
        self.llm_provider = llm_provider

    async def generate_questions(
        self,
        interview_id: UUID,
        role_profile: RoleProfile,
        interview_type: str = "mixed",
        difficulty_level: str = "medium",
        question_count: int = 3,
    ) -> list[Question]:
        """
        Generate structured Question ORM entities for an interview session.
        """
        logger.info(
            "question_generation_started",
            interview_id=str(interview_id),
            role_title=role_profile.role_title,
            count=question_count,
            type=interview_type,
        )

        schema = {
            "questions": [
                {
                    "category": "technical | behavioral | situational",
                    "question_type": "concept | scenario | star | system_design | problem_solving",
                    "competency": "string",
                    "difficulty": "easy | medium | hard",
                    "question_text": "string",
                    "expected_topics": ["string"],
                }
            ]
        }

        system_prompt = (
            "You are a technical interviewer at a top tier technology company. "
            f"Generate {question_count} tailored interview questions for a {role_profile.seniority} {role_profile.role_title}. "
            f"Interview Type: {interview_type}. Difficulty: {difficulty_level}."
        )

        user_prompt = (
            f"Role Profile:\n"
            f"- Title: {role_profile.role_title} ({role_profile.seniority})\n"
            f"- Technical Skills: {', '.join(role_profile.technical_skills)}\n"
            f"- Tools: {', '.join(role_profile.tools)}\n"
            f"- Responsibilities: {', '.join(role_profile.responsibilities[:2])}\n"
            f"- Focus Topics: {', '.join(role_profile.interview_topics[:3])}\n\n"
            f"Generate exactly {question_count} distinct questions."
        )

        raw_result: dict = {}
        try:
            raw_result = await self.llm_provider.generate_structured(
                LLMStructuredRequest(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    output_schema=schema,
                )
            )
        except Exception as llm_err:
            logger.warning(
                "question_generation_llm_failed_using_templates",
                interview_id=str(interview_id),
                error=str(llm_err)[:200],
                provider=getattr(self.llm_provider, "PROVIDER_NAME", "unknown"),
            )
            # Fall through with empty dict → _parse_or_synthesize will use templates

        # Parse or synthesize question definitions
        question_defs = self._parse_or_synthesize(
            raw_result=raw_result,
            role_profile=role_profile,
            interview_type=interview_type,
            difficulty_level=difficulty_level,
            question_count=question_count,
        )

        questions: list[Question] = []
        for idx, q_data in enumerate(question_defs, start=1):
            q = Question(
                interview_id=interview_id,
                sequence_number=idx,
                category=q_data["category"],
                question_type=q_data["question_type"],
                competency=q_data["competency"],
                difficulty=q_data["difficulty"],
                question_text=q_data["question_text"],
                expected_topics=q_data["expected_topics"],
                prompt_version=PROMPT_VERSION,
            )
            questions.append(q)

        logger.info(
            "question_generation_completed",
            interview_id=str(interview_id),
            generated_count=len(questions),
        )

        return questions

    def _parse_or_synthesize(
        self,
        raw_result: dict[str, Any],
        role_profile: RoleProfile,
        interview_type: str,
        difficulty_level: str,
        question_count: int,
    ) -> list[dict[str, Any]]:
        """
        Parses LLM output or generates high-quality deterministic mock questions.
        """
        if (
            "questions" in raw_result
            and isinstance(raw_result["questions"], list)
            and len(raw_result["questions"]) > 0
        ):
            parsed: list[dict[str, Any]] = []
            for item in raw_result["questions"][:question_count]:
                if isinstance(item, dict) and "question_text" in item:
                    parsed.append(
                        {
                            "category": str(
                                item.get("category") or "technical"
                            ).lower(),
                            "question_type": str(
                                item.get("question_type") or "concept"
                            ).lower(),
                            "competency": str(
                                item.get("competency") or "Core Engineering"
                            ),
                            "difficulty": str(
                                item.get("difficulty") or difficulty_level
                            ).lower(),
                            "question_text": str(item.get("question_text")).strip(),
                            "expected_topics": [
                                str(t).strip()
                                for t in item.get("expected_topics", [])
                                if t
                            ],
                        }
                    )
            if len(parsed) >= question_count:
                return parsed

        # Deterministic role-aware question templates
        primary_skill = (
            role_profile.technical_skills[0]
            if role_profile.technical_skills
            else "Python"
        )
        secondary_skill = (
            role_profile.technical_skills[1]
            if len(role_profile.technical_skills) > 1
            else "PostgreSQL"
        )

        templates: list[dict[str, Any]] = [
            {
                "category": "technical",
                "question_type": "scenario",
                "competency": primary_skill,
                "difficulty": difficulty_level,
                "question_text": (
                    f"Can you walk me through how you design and structure a high-performance backend service in {primary_skill}? "
                    f"Specifically, how do you handle database concurrency, caching, and connection lifecycle under heavy load?"
                ),
                "expected_topics": [
                    "Connection Pooling & Async IO",
                    "Database Indexing & Query Optimization",
                    "Caching layers (Redis) and cache invalidation",
                    "Error isolation and circuit breaking",
                ],
            },
            {
                "category": "behavioral",
                "question_type": "star",
                "competency": "Problem Solving & Ownership",
                "difficulty": difficulty_level,
                "question_text": (
                    "Tell me about a time when a critical bug or performance degradation occurred in production. "
                    "How did you diagnose the root cause, what trade-offs did you evaluate, and how did you verify the fix?"
                ),
                "expected_topics": [
                    "Structured Incident Triaging (STAR Situation & Task)",
                    "Root cause isolation via metrics/logs (Action)",
                    "Verification and automated regression tests (Result)",
                    "Post-mortem documentation and long-term prevention",
                ],
            },
            {
                "category": "technical",
                "question_type": "system_design",
                "competency": secondary_skill,
                "difficulty": difficulty_level,
                "question_text": (
                    f"When designing a schema with {secondary_skill}, how do you approach data integrity, indexing strategies, "
                    f"and schema migrations without causing downtime on live tables?"
                ),
                "expected_topics": [
                    "Zero-downtime migration patterns",
                    "Locking mechanisms and transaction isolation levels",
                    "B-tree and composite indexing trade-offs",
                    "Foreign key cascading and soft deletion lifecycle",
                ],
            },
            {
                "category": "situational",
                "question_type": "problem_solving",
                "competency": "Technical Leadership & Communication",
                "difficulty": difficulty_level,
                "question_text": (
                    "Suppose your team is split on whether to refactor a legacy monolithic module or rebuild it from scratch as an async microservice. "
                    "How would you facilitate this architectural decision and measure success?"
                ),
                "expected_topics": [
                    "Objective evaluation criteria (latency, complexity, maintenance cost)",
                    "Incremental strangler fig refactoring strategy",
                    "Measuring developer velocity and blast radius",
                    "Stakeholder communication and alignment",
                ],
            },
            {
                "category": "behavioral",
                "question_type": "star",
                "competency": "Collaboration & Mentorship",
                "difficulty": difficulty_level,
                "question_text": (
                    "Describe a situation where you had a strong technical disagreement with a peer or team lead during a pull request review. "
                    "How did you resolve the conflict constructively?"
                ),
                "expected_topics": [
                    "Data-driven argumentation (benchmarks, trade-off analysis)",
                    "Empathy and maintaining code review quality standards",
                    "Pragmatic compromise and team velocity alignment",
                ],
            },
        ]

        # Filter by interview_type if specific
        if interview_type == "technical":
            filtered = [t for t in templates if t["category"] == "technical"]
        elif interview_type == "behavioral":
            filtered = [
                t for t in templates if t["category"] in ("behavioral", "situational")
            ]
        else:
            filtered = templates

        return filtered[:question_count]

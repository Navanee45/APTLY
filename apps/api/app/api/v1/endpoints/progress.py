"""
APTLY API — User Progress & Personal Coaching Endpoints

Provides version-stable progress trajectories, weakness tracking,
and personalized coaching plan generation.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.logging import get_logger
from app.dependencies import get_db, get_llm
from app.models.progress import UserProgress
from app.models.user_document import UserDocument
from app.services.providers.base import LLMProvider, LLMStructuredRequest

logger = get_logger(__name__)

router = APIRouter(prefix="/progress", tags=["User Progress & Coaching"])


@router.get(
    "",
    summary="Get user progress trajectory",
    description="Returns version-stable historical progress for the authenticated user.",
)
async def get_user_progress(
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    version: str = "1.0.0",
    role: str | None = None,
) -> dict[str, Any]:
    stmt = (
        select(UserProgress)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.scoring_algorithm_version == version,
        )
        .order_by(UserProgress.created_at.asc())
    )
    if role:
        stmt = stmt.where(UserProgress.role_title.ilike(f"%{role}%"))

    res = await db.execute(stmt)
    records = list(res.scalars().all())

    trajectory = [
        {
            "id": str(r.id),
            "interview_id": str(r.interview_id),
            "created_at": r.created_at.isoformat(),
            "role_title": r.role_title,
            "overall_score": r.overall_score,
            "content_score": r.content_score,
            "delivery_score": r.delivery_score,
            "relevance_score": r.relevance_score,
            "technical_depth_score": r.technical_depth_score,
            "wpm": r.wpm,
            "filler_density": r.filler_density,
            "total_pauses_count": r.total_pauses_count,
            "top_habits": r.top_habits_json,
        }
        for r in records
    ]

    return {
        "user_id": str(user.id),
        "scoring_algorithm_version": version,
        "total_sessions": len(trajectory),
        "trajectory": trajectory,
        "is_empty": len(trajectory) == 0,
    }


@router.get(
    "/summary",
    summary="Get user progress summary",
    description="Aggregates latest vs best scores, persistent weaknesses, and top improvements.",
)
async def get_progress_summary(
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    version: str = "1.0.0",
) -> dict[str, Any]:
    stmt = (
        select(UserProgress)
        .where(
            UserProgress.user_id == user.id,
            UserProgress.scoring_algorithm_version == version,
        )
        .order_by(UserProgress.created_at.asc())
    )
    res = await db.execute(stmt)
    records = list(res.scalars().all())

    if not records:
        return {
            "user_id": str(user.id),
            "scoring_algorithm_version": version,
            "is_empty": True,
            "total_interviews": 0,
            "latest_score": 0.0,
            "best_score": 0.0,
            "average_score": 0.0,
            "average_wpm": 0.0,
            "average_filler_density": 0.0,
            "persistent_weaknesses": [],
            "top_improvements": [],
        }

    scores = [r.overall_score for r in records]
    wpms = [r.wpm for r in records if r.wpm > 0]
    fillers = [r.filler_density for r in records]

    latest = records[-1]
    best_score = max(scores)
    avg_score = round(sum(scores) / len(scores), 1)
    avg_wpm = round(sum(wpms) / len(wpms), 1) if wpms else 0.0
    avg_fillers = round(sum(fillers) / len(fillers), 2)

    # Aggregate habits across user's history
    habit_counts: dict[str, int] = {}
    for r in records:
        for h in r.top_habits_json:
            title = h.get("title", "")
            if title:
                habit_counts[title] = habit_counts.get(title, 0) + 1

    persistent_weaknesses = sorted(
        [{"title": k, "occurrences": v} for k, v in habit_counts.items()],
        key=lambda x: x["occurrences"],
        reverse=True,
    )[:3]

    # Calculate improvements if >= 2 sessions
    top_improvements = []
    if len(records) >= 2:
        first = records[0]
        score_diff = round(latest.overall_score - first.overall_score, 1)
        if score_diff > 0:
            top_improvements.append({
                "metric": "Overall Score",
                "improvement": f"+{score_diff}%",
                "details": f"Improved from {first.overall_score}% to {latest.overall_score}%",
            })
        if first.filler_density > latest.filler_density:
            filler_diff = round(first.filler_density - latest.filler_density, 2)
            top_improvements.append({
                "metric": "Filler Reduction",
                "improvement": f"-{filler_diff}% density",
                "details": f"Decreased from {first.filler_density}% to {latest.filler_density}%",
            })

    return {
        "user_id": str(user.id),
        "scoring_algorithm_version": version,
        "is_empty": False,
        "total_interviews": len(records),
        "latest_score": latest.overall_score,
        "latest_role": latest.role_title,
        "best_score": best_score,
        "average_score": avg_score,
        "average_wpm": avg_wpm,
        "average_filler_density": avg_fillers,
        "persistent_weaknesses": persistent_weaknesses,
        "top_improvements": top_improvements,
    }


@router.post(
    "/coaching-plan",
    summary="Generate personalized coaching plan",
    description="Uses Gemini to generate a personalized practice plan based exclusively on current user's history.",
)
async def generate_coaching_plan(
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    llm: Annotated[LLMProvider, Depends(get_llm)],
) -> dict[str, Any]:
    # 1. Fetch user's recent progress records
    stmt = (
        select(UserProgress)
        .where(UserProgress.user_id == user.id)
        .order_by(UserProgress.created_at.desc())
        .limit(5)
    )
    res = await db.execute(stmt)
    records = list(res.scalars().all())

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_INTERVIEW_HISTORY", "message": "Complete at least one interview before generating a coaching plan."},
        )

    # 2. Build personalized user context (strictly user-isolated)
    weaknesses = []
    for r in records:
        weaknesses.extend(r.weaknesses_json)

    prompt = f"""You are APTLY's Senior AI Interview Coach.
Generate a structured 4-day personalized interview practice plan for this candidate based exclusively on their measured performance:

Candidate Profile:
- Recent Roles Practiced: {', '.join({r.role_title for r in records})}
- Latest Overall Score: {records[0].overall_score}%
- Average Speech Pace: {records[0].wpm} WPM
- Filler Density: {records[0].filler_density}%
- Measured Recurring Weaknesses: {', '.join(set(weaknesses[:5])) or 'Technical trade-offs and concise executive framing'}

Generate a structured JSON practice plan with:
- summary: string
- priority_focus_areas: list[string]
- schedule: list of 4 days, each with day (e.g. "Day 1"), focus, drill_title, duration_minutes, instructions, and target_criteria
"""

    schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "priority_focus_areas": {"type": "array", "items": {"type": "string"}},
            "schedule": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "day": {"type": "string"},
                        "focus": {"type": "string"},
                        "drill_title": {"type": "string"},
                        "duration_minutes": {"type": "integer"},
                        "instructions": {"type": "string"},
                        "target_criteria": {"type": "string"},
                    },
                    "required": ["day", "focus", "drill_title", "duration_minutes", "instructions", "target_criteria"],
                },
            },
        },
        "required": ["summary", "priority_focus_areas", "schedule"],
    }

    try:
        plan_dict = await llm.generate_structured(
            LLMStructuredRequest(
                prompt=prompt,
                output_schema=schema,
                temperature=0.2,
            )
        )
    except Exception as err:
        logger.warning("coaching_plan_fallback", error=str(err))
        plan_dict = {
            "summary": "Targeted 4-day acceleration plan focusing on filler reduction and STAR result quantification.",
            "priority_focus_areas": ["Filler Word Elimination", "STAR Result Closing", "System Trade-offs"],
            "schedule": [
                {
                    "day": "Day 1",
                    "focus": "Delivery & Pacing",
                    "drill_title": "60-Second Silent Breath Substitution",
                    "duration_minutes": 15,
                    "instructions": "Practice answering technical questions while substituting pauses for verbal fillers.",
                    "target_criteria": "< 2 fillers per minute",
                },
                {
                    "day": "Day 2",
                    "focus": "Behavioral Ownership",
                    "drill_title": "Quantified Result-First Framing",
                    "duration_minutes": 20,
                    "instructions": "State measurable business or technical outcomes at the start and end of behavioral stories.",
                    "target_criteria": "100% of answers state 1 clear metric",
                },
                {
                    "day": "Day 3",
                    "focus": "Technical Depth",
                    "drill_title": "Trade-off & Failure Mode Breakdown",
                    "duration_minutes": 20,
                    "instructions": "For any technical architecture, explicitly analyze 2 alternative options and 1 failure mode.",
                    "target_criteria": "Include latency, cost, and complexity trade-offs",
                },
                {
                    "day": "Day 4",
                    "focus": "Simulated Session",
                    "drill_title": "Full 10-Minute Mock Interview",
                    "duration_minutes": 25,
                    "instructions": "Execute a full practice interview in APTLY targeting >80% composite score.",
                    "target_criteria": "Achieve overall score >= 80%",
                },
            ],
        }

    # 3. Save as a UserDocument
    markdown_content = f"# Personalized Practice Plan\n\n{plan_dict.get('summary', '')}\n\n"
    for item in plan_dict.get("schedule", []):
        markdown_content += f"### {item['day']}: {item['focus']}\n**Drill**: {item['drill_title']} ({item['duration_minutes']} mins)\n\n{item['instructions']}\n\n*Target Goal*: {item['target_criteria']}\n\n"

    doc = UserDocument(
        user_id=user.id,
        document_type="PRACTICE_PLAN",
        title="Personalized 4-Day Practice Plan",
        content_markdown=markdown_content,
        metadata_json=plan_dict,
        scoring_algorithm_version="1.0.0",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "document_id": str(doc.id),
        "user_id": str(user.id),
        "title": doc.title,
        "plan": plan_dict,
        "created_at": doc.created_at.isoformat(),
    }

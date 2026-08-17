"""
APTLY API — Habit Ranker Unit Tests
"""

from __future__ import annotations

from app.services.content_intelligence.habit_ranker import HabitRankerService


def test_habit_ranker_excessive_fillers() -> None:
    questions_review = [
        {
            "speech_metrics": {
                "filler_count": 8,
                "filler_density": 6.5,
                "pauses": [],
            }
        }
    ]

    habits = HabitRankerService.rank_top_habits(
        questions_review=questions_review,
        overall_filler_density=6.5,
        average_wpm=140.0,
        total_fillers=8,
        total_pauses=0,
    )

    assert len(habits) <= 3
    assert habits[0]["habit_type"] == "EXCESSIVE_FILLERS"
    assert habits[0]["rank"] == 1
    assert habits[0]["severity"] == "CRITICAL"
    assert "drill" in habits[0]["recommended_drill"]["title"].lower() or "substitution" in habits[0]["recommended_drill"]["title"].lower()


def test_habit_ranker_missing_star_results() -> None:
    questions_review = [
        {
            "content_metrics": {
                "star_analysis": {
                    "situation": {"present": True, "quality": 80},
                    "task": {"present": True, "quality": 80},
                    "action": {"present": True, "quality": 80},
                    "result": {"present": False, "quality": 0},
                }
            }
        }
    ]

    habits = HabitRankerService.rank_top_habits(
        questions_review=questions_review,
        overall_filler_density=1.0,
        average_wpm=140.0,
        total_fillers=1,
        total_pauses=0,
    )

    assert any(h["habit_type"] == "MISSING_STAR_RESULT" for h in habits)

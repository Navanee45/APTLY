"""
APTLY API — Deterministic Top 3 Damaging Habits Ranking Service

Ranks interview weaknesses deterministically by:
1. Frequency of occurrence
2. Severity / Impact on interviewer impression
3. Measurement confidence

Produces evidence-anchored practice drills for each top habit.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TopHabitItem:
    rank: int
    habit_type: str
    title: str
    severity: str  # "CRITICAL" | "HIGH" | "MEDIUM"
    metric_value: str
    evidence_summary: str
    impact_explanation: str
    recommended_drill: dict[str, Any]


class HabitRankerService:
    """
    Ranks session-level delivery and content habits to identify the top 3 most damaging patterns.
    """

    @staticmethod
    def rank_top_habits(
        questions_review: list[dict[str, Any]],
        overall_filler_density: float,
        average_wpm: float,
        total_fillers: int,
        total_pauses: int,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []

        # 1. Evaluate Fillers
        if overall_filler_density > 3.0 or total_fillers >= 6:
            severity = "CRITICAL" if overall_filler_density > 5.0 else "HIGH"
            score_weight = total_fillers * 2.5 + overall_filler_density * 5
            candidates.append({
                "weight": score_weight,
                "habit_type": "EXCESSIVE_FILLERS",
                "title": "Frequent Filler Word Usage",
                "severity": severity,
                "metric_value": f"{total_fillers} fillers ({overall_filler_density}% density)",
                "evidence_summary": f"Detected {total_fillers} filler occurrences across {len(questions_review)} answers.",
                "impact_explanation": "Frequent verbal fillers dilute technical authority and signal hesitation under pressure.",
                "recommended_drill": {
                    "title": "60-Second Silent Pause Substitution",
                    "duration_seconds": 60,
                    "instructions": "Answer a technical prompt. Whenever you feel an 'um' or 'like' forming, close your lips and take a 1-second silent breath before continuing.",
                    "success_criteria": "< 2 fillers per minute",
                },
            })

        # 2. Evaluate Long Dead-Air Pauses
        long_pauses = 0
        for qr in questions_review:
            sm = qr.get("speech_metrics")
            if sm and sm.get("pauses"):
                long_pauses += len(sm["pauses"])

        if long_pauses >= 3 or total_pauses >= 4:
            score_weight = long_pauses * 6.0
            candidates.append({
                "weight": score_weight,
                "habit_type": "LONG_DEAD_AIR",
                "title": "Extended Dead-Air Hesitations",
                "severity": "HIGH",
                "metric_value": f"{long_pauses} pauses > 2.0s",
                "evidence_summary": f"Observed {long_pauses} moments of silence exceeding 2 seconds during active responses.",
                "impact_explanation": "Extended unannounced silences make interviewers question whether the candidate understands the question or lost their train of thought.",
                "recommended_drill": {
                    "title": "Verbal Blueprinting & Bridging",
                    "duration_seconds": 90,
                    "instructions": "When thinking, verbally outline your approach: 'I'll break this down into three parts: first the schema, then the cache, then consistency.'",
                    "success_criteria": "No silence exceeding 1.5 seconds",
                },
            })

        # 3. Evaluate STAR Result Missing (Behavioral questions)
        missing_results = 0
        behavioral_count = 0
        for qr in questions_review:
            cm = qr.get("content_metrics")
            if cm and cm.get("star_analysis"):
                behavioral_count += 1
                res = cm["star_analysis"].get("result", {})
                if not res.get("present") or res.get("quality", 0) < 50:
                    missing_results += 1

        if behavioral_count > 0 and missing_results > 0:
            score_weight = (missing_results / behavioral_count) * 25.0
            candidates.append({
                "weight": score_weight,
                "habit_type": "MISSING_STAR_RESULT",
                "title": "Incomplete STAR Structure (Missing Quantified Result)",
                "severity": "CRITICAL" if missing_results == behavioral_count else "HIGH",
                "metric_value": f"{missing_results}/{behavioral_count} behavioral answers lacking Result",
                "evidence_summary": f"{missing_results} behavioral response(s) detailed Actions but did not close with quantified outcomes or retrospective lessons.",
                "impact_explanation": "Hiring managers look for ROI and business outcomes. Without a Result, a story feels unfinished.",
                "recommended_drill": {
                    "title": "Result-First Retrospective Drill",
                    "duration_seconds": 90,
                    "instructions": "Practice answering by stating the outcome first: 'In this project, we reduced p99 latency by 45%. Here is how we got there.'",
                    "success_criteria": "Explicitly state 1 metric or qualitative business impact at the end",
                },
            })

        # 4. Evaluate Pacing / Rushed WPM
        if average_wpm > 175:
            candidates.append({
                "weight": (average_wpm - 175) * 1.5,
                "habit_type": "RUSHED_PACING",
                "title": "Rapid / Rushed Speech Pacing",
                "severity": "MEDIUM",
                "metric_value": f"{average_wpm} WPM (ideal: 130-160 WPM)",
                "evidence_summary": f"Average speech rate reached {average_wpm} words per minute.",
                "impact_explanation": "Speaking too fast can cause listeners to miss key technical nuances and suggests anxiety.",
                "recommended_drill": {
                    "title": "Punctuation Pacing Practice",
                    "duration_seconds": 60,
                    "instructions": "Consciously pause for 0.5s at every comma and 1s at every period.",
                    "success_criteria": "WPM measured between 130 and 155 WPM",
                },
            })
        elif average_wpm > 0 and average_wpm < 110:
            candidates.append({
                "weight": (110 - average_wpm) * 1.5,
                "habit_type": "SLOW_PACING",
                "title": "Slow / Monotone Delivery Rate",
                "severity": "MEDIUM",
                "metric_value": f"{average_wpm} WPM",
                "evidence_summary": f"Average speech pacing was measured at {average_wpm} WPM.",
                "impact_explanation": "Very slow pacing can cause interviewers to lose engagement during timed technical sessions.",
                "recommended_drill": {
                    "title": "High-Energy Summary Sprint",
                    "duration_seconds": 45,
                    "instructions": "Summarize an architecture in 45 seconds with concise, punchy sentences.",
                    "success_criteria": "Target 135-150 WPM",
                },
            })

        # 5. Evaluate Unsupported Claims
        unsupported_claims_count = 0
        for qr in questions_review:
            cm = qr.get("content_metrics")
            if cm and cm.get("claims"):
                unsupported_claims_count += sum(
                    1 for c in cm["claims"] if c.get("support_status") == "UNSUPPORTED"
                )

        if unsupported_claims_count >= 2:
            candidates.append({
                "weight": unsupported_claims_count * 4.0,
                "habit_type": "UNSUPPORTED_CLAIMS",
                "title": "Unanchored Performance Claims",
                "severity": "MEDIUM",
                "metric_value": f"{unsupported_claims_count} unverified claims",
                "evidence_summary": f"Found {unsupported_claims_count} assertions lacking specific architectural trade-offs or benchmark evidence.",
                "impact_explanation": "Senior interviewers probe broad claims to test depth; unsupported claims invite skepticism.",
                "recommended_drill": {
                    "title": "Claim + Mechanism + Metric Formula",
                    "duration_seconds": 60,
                    "instructions": "Every claim must follow: 'We improved X (Claim) by implementing Y (Mechanism), achieving Z (Metric)'.",
                    "success_criteria": "100% of claims backed by mechanism or metric",
                },
            })

        # Fallback default habit if performance was clean
        if not candidates:
            candidates.append({
                "weight": 1.0,
                "habit_type": "STRUCTURE_POLISH",
                "title": "Framework Precision & Executive Summary",
                "severity": "MEDIUM",
                "metric_value": "Optimal Delivery",
                "evidence_summary": "Delivery and content were consistent across all questions.",
                "impact_explanation": "To reach the top 5% of candidate scores, start every complex technical response with a 1-sentence executive summary.",
                "recommended_drill": {
                    "title": "Top-Line Executive Framing",
                    "duration_seconds": 60,
                    "instructions": "Start your next answer with: 'The short answer is X, and the two main trade-offs are Y and Z.'",
                    "success_criteria": "Executive summary delivered within the first 10 seconds",
                },
            })

        # Sort by deterministic weight descending and take Top 3
        sorted_habits = sorted(candidates, key=lambda x: x["weight"], reverse=True)[:3]

        # Assign ranks
        for idx, h in enumerate(sorted_habits):
            h["rank"] = idx + 1
            del h["weight"]

        return sorted_habits

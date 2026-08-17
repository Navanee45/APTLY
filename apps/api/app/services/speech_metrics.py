"""
APTLY API — Deterministic Speech Metrics Service

Calculates speech rate (WPM), filler word counts/density/timestamps, and long pauses
directly from timestamped word segments without LLM heuristics.

Principles:
1. Token-boundary matching against a standard filler dictionary.
2. WPM calculation: WPM = (Total Spoken Words) / (Speaking Duration in Minutes).
   Speaking duration uses actual word activity (ignoring initial/trailing dead air).
3. Long pause detection: Gaps between adjacent words exceeding a configurable threshold (default: 2.0s).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# Standard filler words dictionary (single words and common multi-word phrases)
DEFAULT_FILLER_WORDS = {
    "um",
    "uh",
    "umm",
    "uhh",
    "er",
    "ah",
    "like",
    "basically",
    "actually",
    "literally",
    "honestly",
    "seriously",
    "right",
}

DEFAULT_MULTIWORD_FILLERS = [
    "you know",
    "i mean",
    "sort of",
    "kind of",
    "at the end of the day",
]

DEFAULT_PAUSE_THRESHOLD_SECONDS = 2.0


@dataclass
class VoiceEnergyPoint:
    timestamp_seconds: float
    energy: float  # 0.0 to 100.0


@dataclass
class VoiceEnergyAnalysis:
    average_energy: float
    energy_variance: float
    opening_energy: float
    middle_energy: float
    closing_energy: float
    timeline: list[dict[str, float]]


@dataclass
class ComputedSpeechMetrics:
    """Result of deterministic speech analysis."""

    wpm: float
    speaking_duration_seconds: float
    total_words: int
    filler_count: int
    filler_density: float
    filler_words: list[dict[str, Any]]
    pause_count: int
    total_pause_seconds: float
    pauses: list[dict[str, Any]]
    voice_energy: VoiceEnergyAnalysis | None = None


class SpeechMetricsService:
    """
    Computes deterministic speech metrics from timestamped word lists.
    """

    def __init__(
        self,
        filler_words: set[str] | None = None,
        multiword_fillers: list[str] | None = None,
        pause_threshold_seconds: float = DEFAULT_PAUSE_THRESHOLD_SECONDS,
    ) -> None:
        self.filler_words = {w.lower() for w in (filler_words or DEFAULT_FILLER_WORDS)}
        self.multiword_fillers = [
            p.lower() for p in (multiword_fillers or DEFAULT_MULTIWORD_FILLERS)
        ]
        self.pause_threshold_seconds = pause_threshold_seconds

    def compute(
        self,
        words: list[dict[str, Any]],
        total_audio_duration_seconds: float,
    ) -> ComputedSpeechMetrics:
        """
        Analyze a list of timestamped words.

        Each word item must have:
        - "word" / "text": str
        - "start" / "start_seconds": float
        - "end" / "end_seconds": float
        """
        if not words:
            return ComputedSpeechMetrics(
                wpm=0.0,
                speaking_duration_seconds=total_audio_duration_seconds,
                total_words=0,
                filler_count=0,
                filler_density=0.0,
                filler_words=[],
                pause_count=0,
                total_pause_seconds=0.0,
                pauses=[],
            )

        # 1. Normalize word list
        normalized_words: list[dict[str, Any]] = []
        for w in words:
            raw_text = str(w.get("word") or w.get("text") or "").strip()
            clean_text = re.sub(r"[^\w\s']", "", raw_text).lower()
            start = float(w.get("start") or w.get("start_seconds") or 0.0)
            end = float(w.get("end") or w.get("end_seconds") or start + 0.2)
            if clean_text:
                normalized_words.append(
                    {
                        "raw": raw_text,
                        "clean": clean_text,
                        "start": start,
                        "end": end,
                        "duration": max(0.05, round(end - start, 3)),
                    }
                )

        total_words = len(normalized_words)
        if total_words == 0:
            return ComputedSpeechMetrics(
                wpm=0.0,
                speaking_duration_seconds=total_audio_duration_seconds,
                total_words=0,
                filler_count=0,
                filler_density=0.0,
                filler_words=[],
                pause_count=0,
                total_pause_seconds=0.0,
                pauses=[],
            )

        # 2. Speaking Duration & WPM
        first_word_start = normalized_words[0]["start"]
        last_word_end = normalized_words[-1]["end"]
        speaking_duration_seconds = max(1.0, round(last_word_end - first_word_start, 2))
        speaking_minutes = speaking_duration_seconds / 60.0
        wpm = round(total_words / speaking_minutes, 1)

        # 3. Filler Word Detection
        detected_fillers: list[dict[str, Any]] = []

        # Single word fillers
        for item in normalized_words:
            if item["clean"] in self.filler_words:
                detected_fillers.append(
                    {
                        "word": item["raw"],
                        "timestamp_seconds": round(item["start"], 2),
                        "duration_seconds": item["duration"],
                    }
                )

        # Multi-word phrase fillers (e.g. "you know")
        for phrase in self.multiword_fillers:
            phrase_len = len(phrase.split())
            for i in range(len(normalized_words) - phrase_len + 1):
                window = " ".join(
                    normalized_words[i + k]["clean"] for k in range(phrase_len)
                )
                if window == phrase:
                    start_ts = normalized_words[i]["start"]
                    end_ts = normalized_words[i + phrase_len - 1]["end"]
                    detected_fillers.append(
                        {
                            "word": phrase,
                            "timestamp_seconds": round(start_ts, 2),
                            "duration_seconds": round(end_ts - start_ts, 2),
                        }
                    )

        # Deduplicate and sort fillers by timestamp
        seen_timestamps: set[tuple[str, float]] = set()
        unique_fillers: list[dict[str, Any]] = []
        for f in sorted(detected_fillers, key=lambda x: x["timestamp_seconds"]):
            key = (f["word"].lower(), f["timestamp_seconds"])
            if key not in seen_timestamps:
                seen_timestamps.add(key)
                unique_fillers.append(f)

        filler_count = len(unique_fillers)
        filler_density = (
            round((filler_count / total_words) * 100, 2) if total_words > 0 else 0.0
        )

        # 4. Long Pause Detection
        detected_pauses: list[dict[str, Any]] = []
        total_pause_seconds = 0.0

        for i in range(len(normalized_words) - 1):
            curr_end = normalized_words[i]["end"]
            next_start = normalized_words[i + 1]["start"]
            gap = next_start - curr_end
            if gap >= self.pause_threshold_seconds:
                pause_duration = round(gap, 2)
                detected_pauses.append(
                    {
                        "start_seconds": round(curr_end, 2),
                        "end_seconds": round(next_start, 2),
                        "duration_seconds": pause_duration,
                    }
                )
                total_pause_seconds += pause_duration

        logger.debug(
            "speech_metrics_calculated",
            total_words=total_words,
            wpm=wpm,
            filler_count=filler_count,
            filler_density=filler_density,
            pause_count=len(detected_pauses),
        )

        return ComputedSpeechMetrics(
            wpm=wpm,
            speaking_duration_seconds=speaking_duration_seconds,
            total_words=total_words,
            filler_count=filler_count,
            filler_density=filler_density,
            filler_words=unique_fillers,
            pause_count=len(detected_pauses),
            total_pause_seconds=round(total_pause_seconds, 2),
            pauses=detected_pauses,
        )

    def compute_voice_energy(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
        frame_duration_ms: int = 500,
    ) -> VoiceEnergyAnalysis:
        """
        Calculate frame-level RMS voice energy from 16-bit PCM WAV audio bytes.
        """
        import math
        import struct

        # Extract PCM samples (skip 44-byte WAV header if present)
        pcm_data = audio_bytes[44:] if audio_bytes.startswith(b"RIFF") else audio_bytes
        sample_count = len(pcm_data) // 2

        if sample_count == 0:
            return VoiceEnergyAnalysis(
                average_energy=0.0,
                energy_variance=0.0,
                opening_energy=0.0,
                middle_energy=0.0,
                closing_energy=0.0,
                timeline=[],
            )

        # Unpack 16-bit signed little-endian integers
        try:
            samples = struct.unpack(f"<{sample_count}h", pcm_data[: sample_count * 2])
        except Exception:
            return VoiceEnergyAnalysis(
                average_energy=0.0,
                energy_variance=0.0,
                opening_energy=0.0,
                middle_energy=0.0,
                closing_energy=0.0,
                timeline=[],
            )

        samples_per_frame = int(sample_rate * (frame_duration_ms / 1000.0))
        if samples_per_frame == 0:
            samples_per_frame = 8000

        timeline: list[dict[str, float]] = []
        raw_energies: list[float] = []

        for i in range(0, len(samples), samples_per_frame):
            frame = samples[i : i + samples_per_frame]
            if not frame:
                continue

            sum_sq = sum(s * s for s in frame)
            rms = math.sqrt(sum_sq / len(frame))
            # Normalize 16-bit integer (max ~32768) to 0.0 - 100.0 scale
            normalized_energy = round(min(100.0, (rms / 32768.0) * 100.0 * 3.5), 1)
            ts = round(i / sample_rate, 2)
            timeline.append({"timestamp_seconds": ts, "energy": normalized_energy})
            raw_energies.append(normalized_energy)

        if not raw_energies:
            return VoiceEnergyAnalysis(
                average_energy=0.0,
                energy_variance=0.0,
                opening_energy=0.0,
                middle_energy=0.0,
                closing_energy=0.0,
                timeline=[],
            )

        avg_energy = round(sum(raw_energies) / len(raw_energies), 1)
        variance = (
            round(sum((e - avg_energy) ** 2 for e in raw_energies) / len(raw_energies), 1)
            if len(raw_energies) > 1
            else 0.0
        )

        n = len(raw_energies)
        opening_split = max(1, int(n * 0.2))
        closing_split = max(1, int(n * 0.8))

        opening_energy = round(sum(raw_energies[:opening_split]) / opening_split, 1)
        closing_count = n - closing_split
        closing_energy = (
            round(sum(raw_energies[closing_split:]) / closing_count, 1)
            if closing_count > 0
            else avg_energy
        )
        middle_count = closing_split - opening_split
        middle_energy = (
            round(sum(raw_energies[opening_split:closing_split]) / middle_count, 1)
            if middle_count > 0
            else avg_energy
        )

        return VoiceEnergyAnalysis(
            average_energy=avg_energy,
            energy_variance=variance,
            opening_energy=opening_energy,
            middle_energy=middle_energy,
            closing_energy=closing_energy,
            timeline=timeline,
        )

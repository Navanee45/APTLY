"""
APTLY API — Speech Metrics Unit Tests
"""

from __future__ import annotations

import pytest

from app.services.speech_metrics import SpeechMetricsService


def test_speech_metrics_empty_words() -> None:
    service = SpeechMetricsService()
    res = service.compute(words=[], total_audio_duration_seconds=10.0)

    assert res.wpm == 0.0
    assert res.total_words == 0
    assert res.filler_count == 0
    assert res.filler_density == 0.0
    assert res.pause_count == 0


def test_speech_metrics_wpm_calculation() -> None:
    service = SpeechMetricsService()
    # 30 words over 15 seconds -> 30 / (15/60) = 120 WPM
    words = [
        {"word": f"word{i}", "start": float(i * 0.5), "end": float(i * 0.5 + 0.4)}
        for i in range(30)
    ]
    res = service.compute(words=words, total_audio_duration_seconds=20.0)

    assert res.total_words == 30
    assert 115.0 <= res.wpm <= 125.0


def test_speech_metrics_filler_words_detection() -> None:
    service = SpeechMetricsService()
    words = [
        {"word": "Well", "start": 0.0, "end": 0.5},
        {"word": "basically", "start": 0.6, "end": 1.1},
        {"word": "I", "start": 1.2, "end": 1.4},
        {"word": "used", "start": 1.5, "end": 1.8},
        {"word": "um", "start": 2.0, "end": 2.3},
        {"word": "FastAPI", "start": 2.4, "end": 2.9},
        {"word": "actually", "start": 3.0, "end": 3.4},
    ]
    res = service.compute(words=words, total_audio_duration_seconds=5.0)

    assert res.total_words == 7
    assert res.filler_count == 3  # basically, um, actually
    assert len(res.filler_words) == 3
    assert res.filler_words[0]["word"] == "basically"
    assert res.filler_words[0]["timestamp_seconds"] == 0.6
    assert res.filler_words[1]["word"] == "um"
    assert res.filler_words[2]["word"] == "actually"
    assert res.filler_density == pytest.approx(42.86, 0.1)


def test_speech_metrics_multiword_filler_detection() -> None:
    service = SpeechMetricsService()
    words = [
        {"word": "You", "start": 0.0, "end": 0.3},
        {"word": "know", "start": 0.35, "end": 0.7},
        {"word": "we", "start": 0.8, "end": 1.0},
        {"word": "deployed", "start": 1.1, "end": 1.6},
    ]
    res = service.compute(words=words, total_audio_duration_seconds=2.0)

    assert any(f["word"] == "you know" for f in res.filler_words)


def test_speech_metrics_pause_detection() -> None:
    service = SpeechMetricsService(pause_threshold_seconds=2.0)
    words = [
        {"word": "First", "start": 0.0, "end": 1.0},
        # 2.5 second gap (1.0 -> 3.5)
        {"word": "Second", "start": 3.5, "end": 4.5},
        # 0.5 second gap (4.5 -> 5.0)
        {"word": "Third", "start": 5.0, "end": 6.0},
        # 3.0 second gap (6.0 -> 9.0)
        {"word": "Fourth", "start": 9.0, "end": 10.0},
    ]
    res = service.compute(words=words, total_audio_duration_seconds=11.0)

    assert res.pause_count == 2
    assert res.pauses[0]["start_seconds"] == 1.0
    assert res.pauses[0]["end_seconds"] == 3.5
    assert res.pauses[0]["duration_seconds"] == 2.5
    assert res.pauses[1]["duration_seconds"] == 3.0
    assert res.total_pause_seconds == 5.5


def test_speech_metrics_voice_energy_calculation() -> None:
    service = SpeechMetricsService()

    # Empty audio bytes
    res_empty = service.compute_voice_energy(b"")
    assert res_empty.average_energy == 0.0
    assert len(res_empty.timeline) == 0

    # Synthetic 16-bit PCM WAV (1 second of sine wave audio at 16kHz)
    import math
    import struct

    samples = [int(15000 * math.sin(2 * math.pi * 440 * i / 16000)) for i in range(16000)]
    raw_pcm = struct.pack(f"<{len(samples)}h", *samples)

    res = service.compute_voice_energy(raw_pcm, sample_rate=16000, frame_duration_ms=500)
    assert res.average_energy > 0.0
    assert len(res.timeline) == 2
    assert res.opening_energy > 0.0
    assert res.middle_energy > 0.0
    assert res.closing_energy > 0.0

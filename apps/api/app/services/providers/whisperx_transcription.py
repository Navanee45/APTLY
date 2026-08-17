"""
APTLY API — Real Faster-Whisper / WhisperX Transcription Provider

Implements TranscriptionProvider using faster-whisper with CTranslate2 backend:
- Word-level timestamps via cross-attention alignment
- Built-in Voice Activity Detection (VAD)
- Sub-second latency on NVIDIA RTX 4060 GPU (with seamless CPU fallback)
- In-memory/tempfile FFmpeg 16kHz audio extraction from WebM/video containers
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
from typing import Any

from app.core.errors import ProviderError
from app.core.logging import get_logger
from app.services.providers.base import (
    TranscriptionProvider,
    TranscriptionRequest,
    TranscriptionResponse,
    TranscriptionWord,
)

logger = get_logger(__name__)


class WhisperXTranscriptionProvider(TranscriptionProvider):
    """
    Production-grade transcription provider with word-level alignment.
    """

    def __init__(
        self,
        model_size: str = "base.en",
        device: str = "auto",
        compute_type: str = "auto",
        vad_filter: bool = True,
    ) -> None:
        self.model_size = model_size
        self.vad_filter = vad_filter
        self._model: Any = None
        self._lock = asyncio.Lock()

        # Find FFmpeg binary
        self.ffmpeg_path = shutil.which("ffmpeg") or "ffmpeg"

        # Determine device & compute type
        if device == "auto":
            try:
                import torch  # type: ignore[import-not-found]
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                self.device = "cpu"
        else:
            self.device = device

        if compute_type == "auto":
            self.compute_type = "float16" if self.device == "cuda" else "int8"
        else:
            self.compute_type = compute_type

        logger.info(
            "whisperx_provider_init",
            model_size=self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            ffmpeg_path=self.ffmpeg_path,
        )

    def _load_model(self) -> Any:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel  # type: ignore[import-untyped]

                logger.info(
                    "loading_whisper_model",
                    model_size=self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                )
                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                )
            except Exception as exc:
                logger.error("whisper_model_load_failed", error=str(exc))
                raise ProviderError(f"Failed to load Whisper model: {exc}") from exc
        return self._model

    def _extract_audio_ffmpeg(self, input_bytes: bytes) -> str:
        """Extract 16kHz mono PCM WAV from audio/video bytes using FFmpeg or write directly."""
        import tempfile

        # If audio is already a WAV container (starts with RIFF header), write directly to .wav
        if input_bytes.startswith(b"RIFF"):
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
                wav_file.write(input_bytes)
                return wav_file.name

        # Otherwise, write input container (webm/mp4/etc.) and extract PCM audio via FFmpeg
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as in_file:
            in_file.write(input_bytes)
            in_path = in_file.name

        out_path = in_path.replace(".webm", "_16k.wav")

        try:
            cmd = [
                self.ffmpeg_path,
                "-y",
                "-i",
                in_path,
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                out_path,
            ]
            result = subprocess.run(  # noqa: S603
                cmd,
                capture_output=True,
                check=False,
                timeout=30,
            )
            if result.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                # Successfully converted; clean up raw container file
                try:
                    os.remove(in_path)
                except Exception:
                    pass
                return out_path

            # Conversion didn't produce valid out_path; return in_path without deleting it
            logger.warning("ffmpeg_audio_extraction_non_zero", retcode=result.returncode, stderr=result.stderr.decode(errors="ignore")[:200])
            return in_path
        except Exception as exc:
            logger.warning("ffmpeg_audio_extraction_failed", error=str(exc))
            return in_path

    async def transcribe(
        self,
        request: TranscriptionRequest,
    ) -> TranscriptionResponse:
        """Transcribe audio/video bytes to text with word-level timestamps."""
        if not request.audio_bytes:
            return TranscriptionResponse(
                text="",
                words=[],
                language=request.language,
                duration_seconds=0.0,
                provider="whisperx",
                model=self.model_size,
                model_version="1.0",
            )

        # Run extraction & inference in worker thread to avoid blocking event loop
        loop = asyncio.get_running_loop()

        def _run_inference() -> tuple[str, list[TranscriptionWord], float, str]:
            temp_audio_path = self._extract_audio_ffmpeg(request.audio_bytes)
            try:
                model = self._load_model()
                segments, info = model.transcribe(
                    temp_audio_path,
                    word_timestamps=True,
                    vad_filter=self.vad_filter,
                    language=request.language if request.language != "auto" else None,
                )

                all_words: list[TranscriptionWord] = []
                text_segments: list[str] = []

                for segment in segments:
                    text_segments.append(segment.text.strip())
                    if segment.words:
                        for w in segment.words:
                            clean_word = w.word.strip()
                            if clean_word:
                                all_words.append(
                                    TranscriptionWord(
                                        word=clean_word,
                                        start_seconds=round(float(w.start), 3),
                                        end_seconds=round(float(w.end), 3),
                                        confidence=round(float(w.probability), 3),
                                    )
                                )

                full_text = " ".join(text_segments).strip()
                duration = round(float(info.duration), 2) if hasattr(info, "duration") else 0.0
                detected_lang = info.language if hasattr(info, "language") else request.language
                return full_text, all_words, duration, detected_lang
            finally:
                if temp_audio_path and os.path.exists(temp_audio_path):
                    try:
                        os.remove(temp_audio_path)
                    except Exception as cleanup_err:
                        logger.debug("temp_audio_cleanup_failed", error=str(cleanup_err))

        async with self._lock:
            try:
                full_text, words, duration, lang = await loop.run_in_executor(None, _run_inference)
            except Exception as exc:
                logger.error("whisperx_transcription_failed", error=str(exc))
                raise ProviderError(f"Transcription failed: {exc}") from exc

        return TranscriptionResponse(
            text=full_text,
            words=words,
            language=lang,
            duration_seconds=duration,
            provider="whisperx",
            model=self.model_size,
            model_version="faster-whisper-1.2.1",
        )

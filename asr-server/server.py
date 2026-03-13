import json
import os
import subprocess
import tempfile
from typing import Optional

from flask import Flask, jsonify, request
from vosk import Model, KaldiRecognizer


app = Flask(__name__)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Expected model folders (you will download and unzip them here):
# - asr-server/models/vosk-model-small-en-us-0.15
# - asr-server/models/vosk-model-small-en-in-0.4
MODELS_DIR = os.path.join(BASE_DIR, "models")
US_MODEL_PATH = os.path.join(MODELS_DIR, "vosk-model-small-en-us-0.15")
IN_MODEL_PATH = os.path.join(MODELS_DIR, "vosk-model-small-en-in-0.4")


def load_model(path: str) -> Optional[Model]:
    if not os.path.isdir(path):
        return None
    app.logger.info(f"Loading Vosk model from {path}")
    return Model(path)


model_en_us: Optional[Model] = load_model(US_MODEL_PATH)
model_en_in: Optional[Model] = load_model(IN_MODEL_PATH)


def pick_model(lang: str) -> Model:
    """
    Decide which model to use based on requested language/accent.

    Rules:
    - If lang looks like Indian English / Hindi (en-IN, en-in, hi, hi-IN) and IN model exists -> use IN model
    - Else, use US model if available
    - Fallback: whichever model is loaded
    """
    lang = (lang or "").lower().strip()

    # Indian English / Hindi hints
    is_indian = any(
        token in lang
        for token in ("en-in", "hi", "hi-in", "india", "indian")
    )

    if is_indian and model_en_in:
        return model_en_in

    if model_en_us:
        return model_en_us

    # Fallback: whichever exists
    selected = model_en_in or model_en_us
    if selected is None:
        raise RuntimeError("No Vosk model is loaded")
    return selected


def mp3_to_wav(mp3_path: str, wav_path: str) -> None:
    """
    Convert MP3/any audio to 16kHz mono WAV using ffmpeg.

    We first look for an explicit FFMPEG_PATH environment variable; if not set,
    we fall back to the 'ffmpeg' command on PATH. This avoids the situation
    where ffmpeg is installed but not visible in the environment that runs
    the ASR server.
    """
    ffmpeg_bin = os.getenv("FFMPEG_PATH", "ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        mp3_path,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "wav",
        wav_path,
    ]
    app.logger.info("Running ffmpeg command: %s", " ".join(cmd))
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


@app.post("/transcribe")
def transcribe():
    """
    HTTP API used by the Node backend for ASR.

    Expects multipart/form-data:
      - file: audio file (MP3 produced by backend)
      - response_format: "verbose_json" (ignored but accepted)
      - language: ISO-like code, e.g.:
          - "" or "auto" -> default to en-US model if available
          - "en-US", "en" -> US model
          - "en-IN", "hi", "hi-IN" -> Indian English model if available

    Response JSON:
    { "segments": [ { "text": str, "start": float, "end": float }, ... ] }
    """
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "file is required"}), 400

    _response_format = request.form.get("response_format", "verbose_json")
    lang = request.form.get("language", "")  # may be "", "auto", "en", "en-IN", "hi", etc.

    try:
        model = pick_model(lang)
    except RuntimeError:
        return jsonify({
            "error": "ASR models are not loaded on this server",
            "hint": "Add Vosk models under /app/models or configure model download",
        }), 503

    with tempfile.TemporaryDirectory() as tmpdir:
        mp3_path = os.path.join(tmpdir, "audio.mp3")
        wav_path = os.path.join(tmpdir, "audio.wav")
        file.save(mp3_path)

        try:
            mp3_to_wav(mp3_path, wav_path)
        except Exception as e:  # noqa: BLE001
            app.logger.error("ffmpeg conversion failed: %s", e)
            return jsonify({"error": "ffmpeg conversion failed"}), 500

        rec = KaldiRecognizer(model, 16000)
        rec.SetWords(True)

        segments = []
        cur_start = 0.0

        with open(wav_path, "rb") as f:
            while True:
                data = f.read(4000)
                if not data:
                    break
                if rec.AcceptWaveform(data):
                    res = json.loads(rec.Result())
                    text = res.get("text", "").strip()
                    words = res.get("result", [])
                    if text:
                        start = words[0]["start"] if words else cur_start
                        end = words[-1]["end"] if words else start
                        segments.append(
                            {
                                "text": text,
                                "start": float(start),
                                "end": float(end),
                            }
                        )
                        cur_start = end

        # Final partial
        res = json.loads(rec.FinalResult())
        text = res.get("text", "").strip()
        words = res.get("result", [])
        if text:
            start = words[0]["start"] if words else cur_start
            end = words[-1]["end"] if words else start
            segments.append(
                {
                    "text": text,
                    "start": float(start),
                    "end": float(end),
                }
            )

    return jsonify({"segments": segments})


@app.get("/health")
def health():
    """Health check endpoint for Docker and monitoring."""
    models_status = {
        "en_us": model_en_us is not None,
        "en_in": model_en_in is not None,
    }
    return jsonify({
        "status": "healthy" if any(models_status.values()) else "degraded",
        "models": models_status,
        "models_loaded": any(models_status.values()),
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("ASR_PORT", "8000")))
    app.run(host="0.0.0.0", port=port)



from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel
import tempfile, shutil

app = FastAPI()
model = WhisperModel("small", compute_type="int8")  # change to medium if you want

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...),
                     response_format: str = Form("verbose_json"),
                     language: str = Form("en")):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        shutil.copyfileobj(file.file, f); path = f.name
    segments, _ = model.transcribe(path, language=language)
    if response_format == "verbose_json":
        return {"segments": [{"start": int(s.start), "end": int(s.end), "text": s.text} for s in segments]}
    return {"text": "".join(s.text for s in segments)}
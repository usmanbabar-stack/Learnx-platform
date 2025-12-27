### ASR Server (Vosk) for LearnX

This folder contains a small Flask + Vosk HTTP server that your Node backend
uses as the **local ASR provider** when there are no YouTube subtitles.

The server supports **two English models** out of the box:

- `vosk-model-small-en-us-0.15`  – US English
- `vosk-model-small-en-in-0.4`   – Indian English

The backend sends a `language` field with each request, and the server picks
the appropriate model automatically:

- If `language` looks like Indian English / Hindi (`en-IN`, `hi`, `hi-IN`, etc)
  it will use the **en-in** model when available.
- Otherwise it falls back to **en-us** (if present), or whichever model exists.

---

### 1. Directory layout

From your project root (`D:\learnx-platform`):

```text
asr-server/
  server.py
  requirements.txt
  models/
    vosk-model-small-en-us-0.15/
    vosk-model-small-en-in-0.4/
```

You must manually download and unzip the Vosk models into the `models` folder.
They are **not** committed to the repo (they are large).

---

### 2. Setup (first time)

In PowerShell (from project root):

```powershell
cd asr-server
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Then download the models from the Vosk site and unzip them:

- Download `vosk-model-small-en-us-0.15` and unzip to:
  `asr-server\models\vosk-model-small-en-us-0.15`
- Download `vosk-model-small-en-in-0.4` and unzip to:
  `asr-server\models\vosk-model-small-en-in-0.4`

Also ensure **ffmpeg** is installed globally and on `PATH`:

```powershell
ffmpeg -version
```

If that command fails, install ffmpeg for Windows and add its `bin` folder
to your system PATH.

---

### 3. Running the ASR server (dev)

```powershell
cd D:\learnx-platform\asr-server
.\venv\Scripts\Activate.ps1
python server.py
```

By default this will listen on `http://localhost:8000` and expose:

```text
POST /transcribe
```

Expected request (multipart/form-data):

- `file`: audio file (MP3)
- `response_format`: usually `"verbose_json"`
- `language`: can be:
  - `""` or `"auto"` → use default en-us model
  - `"en-US"`, `"en"` → en-us model
  - `"en-IN"`, `"hi"`, `"hi-IN"` → en-in model (if present)

Response JSON:

```json
{
  "segments": [
    { "text": "some words", "start": 0.0, "end": 2.5 },
    { "text": "more words", "start": 2.5, "end": 4.0 }
  ]
}
```

This is exactly the shape that the Node backend expects.

---

### 4. Backend env configuration

In `backend/.env` (already wired):

```env
ASR_ENABLED=true
ENABLE_ASR_FALLBACK=true
FULL_AUDIO_TRANSCRIBE=true
ASR_PROVIDER=local
ASR_SERVER_URL=http://localhost:8000/transcribe
ASR_LANGUAGE=       # leave blank so server auto-picks model
```

- With `ASR_LANGUAGE` empty, the backend sends `language=auto`.
- The ASR server then decides which model to use based on that and the
  available models.

---

### 5. When this server is used

The Node backend will call this ASR server **only if all of these are true**:

1. `yt-dlp` subtitles returned 0 segments (no captions in any language).
2. Watch‑page caption fallback also returned 0 segments.
3. `ASR_ENABLED=true`, `ENABLE_ASR_FALLBACK=true`, `FULL_AUDIO_TRANSCRIBE=true`.

If those conditions are met, the backend:

1. Downloads the full audio of the YouTube video to a temp MP3
   (using yt-dlp + ffmpeg-static).
2. POSTs that MP3 to this server at `/transcribe`.
3. Receives `segments` and uses them as the transcript for RAG + Gemini.

If this server is not running or returns an error, the backend falls back to
the general-knowledge answer mode (still answering the question, but not
grounded in the video audio).



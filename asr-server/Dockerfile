# ASR Server Dockerfile for Vosk Speech Recognition
FROM python:3.11-slim

# Install system dependencies including ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY server.py .

# Download the Vosk models needed in production so the container does not rely on local bind mounts.
ARG VOSK_MODEL_US_URL=https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
ARG VOSK_MODEL_IN_URL=https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip
RUN mkdir -p /app/models \
    && wget -qO /tmp/vosk-model-small-en-us-0.15.zip "$VOSK_MODEL_US_URL" \
    && unzip -q /tmp/vosk-model-small-en-us-0.15.zip -d /app/models \
    && wget -qO /tmp/vosk-model-small-en-in-0.4.zip "$VOSK_MODEL_IN_URL" \
    && unzip -q /tmp/vosk-model-small-en-in-0.4.zip -d /app/models \
    && rm -f /tmp/vosk-model-small-en-us-0.15.zip /tmp/vosk-model-small-en-in-0.4.zip

# Expose port
EXPOSE 8000

# Health check endpoint (add to server.py if not exists)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the server
CMD ["python", "server.py"]

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

# Keep models directory available; models can be mounted or downloaded later.
RUN mkdir -p /app/models

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "server.py"]

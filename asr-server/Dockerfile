# ASR Server Dockerfile for Vosk Speech Recognition
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    unzip \
 && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# --- Vosk Model Installation ---
# Create a directory for the models
RUN mkdir -p /app/models

# Download and unzip the small English (US) model
RUN wget -q https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip -O /app/models/en-us.zip && \
    unzip /app/models/en-us.zip -d /app/models && \
    rm /app/models/en-us.zip

# Download and unzip the small English (IN) model
RUN wget -q https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip -O /app/models/en-in.zip && \
    unzip /app/models/en-in.zip -d /app/models && \
    rm /app/models/en-in.zip
# --- End Vosk Model Installation ---

# Copy the rest of the application code into the container at /app
COPY . .

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define environment variable
ENV ASR_PORT=8000
ENV PYTHONUNBUFFERED=1

# Run server.py when the container launches
CMD ["python", "server.py"]

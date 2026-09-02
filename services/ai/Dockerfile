# Dockerfile — services/ai/
# Lightweight, CPU-only, production Dockerfile for Hugging Face Spaces (free tier).
# Model weights are NOT baked into this image — inference.py downloads them
# from the Hugging Face Model Hub at container startup (see AI_HF_MODEL_REPO
# secret), keeping this image small and the build fast.

FROM python:3.11-slim

# Tesseract OCR (system dependency, referenced by tools/dataset_labeler.py
# and any OCR path in the API), plus build tools some wheels need at install time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces run containers as a non-root user by convention.
RUN useradd -m -u 1000 appuser
WORKDIR /app

# Install Python dependencies first (better Docker layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code (NOT the models/ folder — weights come from the Hub).
COPY app ./app
COPY app/config.py ./app/config.py

# Writable cache dir for Hugging Face Hub downloads at runtime.
ENV HF_HOME=/app/.cache/huggingface
RUN mkdir -p /app/.cache/huggingface && chown -R appuser:appuser /app

USER appuser

EXPOSE 7860

# Basic container-level healthcheck hitting our own /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://127.0.0.1:7860/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
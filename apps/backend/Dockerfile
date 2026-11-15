# Cortex API container. Build from the repo root (needs contracts/ and fixtures/):
#   docker build -f apps/backend/Dockerfile .
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/apps/backend
COPY apps/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY contracts /app/contracts
COPY fixtures /app/fixtures
# Each signed-in user starts from their own copy of the demo profile (core/user.py, scripts/seed.py).
COPY apps/dashboard/demo /app/apps/dashboard/demo
COPY apps/backend /app/apps/backend
# One worker on purpose: memory, SSE subscribers and undo timers live in this process.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]

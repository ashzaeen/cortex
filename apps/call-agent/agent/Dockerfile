# The hosted call agent: a LiveKit worker that connects outward to our LiveKit Cloud project. No inbound port.
# Build context is this folder (deploy with `railway up apps/call-agent/agent --service call-agent`).
FROM node:24-slim
ENV NODE_ENV=production
# LiveKit's native client (Rust) reads the system's root certificates; the slim image has none, so every
# job failed with "no native root CA certificates found". Node's own TLS bundles its roots, which hid it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
CMD ["sh", "start.sh"]

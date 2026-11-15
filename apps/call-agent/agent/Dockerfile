# The hosted call agent: a LiveKit worker that connects outward to our LiveKit Cloud project. No inbound port.
# Build context is this folder (deploy with `railway up apps/call-agent/agent --service call-agent`).
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
CMD ["sh", "start.sh"]

# The hosted Chert connector: holds our FaceTime line and hands each call to the call agent (ADR 0006).
# State (the sign-in, which lasts 30 days) lives in CHERT_HOME: mount a Railway volume at /data.
FROM node:24-slim
ENV NODE_ENV=production CHERT_HOME=/data/chert
RUN npm install -g @trychert/facetime@0.1.0-beta.21 --no-audit --no-fund
WORKDIR /app
COPY connector.sh .
CMD ["sh", "connector.sh"]

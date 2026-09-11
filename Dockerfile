# Собирает сайт вместе с ClamAV, чтобы CLAMAV_ENABLED=true в .env реально
# работал на Railway (штатный Node-билдер Railway ClamAV не ставит).
# Если антивирус не нужен — можно не использовать этот Dockerfile вообще:
# Railway и так задеплоит проект как обычное Node-приложение (Nixpacks),
# просто CLAMAV_ENABLED тогда стоит оставить false.

FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    clamav clamav-daemon clamav-freshclam \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/run/clamav && chown clamav:clamav /var/run/clamav

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV CLAMAV_ENABLED=true
ENV CLAMAV_SOCKET=/var/run/clamav/clamd.ctl

EXPOSE 3000
CMD ["./start.sh"]

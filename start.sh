#!/bin/sh
# Обновляет базы сигнатур, поднимает clamd в фоне, затем запускает сайт.
# Если ClamAV не смог стартовать (например, freshclam не достучался до
# интернета при билде) — сайт всё равно запустится, просто src/scan.js
# сам определит, что ClamAV недоступен, и пометит это в scan_note.

set -e

echo "[start] Обновляю базы ClamAV (freshclam)…"
freshclam --quiet || echo "[start] freshclam не смог обновиться — продолжаю с тем, что есть (или без баз)."

echo "[start] Запускаю clamd в фоне…"
clamd &

echo "[start] Запускаю сайт…"
exec node server.js

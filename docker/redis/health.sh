#!/bin/sh
set -eu

REDISCLI_AUTH=$(cat /run/secrets/redis_password)
case "$REDISCLI_AUTH" in ''|*[!0123456789abcdefABCDEF]*) exit 1 ;; esac
export REDISCLI_AUTH
reply=$(redis-cli -h 127.0.0.1 -p 6379 --raw ping 2>/dev/null) || exit 1
[ "$reply" = PONG ] || exit 1
printf '%s\n' PONG

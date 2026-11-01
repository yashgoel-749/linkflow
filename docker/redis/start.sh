#!/bin/sh
set -eu

password=$(cat /run/secrets/redis_password)
case "$password" in
    ''|*[!0123456789abcdefABCDEF]*)
        printf '%s\n' 'Redis password must be nonempty hexadecimal text' >&2
        exit 1
        ;;
esac

umask 077
config=$(mktemp /tmp/redis.conf.XXXXXX)
trap 'rm -f "$config"' EXIT HUP INT TERM
{
    printf '%s\n' 'bind 0.0.0.0' 'port 6379' 'protected-mode yes'
    printf 'requirepass %s\n' "$password"
    printf '%s\n' 'dir /data' 'appendonly yes' 'appendfsync everysec' 'save ""' 'daemonize no' 'logfile ""'
} > "$config"
unset password
mv "$config" /tmp/redis.conf
trap - EXIT HUP INT TERM
exec redis-server /tmp/redis.conf

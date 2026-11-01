#!/bin/sh
set -eu

fail() {
    printf '%s\n' "nginx startup: $1" >&2
    exit 1
}

case "${PROXY_MODE:-local}" in
    local) scheme=http ;;
    production) scheme=https ;;
    *) fail 'PROXY_MODE must be local or production' ;;
esac

PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-http://localhost:8080}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL%/}
case "$PUBLIC_BASE_URL" in
    "$scheme"://*) authority=${PUBLIC_BASE_URL#*://} ;;
    *) fail "PUBLIC_BASE_URL must use $scheme:// in this mode" ;;
esac

case "$authority" in
    *:*)
        PUBLIC_HOST=${authority%:*}
        port=${authority##*:}
        case "$port" in ''|*[!0-9]*) fail 'invalid public port' ;; esac
        [ "${#port}" -le 5 ] || fail 'invalid public port'
        [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail 'invalid public port'
        ;;
    *) PUBLIC_HOST=$authority ;;
esac

# Only DNS names and IPv4 literals are accepted; reject URL/config syntax.
case "$PUBLIC_HOST" in ''|*[!A-Za-z0-9.-]*) fail 'invalid public host characters' ;; esac
[ "${#PUBLIC_HOST}" -le 253 ] || fail 'public host is too long'
printf '%s\n' "$PUBLIC_HOST" | LC_ALL=C grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' \
    || fail 'PUBLIC_BASE_URL must contain a DNS host or IPv4 address and optional port, without a path'
old_ifs=$IFS
IFS=.
set -f
set -- $PUBLIC_HOST
IFS=$old_ifs
for label do
    [ "${#label}" -ge 1 ] && [ "${#label}" -le 63 ] || fail 'invalid public host label'
    case "$label" in -*|*-) fail 'invalid public host label' ;; esac
done
case "$PUBLIC_HOST" in *..*) fail 'invalid public host label' ;; esac

export PUBLIC_HOST PUBLIC_BASE_URL
umask 077
envsubst '${PUBLIC_HOST} ${PUBLIC_BASE_URL}' \
    < "/etc/linkflow/templates/${PROXY_MODE:-local}.conf.template" > /tmp/linkflow.conf
nginx -t -c /tmp/linkflow.conf
exec nginx -c /tmp/linkflow.conf -g 'daemon off;'

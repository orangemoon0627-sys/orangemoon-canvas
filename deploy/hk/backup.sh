#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"
umask 077
set -a
. ./.env
set +a

case "${BACKUP_RETENTION_DAYS:-14}" in
    *[!0-9]*|'') echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 1 ;;
esac

mkdir -p backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/orangemoon-$timestamp.dump"
temporary="$target.partial"
media_target="backups/orangemoon-media-$timestamp.tar.gz"
media_temporary="$media_target.partial"
trap 'rm -f "$temporary" "$media_temporary"' EXIT HUP INT TERM

docker compose --env-file .env -f compose.yml exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$temporary"
test -s "$temporary"
docker compose --env-file .env -f compose.yml exec -T postgres \
    pg_restore --list < "$temporary" >/dev/null
mv "$temporary" "$target"
chmod 600 "$target"
docker compose --env-file .env -f compose.yml exec -T platform-api \
    tar -czf - -C /var/lib/orangemoon media > "$media_temporary"
test -s "$media_temporary"
tar -tzf "$media_temporary" >/dev/null
mv "$media_temporary" "$media_target"
chmod 600 "$media_target"
find backups -type f -name 'orangemoon-*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find backups -type f -name 'orangemoon-media-*.tar.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
printf '%s\n%s\n' "$target" "$media_target"

#!/bin/sh
# Run only inside this project's postgres container, without a TTY.
# Match the role password to the current container configuration. No table,
# migration ledger, environment file or stored application data is changed.
set -eu
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
# psql's \password encrypts on the client so plaintext is not sent in SQL/logs.
# printf is a shell builtin: the password is neither an external argument nor
# printed to the terminal. Existing local-socket authentication must succeed;
# this script does not change pg_hba.conf or weaken authentication.
printf '%s\n%s\n' "$POSTGRES_PASSWORD" "$POSTGRES_PASSWORD" |
  psql --no-psqlrc --no-password --username="$POSTGRES_USER" --dbname=postgres --set=ON_ERROR_STOP=1 --command='\password'
printf '%s\n' 'Database role password now matches the configured POSTGRES_PASSWORD. Application data was preserved.'

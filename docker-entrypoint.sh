#!/bin/sh
set -e

# Default PUID/PGID to 1000 if not set
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting with UID: $PUID, GID: $PGID"

# Update nodejs group to match PGID (do group first, like LinuxServer)
groupmod -o -g "$PGID" nodejs

# Update nodejs user to match PUID
usermod -o -u "$PUID" nodejs

# Ensure config directory exists and has correct ownership
mkdir -p /app/config
chown nodejs:nodejs /app/config

# Run as nodejs user using gosu
exec gosu nodejs "$@"

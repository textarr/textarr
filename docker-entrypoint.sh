#!/bin/sh
set -e

# Default PUID/PGID to 1000 if not set
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting with UID: $PUID, GID: $PGID"

# Update bun group to match PGID (do group first, like LinuxServer)
groupmod -o -g "$PGID" bun

# Update bun user to match PUID
usermod -o -u "$PUID" bun

# Ensure config directory exists and has correct ownership
mkdir -p /app/config
chown bun:bun /app/config

# Run as bun user using gosu
exec gosu bun "$@"

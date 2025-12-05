#!/bin/sh
set -e

# Default PUID/PGID to 1000 if not set
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting with UID: $PUID, GID: $PGID"

# Update node group to match PGID (do group first, like LinuxServer)
groupmod -o -g "$PGID" node

# Update node user to match PUID
usermod -o -u "$PUID" node

# Ensure config directory exists and has correct ownership
mkdir -p /app/config
chown node:node /app/config

# Run as node user using gosu
exec gosu node "$@"

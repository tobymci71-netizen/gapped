#!/bin/bash
# Runs a command once one of $SLOTS render slots is free, so only a few
# Blender processes (each can take a few GB) run at the same time.
#   scripts/render-vehicles/slot.sh <command> [args...]
set -u
SLOTS="${SLOTS:-3}"
while true; do
  for i in $(seq 1 "$SLOTS"); do
    slot="/tmp/gapped-bake-slot-$i"
    if mkdir "$slot" 2>/dev/null; then
      trap 'rmdir "$slot" 2>/dev/null' EXIT INT TERM
      "$@"
      exit $?
    fi
  done
  sleep 3
done

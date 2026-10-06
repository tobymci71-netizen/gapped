#!/bin/bash
# Preview renders for one body type, composited on the app's night canvas, in
# build/vehicle-previews/<bodyType>/ (<view>-preview.png). Waits for a render
# slot (slot.sh). With --inspect, prints the model's objects and materials.
#
#   scripts/render-vehicles/preview.sh <bodyType> [extra bake.py args]
set -u
cd "$(dirname "$0")/../.."
BT="$1"; shift
BLENDER="${BLENDER:-$HOME/Applications/Blender.app/Contents/MacOS/Blender}"
if [[ " $* " == *" --inspect "* ]]; then
  exec scripts/render-vehicles/slot.sh "$BLENDER" -b -P scripts/render-vehicles/bake.py -- \
    --out /tmp/gapped-inspect --only "$BT" "$@"
fi
scripts/render-vehicles/slot.sh "$BLENDER" -b -P scripts/render-vehicles/bake.py -- \
  --out build/vehicle-previews --only "$BT" --width 900 --samples 48 --preview "$@" 2>&1 |
  grep -E '\[bake\]|Error|Traceback|line [0-9]+|Exception'
exit "${PIPESTATUS[0]}"

#!/bin/bash
# Record the README demo (docs/demo.mp4 + docs/demo.gif) by capturing frames from the running
# dev server with the gstack `browse` CLI (headed, for WebGL) and encoding them with ffmpeg.
set -u
cd "$(dirname "$0")/.."
BROWSE="${BROWSE:-$HOME/.claude/skills/gstack/browse/dist/browse}"
b() { "$BROWSE" --headed "$@"; }
F=.frames && rm -rf .frames && mkdir -p .frames  # browse may only write inside the project
i=0
# cap <seconds>: grab frames as fast as the browser allows
cap() {
  local end=$(( $(date +%s) + $1 ))
  while [ "$(date +%s)" -lt "$end" ]; do
    i=$((i+1)); b screenshot --viewport "$(printf '%s/f%05d.jpg' "$F" "$i")" >/dev/null
  done
}
js() { b js "$1" >/dev/null; }

b viewport 1280x800 >/dev/null
b goto "http://localhost:5182/?rec=$RANDOM#ohms-law" >/dev/null
js "localStorage.setItem('circuit-theme','light'); 'ok'"
b goto "http://localhost:5182/?rec=$RANDOM#ohms-law" >/dev/null
start=$(date +%s)
cap 4                                                     # parts drop in, wires draw, labels arrive
js "window.__circuit.setRunning(true); 'ok'"; cap 3       # plug in, needles swing, charges flow
for n in 3 4; do js "document.querySelectorAll('.controls .seg')[0].children[$((n-1))].click(); 'ok'"; cap 2; done
js "window.__circuit.select('Ammeter'); 'ok'"; cap 3
js "window.__circuit.select(null); location.hash = 'series-parallel'; 'ok'"; cap 4
js "window.__circuit.setRunning(true); 'ok'"; cap 2
js "document.querySelectorAll('.controls .seg')[0].children[1].click(); 'ok'"; cap 3
js "document.querySelectorAll('.controls .row .btn')[1].click(); 'ok'"; cap 2
js "location.hash = 'led-resistor'; 'ok'"; cap 4
js "window.__circuit.setRunning(true); document.querySelector('[data-tab=code]').click(); 'ok'"; cap 3
js "document.querySelectorAll('.controls .seg')[0].children[0].click(); 'ok'"; cap 4
secs=$(( $(date +%s) - start ))
fps=$(( i / (secs > 0 ? secs : 1) )); [ "$fps" -lt 1 ] && fps=1
ffmpeg -y -loglevel error -framerate "$fps" -i "$F/f%05d.jpg" -vf "scale=1280:-2" -c:v libx264 -pix_fmt yuv420p -crf 22 docs/demo.mp4
ffmpeg -y -loglevel error -i docs/demo.mp4 -vf "fps=12,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/demo.gif
rm -rf "$F"
echo "demo: ${secs}s, $i frames (${fps} fps) → docs/demo.mp4, docs/demo.gif"

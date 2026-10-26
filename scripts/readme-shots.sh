#!/bin/bash
# Refresh every README screenshot (docs/screenshots/*.jpg) from the running dev server.
# Needs: `npm run dev` on :5182 and the gstack `browse` CLI in headed mode (WebGL needs a real GPU).
# Usage: scripts/readme-shots.sh
set -u
cd "$(dirname "$0")/.."
OUT=docs/screenshots
mkdir -p "$OUT"
BROWSE="${BROWSE:-$HOME/.claude/skills/gstack/browse/dist/browse}"
b() { "$BROWSE" --headed "$@"; }
n=0

# shot <name> <hash> <seconds to settle> [js…]
shot() {
  local name=$1 hash=$2 wait=$3; shift 3
  n=$((n+1))
  b viewport "${VP:-1440x900}" >/dev/null
  b goto "http://localhost:5182/?s=$n#$hash" >/dev/null
  sleep 5
  for j in "$@"; do b js "$j" >/dev/null; done
  sleep "$wait"
  b screenshot --viewport "$OUT/$name.png" >/dev/null
  sips -s format jpeg -s formatOptions 82 "$OUT/$name.png" --out "$OUT/$name.jpg" >/dev/null && rm "$OUT/$name.png"
  echo "ok $name"
}
theme() { b js "localStorage.setItem('circuit-theme','$1'); document.documentElement.dataset.theme='$1'; 'ok'" >/dev/null; }
run="window.__circuit.setRunning(true); 'ok'"

b goto "http://localhost:5182/" >/dev/null; theme light
shot overview-light ohms-law 3 "$run"
shot series series-parallel 3 "$run"
shot parallel series-parallel 3 "$run" "document.querySelectorAll('.controls .seg')[0].children[1].click(); 'ok'"
shot led led-resistor 4 "$run"
shot burnout led-resistor 3 "$run" "setTimeout(() => document.querySelectorAll('.controls .seg')[0].children[0].click(), 1500); 'ok'"
shot sketch led-resistor 4 "$run" "document.querySelector('[data-tab=code]').click(); 'ok'"
shot part-card ohms-law 3 "$run" "window.__circuit.select('Ammeter'); 'ok'"
shot readings ohms-law 2 "$run" "(async () => { for (const n of [1,2,3,4]) { document.querySelectorAll('.controls .seg')[0].children[n-1].click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('#record').click(); } document.querySelector('#notebook').scrollIntoView(); })(); 'ok'"
shot switch switch 3 "$run" "window.__circuit.current.inst.parts.button.onPress(true); 'ok'"
shot measuring measuring-current 5 "$run" "setTimeout(() => document.querySelectorAll('.controls .seg')[0].children[3].click(), 600); 'ok'"
shot brightness brightness 3 "$run" "const i = document.querySelector('.controls input'); i.value = 10; i.dispatchEvent(new Event('input')); 'ok'"
shot light-sensor light-sensor 4 "$run" "const i = document.querySelector('.controls input'); i.value = 15; i.dispatchEvent(new Event('input')); 'ok'"
theme dark
shot overview-dark ohms-law 3 "$run"
theme light
VP=390x844 shot mobile led-resistor 3 "$run"

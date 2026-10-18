#!/usr/bin/env bash
# Launch the current checkout using the dependencies installed by setup-debian.sh.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
python="${XDG_DATA_HOME:-$HOME/.local/share}/dronemapper-venv/bin/python"
[[ -x "$python" ]] || python=$(command -v python3)
if (( EUID == 0 )); then
  echo 'Run the scanner as your normal user, not with sudo.' >&2
  exit 1
fi
printf -v launch '%q %q serve --listen' "$python" "$root/linux-node/launch.py"
if id -nG "$(id -un)" | tr ' ' '\n' | grep -qx wireshark; then
  exec sg wireshark -c "$launch"
else
  exec "$python" "$root/linux-node/launch.py" serve --listen
fi

#!/usr/bin/env bash
# Launch the current checkout using the dependencies installed by setup-debian.sh.
set -euo pipefail
if (( EUID == 0 )); then
  echo 'Run the scanner as your normal user, not with sudo.' >&2
  exit 1
fi
export PATH="$HOME/.local/bin:$PATH"
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
python="${XDG_DATA_HOME:-$HOME/.local/share}/dronemapper-venv/bin/python"
if [[ ! -x "$python" ]]; then
  python3 -m venv "$(dirname -- "$(dirname -- "$python")")"
fi
# Install updated receiver dependencies in this node's private environment.
source_version=$("$python" "$root/linux-node/launch.py" --version)
installed_version=$("$python" -c 'import importlib.metadata as m; print(m.version("dronemapper-node"))' 2>/dev/null || true)
if [[ "$source_version" != "$installed_version" ]]; then
  "$python" -m pip install "$root/linux-node[all]"
fi
printf -v launch '%q %q serve --listen' "$python" "$root/linux-node/launch.py"
if id -nG "$(id -un)" | tr ' ' '\n' | grep -qx wireshark; then
  exec sg wireshark -c "$launch"
else
  exec "$python" "$root/linux-node/launch.py" serve --listen
fi

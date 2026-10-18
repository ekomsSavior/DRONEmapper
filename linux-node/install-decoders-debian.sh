#!/usr/bin/env bash
# Optional decoder dependencies; no service changes and no receiver is started.
set -euo pipefail
if (( EUID == 0 )); then
  echo 'Run as your normal user; this script uses sudo only for build dependencies.' >&2
  exit 1
fi
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# Pin the audited receiver revision, rather than executing a remote install script.
revision=8afcc22de2de81be38231695285070603af78ef4
source_dir="${XDG_DATA_HOME:-$HOME/.local/share}/dronemapper-decoders/readsb-$revision"
venv="${XDG_DATA_HOME:-$HOME/.local/share}/dronemapper-venv"
sudo apt-get install --no-install-recommends git build-essential pkg-config python3-venv libhackrf-dev librtlsdr-dev libusb-1.0-0-dev libzstd-dev zlib1g-dev
if [[ ! -d "$source_dir" ]]; then
  mkdir -p -- "$(dirname -- "$source_dir")"
  git clone --no-checkout https://github.com/wiedehopf/readsb.git "$source_dir"
  git -C "$source_dir" checkout --detach "$revision"
fi
[[ $(git -C "$source_dir" rev-parse HEAD) == "$revision" ]] || { echo 'Unexpected readsb revision; refusing to build.' >&2; exit 1; }
[[ -z $(git -C "$source_dir" status --porcelain --untracked-files=no) ]] || { echo 'readsb source has local edits; refusing to overwrite them.' >&2; exit 1; }
make -C "$source_dir" -j2 HACKRF=yes RTLSDR=yes DISABLE_INTERACTIVE=yes
mkdir -p -- "$HOME/.local/bin"
if [[ -e "$HOME/.local/bin/readsb" && ! -L "$HOME/.local/bin/readsb" ]]; then
  echo 'Existing ~/.local/bin/readsb kept; new binary is in the source directory.'
else
  ln -sfn -- "$source_dir/readsb" "$HOME/.local/bin/readsb"
fi
[[ -x "$venv/bin/python" ]] || python3 -m venv "$venv"
"$venv/bin/python" -m pip install "$root/linux-node[all,dji]"
printf '\nDecoder tools ready. Restart the local node, select ADS-B mode, Save, then Start listening.\n'
printf 'DJI recordings: read docs/sdr-decoders.md. No services, sharing settings or radios were changed.\n'

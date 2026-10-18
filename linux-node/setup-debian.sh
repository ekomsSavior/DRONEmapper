#!/usr/bin/env bash
# Optional interactive host setup. Run in your normal terminal, never as root.
# Church of Malware / saviorSEC — AGPL-3.0-or-later.
set -euo pipefail
if (( EUID == 0 )); then
  echo 'Run this script as your normal user; it requests sudo for receiver setup only.' >&2
  exit 1
fi
if [[ $# != 1 || ! "$1" =~ ^[a-zA-Z0-9_.-]{1,15}$ || "$1" == -* ]]; then
  echo 'Usage: bash linux-node/setup-debian.sh DEDICATED_USB_WIFI_INTERFACE' >&2
  exit 1
fi
interface=$1
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
device=$(readlink -f -- "/sys/class/net/$interface/device")
[[ "$device" == */usb* ]] || { echo 'Select a dedicated USB Wi-Fi interface.' >&2; exit 1; }
command -v iw >/dev/null || { echo 'Install iw first: sudo apt install iw' >&2; exit 1; }
link=$(iw dev "$interface" link)
[[ "$link" == 'Not connected.' ]] || { echo 'Refusing to alter an associated interface. Use a spare USB radio.' >&2; exit 1; }
phy=$(basename -- "$(readlink -f -- "/sys/class/net/$interface/phy80211")")
[[ "$phy" =~ ^phy[0-9]+$ ]] || { echo 'Cannot identify the dedicated radio.' >&2; exit 1; }
if iw dev dmmon0 info >/dev/null 2>&1; then
  monitor_phy=$(basename -- "$(readlink -f -- /sys/class/net/dmmon0/phy80211)")
  if [[ "$monitor_phy" == "$phy" ]] && iw dev dmmon0 info | grep -Eq '^[[:space:]]*type monitor$'; then
    echo 'The Panda monitor interface is already configured. Starting the current scanner code.'
    exec bash "$root/linux-node/run-local.sh"
  fi
  echo 'dmmon0 belongs to a different radio or is not a monitor. Review it before changing setup.' >&2
  exit 1
fi
echo "Setting up dedicated $interface ($phy), monitor channel 6, and HackRF receive tools."
echo 'Your normal Internet interface is not changed. Wireshark capture access is granted to your user.'
sudo apt-get install -y python3-venv iw wireshark-common hackrf
printf '%s\n' 'wireshark-common wireshark-common/install-setuid boolean true' | sudo debconf-set-selections
sudo env DEBIAN_FRONTEND=noninteractive dpkg-reconfigure wireshark-common
sudo usermod -aG wireshark "$(id -un)"
if command -v nmcli >/dev/null && nmcli -t -f RUNNING general 2>/dev/null | grep -qx running; then
  sudo nmcli device set "$interface" managed no
fi
sudo ip link set "$interface" down
sudo iw phy "$phy" interface add dmmon0 type monitor
sudo ip link set dmmon0 up
sudo iw dev dmmon0 set channel 6
venv="${XDG_DATA_HOME:-$HOME/.local/share}/dronemapper-venv"
python3 -m venv "$venv"
"$venv/bin/pip" install "$root/linux-node[all]"
"$venv/bin/dronemapper-node" configure --wifi dmmon0 --sdr hackrf --band 2400
echo 'Opening http://127.0.0.1:8790/ — leave this terminal running; Ctrl+C stops it.'
echo "Cleanup after stopping: sudo iw dev dmmon0 del"
echo "If NetworkManager was changed: sudo nmcli device set $interface managed yes"
printf -v launch '%q serve --listen' "$venv/bin/dronemapper-node"
exec sg wireshark -c "$launch"

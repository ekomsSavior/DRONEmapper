#!/usr/bin/env bash
# Optional host change for BlueZ's passive Advertisement Monitor API.
# Church of Malware / saviorSEC — AGPL-3.0-or-later.
set -euo pipefail
if (( EUID == 0 )); then
  echo 'Run as your normal user; this script requests sudo for the BlueZ setting.' >&2
  exit 1
fi
echo 'Enable BlueZ experimental D-Bus APIs for passive Bluetooth reception.'
echo 'Bluetooth will restart briefly. Paired devices may disconnect during restart.'
sudo python3 - <<'PY'
from pathlib import Path
import datetime, os, re, shutil, tempfile
path = Path('/etc/bluetooth/main.conf')
if path.is_symlink() or not path.is_file():
    raise SystemExit('Expected a regular /etc/bluetooth/main.conf; configure BlueZ manually.')
original = path.read_text()
sections = list(re.finditer(r'^\[([^\]\n]+)\]\s*$', original, re.M))
section = next((m for m in sections if m.group(1) == 'General'), None)
if section is None:
    raise SystemExit('No [General] section found; configure BlueZ manually.')
end = next((m.start() for m in sections if m.start() > section.start()), len(original))
body = original[section.end():end]
setting = re.compile(r'^[ \t]*Experimental[ \t]*=.*$', re.M)
body = setting.sub('Experimental = true', body) if setting.search(body) else '\nExperimental = true\n' + body
updated = original[:section.end()] + body + original[end:]
if updated != original:
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = path.with_name('main.conf.dronemapper-backup-' + stamp)
    shutil.copy2(path, backup)
    stat = path.stat()
    fd, temporary = tempfile.mkstemp(prefix='.dronemapper-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(updated)
            out.flush()
            os.fsync(out.fileno())
            os.fchmod(out.fileno(), stat.st_mode & 0o777)
            os.fchown(out.fileno(), stat.st_uid, stat.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Previous configuration saved:', backup)
    print('To restore: sudo cp', backup, path, '&& sudo systemctl restart bluetooth')
else:
    print('Experimental D-Bus APIs are already enabled.')
PY
sudo systemctl restart bluetooth.service
echo 'Bluetooth restarted. The running node retries automatically within 15 seconds.'
echo 'Select your Bluetooth controller in the dashboard if it is not already selected.'

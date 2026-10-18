#!/usr/bin/env python3
"""Package corresponding source only. No network, runtime data or publication."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = ['README.md', 'LICENSE', 'NOTICE.txt', '.gitignore', '.gitattributes', 'server.py', 'data_sources.py',
         'noaa_source.py', 'climateviewer_source.py', 'additional_sources.py', 'oam_source.py', 'avmap_source.py', 'voto_source.py', 'ioos_source.py', 'argo_source.py', 'build_review.py',
         'package.json', 'package-lock.json', 'wrangler.jsonc', 'node_server.py',
         'android-node/README.md', 'android-node/LICENSE', 'android-node/NOTICE.txt',
         'android-node/build.gradle', 'android-node/settings.gradle', 'android-node/gradle.properties',
         'android-node/gradlew', 'android-node/gradlew.bat', 'android-node/app/build.gradle',
         'android-node/build-usb.py', 'linux-node/README.md', 'linux-node/LICENSE',
         'linux-node/NOTICE.txt', 'linux-node/pyproject.toml', 'linux-node/launch.py',
         'linux-node/dronemapper-node.service', 'linux-node/setup-debian.sh', 'linux-node/run-local.sh',
         'linux-node/refresh-catalogs.py', 'linux-node/enable-passive-ble.sh']
DIRECTORIES = ['public', 'docs', 'tests', 'integration', 'worker', 'deploy',
               'android-node/app/src', 'android-node/gradle', 'migrations', 'scripts', 'web',
               'linux-node/dronemapper_node', 'linux-node/tests']


def source_files():
    """Build corresponding source from an allowlist, excluding runtime data."""
    allowed = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        allowed.extend(p for p in (ROOT / directory).rglob('*')
                       if p.is_file() and not p.is_symlink()
                       and '__pycache__' not in p.parts
                       and not any(part.startswith('.') for part in p.relative_to(ROOT).parts)
                       and p.name not in {'source.zip', 'source.zip.tmp'}
                       and p.suffix not in {'.pyc', '.zip', '.apk', '.idsig'})
    return sorted(set(allowed))


def build_linux_archive():
    """Ship the Linux source and setup tools without unrelated map/app files."""
    name = 'DRONEmapper-Linux-0.1.0'
    target = ROOT / 'public/downloads' / (name + '.zip')
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in source_files():
            relative = path.relative_to(ROOT)
            if relative.parts[0] == 'linux-node' or str(relative) in {'docs/linux-node-setup.md', 'docs/sdr-discovery-research.md'}:
                archive.write(path, name + '/' + str(relative))
        archive.writestr(name + '/START-HERE.txt',
            'DRONEmapper Linux 0.1.0 — Church of Malware / saviorSEC\n\n'
            'Read linux-node/README.md and docs/linux-node-setup.md.\n'
            'Debian/Ubuntu with a dedicated USB Wi-Fi adapter:\n'
            '  bash linux-node/setup-debian.sh YOUR_DEDICATED_USB_INTERFACE\n'
            'Use iw dev to find the spare interface. Setup requests sudo.\n'
            'Without Wi-Fi setup: follow the Python virtual-environment steps in the README.\n'
            'Open http://127.0.0.1:8790/ after starting. Sharing is optional.\n')
    checksums = target.parent / 'SHA256SUMS.txt'
    lines = checksums.read_text().splitlines() if checksums.exists() else []
    lines = [line for line in lines if not line.endswith(target.name)]
    lines.append(hashlib.sha256(target.read_bytes()).hexdigest() + '  ' + target.name)
    checksums.write_text('\n'.join(lines) + '\n')


def build_archive():
    build_linux_archive()
    temporary = ROOT / 'public/source.zip.tmp'
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in source_files():
            archive.write(path, 'drone-mapper/' + str(path.relative_to(ROOT)))
    temporary.replace(ROOT / 'public/source.zip')


if __name__ == '__main__':
    build_archive()
    print('Built public/source.zip. No external data, cache or secrets included.')

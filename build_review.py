#!/usr/bin/env python3
"""Package corresponding source only. No network, runtime data or publication."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = ['README.md', 'LICENSE', 'NOTICE.txt', '.gitignore', '.gitattributes', 'server.py', 'data_sources.py',
         'noaa_source.py', 'climateviewer_source.py', 'additional_sources.py', 'oam_source.py', 'avmap_source.py', 'voto_source.py', 'ioos_source.py', 'argo_source.py', 'build_review.py',
         'package.json', 'package-lock.json', 'wrangler.jsonc', 'node_server.py',
         'android-node/README.md', 'android-node/LICENSE', 'android-node/NOTICE.txt',
         'android-node/build.gradle', 'android-node/settings.gradle', 'android-node/gradle.properties',
         'android-node/gradlew', 'android-node/gradlew.bat', 'android-node/app/build.gradle']
DIRECTORIES = ['public', 'docs', 'tests', 'integration', 'worker', 'deploy',
               'android-node/app/src', 'android-node/gradle', 'migrations', 'scripts', 'web']


def build_archive():
    """Build corresponding source from an allowlist, excluding runtime data."""
    allowed = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        allowed.extend(p for p in (ROOT / directory).rglob('*')
                       if p.is_file() and not p.is_symlink()
                       and '__pycache__' not in p.parts
                       and not any(part.startswith('.') for part in p.relative_to(ROOT).parts)
                       and p.name not in {'source.zip', 'source.zip.tmp'}
                       and p.suffix not in {'.pyc', '.zip', '.apk', '.idsig'})
    temporary = ROOT / 'public/source.zip.tmp'
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(set(allowed)):
            archive.write(path, 'drone-mapper/' + str(path.relative_to(ROOT)))
    temporary.replace(ROOT / 'public/source.zip')


if __name__ == '__main__':
    build_archive()
    print('Built public/source.zip. No external data, cache or secrets included.')

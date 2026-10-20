"""Small OS adapters for the desktop node. AGPL-3.0-or-later."""
import os
import errno
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess


def system():
    return platform.system()


def state_directory():
    if system() == 'Windows':
        return Path(os.environ.get('LOCALAPPDATA', Path.home()/'AppData'/'Local'))/'DRONEmapper'/'node'
    if system() == 'Darwin':
        return Path.home()/'Library'/'Application Support'/'DRONEmapper'/'node'
    return Path(os.environ.get('XDG_STATE_HOME', Path.home()/'.local/state'))/'dronemapper-node'


def tool_path(name):
    found = shutil.which(name)
    if found:
        return found
    roots = []
    if system() == 'Windows' and name == 'dumpcap':
        roots = [Path(os.environ.get('ProgramFiles', 'C:/Program Files'))/'Wireshark']
    elif system() == 'Darwin':
        roots = [Path('/opt/homebrew/bin'), Path('/usr/local/bin')]
        if name == 'dumpcap':
            roots.insert(0, Path('/Applications/Wireshark.app/Contents/MacOS'))
    for root in roots:
        found = shutil.which(name, path=str(root))
        if found:
            return found
    return None


def is_link(path):
    info = Path(path).lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def windows_sid():
    command = str(Path(os.environ.get('SystemRoot', 'C:/Windows'))/'System32'/'whoami.exe')
    result = subprocess.run([command, '/user', '/fo', 'csv', '/nh'],
                            capture_output=True, text=True, check=True, timeout=5)
    match = re.search(r'"(S-1-5-[0-9-]+)"', result.stdout)
    if not match:
        raise ValueError('Windows could not identify the current user')
    return match.group(1)


def windows_private_directory(path):
    # Protected DACL: only this user and SYSTEM, inherited by files/subdirectories.
    # SetFileSecurity applies only to the selected node directory, never its parents.
    import ctypes
    from ctypes import wintypes as w
    api = ctypes.WinDLL('advapi32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    api.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [w.LPCWSTR, w.DWORD, ctypes.POINTER(w.LPVOID), ctypes.POINTER(w.DWORD)]
    api.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = w.BOOL
    api.SetFileSecurityW.argtypes = [w.LPCWSTR, w.DWORD, w.LPVOID]
    api.SetFileSecurityW.restype = w.BOOL
    kernel.LocalFree.argtypes = [w.LPVOID]
    kernel.LocalFree.restype = w.LPVOID
    descriptor = w.LPVOID()
    sddl = 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;' + windows_sid() + ')'
    if not api.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ctypes.byref(descriptor), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if not api.SetFileSecurityW(str(path), 0x80000004, descriptor):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        kernel.LocalFree(descriptor)


def private_directory(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if is_link(path) or not path.is_dir():
        raise ValueError('Use a private node directory, not a link')
    if system() == 'Windows':
        if any(path.iterdir()) and not (path/'settings.json').is_file():
            raise ValueError('Choose an empty directory dedicated to this node')
        windows_private_directory(path)
    else:
        if path.stat().st_uid != os.getuid():
            raise ValueError('Use a private state directory owned by your user')
        os.chmod(path, 0o700)


def regular_fd(path):
    """Open local input files without following a symlink or waiting on a FIFO."""
    path = Path(path).expanduser()
    if is_link(path):
        raise OSError(errno.ELOOP, 'Input must not be a link')
    if not path.is_file():
        raise ValueError('Input must be a regular file, not a device')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_BINARY', 0) |
                 getattr(os, 'O_NONBLOCK', 0) | getattr(os, 'O_NOFOLLOW', 0))
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError('Input must be a regular file')
    return fd


def lock_file(path):
    path = Path(path)
    if path.exists() and is_link(path):
        raise ValueError('Node lock must not be a link')
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    stream = os.fdopen(fd, 'r+b', buffering=0)
    try:
        if system() == 'Windows':
            import msvcrt
            if os.fstat(fd).st_size == 0:
                stream.write(b'\0')
            stream.seek(0)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        stream.close()
        raise ValueError('This node is already running; use its dashboard or stop it first') from None
    return stream


def valid_interface(name):
    if not isinstance(name, str):
        return False
    if re.fullmatch(r'[a-zA-Z0-9_.][a-zA-Z0-9_.-]{0,14}', name):
        return True
    # Windows Npcap local adapter name. Never accept rpcap, pipes or remote interfaces.
    return bool(re.fullmatch(r'\\Device\\NPF_\{[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\}', name))


def valid_ble(name):
    return isinstance(name, str) and (name in ('', 'default') or bool(re.fullmatch(r'hci[0-9]{1,3}', name)))

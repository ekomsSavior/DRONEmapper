"""Bounded receiver pipes on POSIX and Windows; terminate only owned processes."""
import ctypes
import os
import queue
import re
import signal
import subprocess
import threading
from .platform_support import system


class WindowsJob:
    """Kill receiver descendants when the owner closes, including a DJI capture child."""
    def __init__(self, process):
        from ctypes import wintypes as w
        class Basic(ctypes.Structure):
            _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                        ('flags', w.DWORD), ('minimum', ctypes.c_size_t), ('maximum', ctypes.c_size_t),
                        ('active', w.DWORD), ('affinity', ctypes.c_size_t),
                        ('priority', w.DWORD), ('scheduling', w.DWORD)]
        class Counters(ctypes.Structure):
            _fields_ = [(x, ctypes.c_uint64) for x in ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', Counters), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        self.api.CreateJobObjectW.argtypes = [w.LPVOID, w.LPCWSTR]
        self.api.CreateJobObjectW.restype = w.HANDLE
        self.api.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, w.LPVOID, w.DWORD]
        self.api.SetInformationJobObject.restype = w.BOOL
        self.api.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.api.AssignProcessToJobObject.restype = w.BOOL
        self.api.CloseHandle.argtypes = [w.HANDLE]
        self.api.CloseHandle.restype = w.BOOL
        self.handle = self.api.CreateJobObjectW(None, None)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = Extended()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.api.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not self.api.AssignProcessToJobObject(self.handle, w.HANDLE(int(process._handle))):
            error = ctypes.WinError(ctypes.get_last_error())
            self.close()
            raise error

    def close(self):
        if self.handle:
            self.api.CloseHandle(self.handle)
            self.handle = None


def process_bytes(command, stop):
    """Yield stdout while draining stderr; queues and diagnostics have fixed limits."""
    windows = system() == 'Windows'
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if windows else {'start_new_session': True}
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, bufsize=0, **options)
    job = None
    readers = []
    done = threading.Event()
    chunks = queue.Queue(maxsize=16)
    errors = bytearray()
    def read(stream, kind):
        try:
            while not done.is_set():
                data = stream.read(65536)
                while not done.is_set():
                    try:
                        chunks.put((kind, data), timeout=.2)
                        break
                    except queue.Full:
                        pass
                if not data:
                    break
        except (OSError, ValueError):
            if not done.is_set():
                while not done.is_set():
                    try:
                        chunks.put((kind, b''), timeout=.2)
                        break
                    except queue.Full:
                        pass
    try:
        if windows:
            job = WindowsJob(child)
        for stream, kind in ((child.stdout, 'out'), (child.stderr, 'err')):
            thread = threading.Thread(target=read, args=(stream, kind), daemon=True)
            thread.start()
            readers.append(thread)
        ended = set()
        while len(ended) < 2 and not stop.is_set():
            try:
                kind, data = chunks.get(timeout=.2)
            except queue.Empty:
                continue
            if not data:
                ended.add(kind)
            elif kind == 'out':
                yield data
            else:
                errors.extend(data)
                del errors[:-2048]
        if not stop.is_set():
            code = child.wait(timeout=3)
            detail = errors.decode(errors='replace').strip().splitlines()
            failures = [line for line in detail if re.search(r'failed|error|not found|invalid|denied|syntax', line, re.I)]
            diagnostic = ' / '.join(failures[:2] or detail[:2]) or 'receiver exited'
            diagnostic = re.sub(r'(?i)(serial\S*\s*[:=]?\s*)\S+', r'\1[hidden]', diagnostic)
            raise RuntimeError(f'Receiver stopped ({code}): {diagnostic[:190]}')
    finally:
        done.set()
        if windows:
            if job:
                job.close()
            elif child.poll() is None:
                child.kill()
        else:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            if windows:
                child.kill()
            else:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            child.wait(timeout=3)
        for stream in (child.stdout, child.stderr):
            stream.close()
        for thread in readers:
            thread.join(timeout=1)

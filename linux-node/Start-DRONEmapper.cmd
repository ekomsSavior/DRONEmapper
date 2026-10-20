@echo off
setlocal
where py >nul 2>nul
if errorlevel 1 (
  echo Install Python 3.10 or newer from python.org, including the Python launcher.
  pause
  exit /b 1
)
py -3 "%~dp0bootstrap.py" %*
if errorlevel 1 pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONIOENCODING=utf-8"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py --open
) else (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py --open
  ) else (
    echo Python 3.11 이상을 설치한 뒤 다시 실행해 주세요.
  )
)
pause

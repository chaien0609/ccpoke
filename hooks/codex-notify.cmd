@echo off
setlocal
call "%USERPROFILE%\.ccpoke\hooks\lib\common.cmd"
if "%~1"=="" (endlocal & exit /b 0)
set TMPFILE=%TEMP%\ccpoke-%RANDOM%%RANDOM%.json
node -e "require('fs').writeFileSync(process.env.TMPFILE,process.argv[1]||'{}')" %*
set TMUX_TARGET=
if defined TMUX_PANE (
  for /f "tokens=*" %%a in ('tmux display-message -t "%TMUX_PANE%" -p "#{session_name}:#{window_index}.#{pane_index}" 2^>nul') do set TMUX_TARGET=%%a
)
if defined TMUX_TARGET (
  powershell -NoProfile -Command "$j=Get-Content '%TMPFILE%' -Raw|ConvertFrom-Json; $j|Add-Member -NotePropertyName tmux_target -NotePropertyValue '%TMUX_TARGET%' -Force; $j|ConvertTo-Json -Compress|Set-Content '%TMPFILE%'"
)
curl.exe -s -X POST http://%CCPOKE_HOST%:%CCPOKE_PORT%/hook/stop?agent=codex -H "Content-Type: application/json" -H "X-CCPoke-Secret: %CCPOKE_SECRET%" -d @%TMPFILE% > nul 2>&1
del %TMPFILE% > nul 2>&1
endlocal

@echo off
setlocal
call "%USERPROFILE%\.ccpoke\hooks\lib\common.cmd"
if not defined TMUX (endlocal & exit /b 0)
set TMPFILE=%TEMP%\ccpoke-%RANDOM%%RANDOM%.json
findstr "^" > %TMPFILE%
for /f "tokens=*" %%s in ('powershell -NoProfile -Command "(Get-Content '%TMPFILE%' -Raw|ConvertFrom-Json).session_id"') do set SESSION_ID=%%s
if not defined SESSION_ID (del %TMPFILE% > nul 2>&1 & endlocal & exit /b 0)
for /f "tokens=*" %%c in ('powershell -NoProfile -Command "(Get-Content '%TMPFILE%' -Raw|ConvertFrom-Json).cwd"') do set CWD_VAL=%%c
set PAYLOAD={"session_id":"%SESSION_ID%","cwd":"%CWD_VAL%","tmux_target":"%CCPOKE_TMUX_TARGET%"}
curl.exe -s -X POST http://%CCPOKE_HOST%:%CCPOKE_PORT%/hook/session-start -H "Content-Type: application/json" -H "X-CCPoke-Secret: %CCPOKE_SECRET%" -d "%PAYLOAD%" > nul 2>&1
del %TMPFILE% > nul 2>&1
endlocal

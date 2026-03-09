@if not defined CCPOKE_PORT (
  if exist "%USERPROFILE%\.ccpoke\hooks\.env.cmd" (
    call "%USERPROFILE%\.ccpoke\hooks\.env.cmd"
  ) else (
    exit /b 0
  )
)
@if not defined CCPOKE_HOST set CCPOKE_HOST=localhost
set CCPOKE_TMUX_TARGET=
if defined TMUX_PANE (
  for /f "tokens=*" %%a in ('tmux display-message -t "%TMUX_PANE%" -p "#{session_name}:#{window_index}.#{pane_index}" 2^>nul') do set CCPOKE_TMUX_TARGET=%%a
)

#!/bin/bash
# ccpoke shared hook library

CCPOKE_ENV_FILE="$HOME/.ccpoke/hooks/.env"
[ -f "$CCPOKE_ENV_FILE" ] || exit 0
. "$CCPOKE_ENV_FILE"

CCPOKE_HOST="${CCPOKE_HOST:-localhost}"

ccpoke_detect_tmux() {
  CCPOKE_TMUX_TARGET=""
  if [ -n "$TMUX_PANE" ]; then
    CCPOKE_TMUX_TARGET=$(tmux display-message -t "$TMUX_PANE" \
      -p '#{session_name}:#{window_index}.#{pane_index}' 2>/dev/null || echo "")
  elif [ -n "$TMUX" ]; then
    CCPOKE_TMUX_TARGET=$(tmux display-message \
      -p '#{session_name}:#{window_index}.#{pane_index}' 2>/dev/null || echo "")
  fi
}

ccpoke_inject_tmux() {
  local json="$1"
  if [ -n "$CCPOKE_TMUX_TARGET" ] && \
     echo "$CCPOKE_TMUX_TARGET" | grep -qE '^[a-zA-Z0-9_.:/@ -]+$'; then
    echo "$json" | sed 's/}$/,"tmux_target":"'"$CCPOKE_TMUX_TARGET"'"}/'
  else
    echo "$json"
  fi
}

ccpoke_post() {
  local route="$1"
  local payload="$2"
  local max_time="${3:-5}"
  echo "$payload" | curl -s -X POST "http://$CCPOKE_HOST:$CCPOKE_PORT$route" \
    -H "Content-Type: application/json" \
    -H "X-CCPoke-Secret: $CCPOKE_SECRET" \
    --data-binary @- --max-time "$max_time" > /dev/null 2>&1 || true
}

ccpoke_json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr -d '\n\r'
}

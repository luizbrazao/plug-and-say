#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   mc_create_task.sh "TITLE" "DESCRIPTION" "assignee1,assignee2"
#
# Example:
#   mc_create_task.sh "Research pricing" "Check competitors" "agent:main:main,agent:seo-analyst:main"

TITLE="${1:-}"
DESC="${2:-}"
ASSIGNEES_CSV="${3:-}"

if [[ -z "$TITLE" || -z "$DESC" ]]; then
  echo "error: missing TITLE or DESCRIPTION" >&2
  echo "usage: mc_create_task.sh \"TITLE\" \"DESCRIPTION\" \"assignee1,assignee2\"" >&2
  exit 2
fi

# Convert CSV -> JSON array
ASSIGNEES_JSON="[]"
if [[ -n "$ASSIGNEES_CSV" ]]; then
  # shell-safe transform, supports spaces after commas
  IFS=',' read -r -a ARR <<< "$ASSIGNEES_CSV"
  # Build JSON manually (safe enough for sessionKeys)
  ASSIGNEES_JSON="["
  first=1
  for raw in "${ARR[@]}"; do
    key="$(echo "$raw" | xargs)" # trim
    [[ -z "$key" ]] && continue
    if [[ $first -eq 0 ]]; then ASSIGNEES_JSON+=", "; fi
    first=0
    ASSIGNEES_JSON+="\"$key\""
  done
  ASSIGNEES_JSON+="]"
fi

# Find your mission-control repo automatically (common locations):
# 1) current dir
# 2) ~/mission-control
# 3) env override MISSION_CONTROL_DIR
MC_DIR="${MISSION_CONTROL_DIR:-}"

if [[ -z "$MC_DIR" ]]; then
  if [[ -f "package.json" ]] && [[ -d "convex" ]]; then
    MC_DIR="$(pwd)"
  elif [[ -d "$HOME/mission-control" ]]; then
    MC_DIR="$HOME/mission-control"
  elif [[ -d "$HOME/mission-control/mission-control" ]]; then
    MC_DIR="$HOME/mission-control/mission-control"
  else
    echo "error: could not locate mission-control repo. Set MISSION_CONTROL_DIR." >&2
    exit 3
  fi
fi

cd "$MC_DIR"

ARGS=$(cat <<JSON
{
  "title": "$(printf "%s" "$TITLE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')",
  "description": "$(printf "%s" "$DESC" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')",
  "assigneeSessionKeys": $ASSIGNEES_JSON
}
JSON
)

# Call Convex mutation
npx convex run tasks:create "$ARGS"

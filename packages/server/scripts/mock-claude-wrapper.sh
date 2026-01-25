#!/bin/sh
# Wrapper script to run mock-claude.mjs
# This allows PodmanClaudeRunner to use mock-claude.mjs via claudePath
exec node "$(dirname "$0")/mock-claude.mjs" "$@"

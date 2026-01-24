#!/bin/bash
set -e

# Git identity configuration (if environment variables provided)
if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
fi

if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
fi

# Setup gh auth for git credential helper (if gh is authenticated)
if command -v gh &> /dev/null && gh auth status &> /dev/null 2>&1; then
    gh auth setup-git 2>/dev/null || true
fi

# Configure git to use HTTPS instead of SSH for GitHub
# (Avoids SSH key permission issues in container)
git config --global url."https://github.com/".insteadOf "git@github.com:" 2>/dev/null || true

exec "$@"

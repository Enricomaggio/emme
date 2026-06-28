#!/usr/bin/env sh
# Blocca il commit se entrano file .env o chiavi/segreti in chiaro.
staged=$(git diff --cached --name-only --diff-filter=ACM)

env_staged=$(printf '%s\n' "$staged" | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$' || true)
if [ -n "$env_staged" ]; then
  echo "[BLOCCATO] file .env in staging (contiene segreti):"
  printf '   %s\n' $env_staged
  echo "   Aggiungilo a .gitignore e togli dallo staging: git rm --cached <file>"
  exit 1
fi

if git diff --cached -U0 --diff-filter=ACM \
  | grep -nE 'sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' >/dev/null 2>&1; then
  echo "[BLOCCATO] possibile chiave/segreto in chiaro nei file in staging."
  echo "   Sposta i segreti in .env (gitignored) e ricommitta."
  exit 1
fi
exit 0

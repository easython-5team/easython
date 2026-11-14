#!/usr/bin/env bash
# Runs on the EC2 server. Reads a tar.gz of the source on stdin, replaces the
# app folder (keeping node_modules and the build cache), builds, and restarts.
# The SQLite file lives in /srv/easython/data, outside the app folder, so it is
# never touched by a deploy.
set -euo pipefail

APP=/srv/easython/app
cd "$APP"

find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .next -exec rm -rf {} +
tar -xz

npm ci --no-audit --no-fund
# t3.micro has 1 GB of RAM (plus swap); give the build room.
NODE_OPTIONS=--max-old-space-size=1536 npm run build

sudo systemctl restart easython

# Wait until the app answers again.
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "deployed"
    exit 0
  fi
  sleep 2
done
echo "app did not come back up" >&2
sudo journalctl -u easython --no-pager -n 40 >&2
exit 1

#!/usr/bin/env bash
# Runs on the EC2 server. Reads the compressed standalone build (made in CI) on
# stdin, unpacks it into a new release folder, points /srv/easython/current at
# it, and restarts. Nothing is installed or built here.
# The SQLite file lives in /srv/easython/data and is never touched by a deploy.
set -euo pipefail

ROOT=/srv/easython
RELEASE="$ROOT/releases/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$RELEASE"
tar -xz -C "$RELEASE"

# The service runs the bundled server.js from the current release.
UNIT=$(cat <<EOF
[Unit]
Description=easython (Next.js standalone)
After=network.target
[Service]
User=ec2-user
WorkingDirectory=$ROOT/current
EnvironmentFile=$ROOT/env
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/local/bin/node $ROOT/current/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
)
if [ "$UNIT" != "$(cat /etc/systemd/system/easython.service 2>/dev/null)" ]; then
  printf '%s\n' "$UNIT" | sudo tee /etc/systemd/system/easython.service >/dev/null
  sudo systemctl daemon-reload
fi

PREVIOUS=$(readlink "$ROOT/current" || true)
ln -sfn "$RELEASE" "$ROOT/current"
sudo systemctl restart easython

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    # Keep the last three releases for a quick rollback.
    ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
    echo "deployed $RELEASE"
    exit 0
  fi
  sleep 1
done

echo "app did not come back up; rolling back" >&2
sudo journalctl -u easython --no-pager -n 40 >&2
if [ -n "$PREVIOUS" ]; then
  ln -sfn "$PREVIOUS" "$ROOT/current"
  sudo systemctl restart easython
fi
exit 1

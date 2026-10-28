#!/usr/bin/env bash
# One-command setup for FlightNMI with Gmail email alerts.
# Run from the repository folder on the machine that will stay on:
#     bash scripts/setup.sh
# It asks for your Gmail address and app password, generates the admin
# token, writes .env, starts the service with Docker and checks it is up.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n%s\n' "$*"; }
ask() { local v; read -r -p "$1" v; printf '%s' "$v"; }

say "FlightNMI setup (email alerts through Gmail)"

if [ -f .env ]; then
  say ".env already exists."
  case "$(ask "Overwrite it and start again? [y/N] ")" in y|Y) ;; *) say "Keeping .env. To start the service: docker compose up -d --build"; exit 0 ;; esac
fi

# --- Docker ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Docker is not installed. It is needed to run the service."
  case "$(ask "Install Docker now with the official script (needs sudo)? [Y/n] ")" in n|N) say "Install Docker, then run this script again."; exit 1 ;; esac
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  say "Docker installed. Log out and back in once so your user can run docker, then run this script again."
  exit 0
fi
if ! docker compose version >/dev/null 2>&1; then
  say "Docker is installed but 'docker compose' is missing. Install the Docker Compose plugin and run this script again."
  exit 1
fi

# --- Gmail ----------------------------------------------------------------
say "Gmail account that will SEND the alerts."
say "You need an App Password: turn on 2-Step Verification, then create one at https://myaccount.google.com/apppasswords"
until GMAIL=$(ask "Gmail address: ") && [[ "$GMAIL" == *@* ]]; do echo "That does not look like an email address."; done
until { read -r -s -p "App password (16 characters; spaces are fine, nothing is shown while typing): " APP_PASS; echo; APP_PASS="${APP_PASS// /}"; [ ${#APP_PASS} -ge 16 ]; }; do echo "An app password is 16 characters long."; done

# --- Address of this machine ---------------------------------------------
IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
DEFAULT_URL="http://${IP:-localhost}:8080"
URL=$(ask "Address people will use to open the status page [${DEFAULT_URL}]: ")
URL="${URL:-$DEFAULT_URL}"

# --- Admin token ------------------------------------------------------------
if command -v openssl >/dev/null 2>&1; then TOKEN=$(openssl rand -hex 24); else TOKEN=$(docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"); fi

# --- Write .env -------------------------------------------------------------
umask 077
cat > .env <<ENV
# Written by scripts/setup.sh on $(date -u +%Y-%m-%dT%H:%MZ). Edit any time, then: docker compose up -d --build
PORT=8080
ADMIN_TOKEN=${TOKEN}
PUBLIC_URL=${URL}
POLL_SECONDS=20
NOTICE_MINUTES=20

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${GMAIL}
SMTP_PASS=${APP_PASS}
EMAIL_FROM="FlightNMI <${GMAIL}>"
ENV
say "Settings written to .env (readable only by you)."

# --- Start ------------------------------------------------------------------
say "Building and starting the service. The first build takes a minute or two."
docker compose up -d --build

printf 'Waiting for the service to answer'
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8080/api/status >/dev/null 2>&1; then UP=1; break; fi
  printf '.'; sleep 2
done
echo
if [ -z "${UP:-}" ]; then
  say "The service did not answer on port 8080. Look at the log with:  docker compose logs"
  exit 1
fi

if docker compose logs 2>/dev/null | grep -q "smtp ok"; then
  say "Gmail login worked."
elif docker compose logs 2>/dev/null | grep -q "smtp check failed"; then
  say "WARNING: Gmail login failed. Check the address and app password in .env, then run: docker compose up -d --build"
  docker compose logs 2>/dev/null | grep "smtp check failed" | tail -1
fi

say "Done. The service is running and restarts itself after a reboot."
cat <<MSG

  Status page : ${URL}/
  Admin page  : ${URL}/admin
  Admin token : ${TOKEN}

Next: open the admin page, sign in with the token, add up to three people
(name + email), and press "Send a test message" for each.

Useful commands (run in this folder):
  docker compose logs -f           watch what it is doing
  docker compose restart           restart it
  git pull && docker compose up -d --build     update to the latest version
MSG

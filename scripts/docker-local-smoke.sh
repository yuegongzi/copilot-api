#!/usr/bin/env bash

set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-copilot-api-local-smoke:test}"
CONTAINER_NAME="${CONTAINER_NAME:-copilot-api-local-smoke}"
PORT="${PORT:-4242}"
PASSWORD="${LOCAL_ACCESS_PASSWORD:-bridge-secret}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-copilot-api-compose-smoke}"
COMPOSE_PORT="${COMPOSE_PORT:-4244}"
COMPOSE_CONTAINER_NAME="${COMPOSE_CONTAINER_NAME:-${COMPOSE_PROJECT_NAME}-copilot-api}"

compose_cmd() {
  LOCAL_ACCESS_PASSWORD="${PASSWORD}" \
    HOST_PORT="${COMPOSE_PORT}" \
    PORT="${COMPOSE_PORT}" \
    IMAGE="${IMAGE_TAG}" \
    CONTAINER_NAME="${COMPOSE_CONTAINER_NAME}" \
    docker compose -p "${COMPOSE_PROJECT_NAME}" "$@"
}

cleanup() {
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  compose_cmd down -v >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "Building Docker image: ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" .

echo "Checking fail-closed startup without LOCAL_ACCESS_PASSWORD"
set +e
docker run --rm \
  -e PORT=4243 \
  -e HOST=0.0.0.0 \
  -e LOCAL_ACCESS_MODE=container-bridge \
  -e XDG_DATA_HOME=/data \
  "${IMAGE_TAG}" \
  >/tmp/copilot-api-docker-negative.log 2>&1
negative_status=$?
set -e

if [[ "${negative_status}" -eq 0 ]]; then
  echo "Expected startup without LOCAL_ACCESS_PASSWORD to fail"
  cat /tmp/copilot-api-docker-negative.log
  exit 1
fi

grep -q "LOCAL_ACCESS_PASSWORD is required" /tmp/copilot-api-docker-negative.log

echo "Starting localhost-published container with container-bridge auth"
docker run --rm -d \
  --name "${CONTAINER_NAME}" \
  -p "127.0.0.1:${PORT}:${PORT}" \
  -e PORT="${PORT}" \
  -e HOST=0.0.0.0 \
  -e LOCAL_ACCESS_MODE=container-bridge \
  -e LOCAL_ACCESS_PASSWORD="${PASSWORD}" \
  -e XDG_DATA_HOME=/data \
  "${IMAGE_TAG}" \
  >/tmp/copilot-api-docker-run.log

for _ in $(seq 1 18); do
  health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER_NAME}")"

  if [[ "${health_status}" == "healthy" ]]; then
    break
  fi

  if [[ "${health_status}" == "unhealthy" ]]; then
    echo "Container became unhealthy"
    docker logs --tail 100 "${CONTAINER_NAME}"
    exit 1
  fi

  sleep 5
done

health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER_NAME}")"
if [[ "${health_status}" != "healthy" ]]; then
  echo "Container did not become healthy in time (status=${health_status})"
  docker logs --tail 100 "${CONTAINER_NAME}"
  exit 1
fi

admin_status="$(
  curl -sS -o /tmp/copilot-api-admin.out -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/admin"
)"
if [[ "${admin_status}" != "401" ]]; then
  echo "Expected /admin without auth to return 401, got ${admin_status}"
  cat /tmp/copilot-api-admin.out
  exit 1
fi

token_unauth_status="$(
  curl -sS -o /tmp/copilot-api-token-unauth.out -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/token"
)"
if [[ "${token_unauth_status}" != "401" ]]; then
  echo "Expected /token without auth to return 401, got ${token_unauth_status}"
  cat /tmp/copilot-api-token-unauth.out
  exit 1
fi

token_status="$(
  curl -sS -u "copilot:${PASSWORD}" -o /tmp/copilot-api-token.out -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/token"
)"
if [[ "${token_status}" != "200" ]]; then
  echo "Expected /token with auth to return 200, got ${token_status}"
  cat /tmp/copilot-api-token.out
  exit 1
fi

python3 - <<'PY'
import json
from pathlib import Path

payload = json.loads(Path("/tmp/copilot-api-token.out").read_text())
if not isinstance(payload, dict):
    raise SystemExit("Expected /token response to be a JSON object")
PY

echo "Docker localhost smoke passed"

echo "Starting docker compose localhost smoke"
compose_cmd up -d

compose_container_id="$(compose_cmd ps -q copilot-api)"
if [[ -z "${compose_container_id}" ]]; then
  echo "Failed to resolve docker compose container id"
  compose_cmd ps
  exit 1
fi

for _ in $(seq 1 18); do
  compose_health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${compose_container_id}")"

  if [[ "${compose_health_status}" == "healthy" ]]; then
    break
  fi

  if [[ "${compose_health_status}" == "unhealthy" ]]; then
    echo "Compose container became unhealthy"
    docker logs --tail 100 "${compose_container_id}"
    exit 1
  fi

  sleep 5
done

compose_health_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${compose_container_id}")"
if [[ "${compose_health_status}" != "healthy" ]]; then
  echo "Compose container did not become healthy in time (status=${compose_health_status})"
  docker logs --tail 100 "${compose_container_id}"
  exit 1
fi

compose_admin_status="$(
  curl -sS -o /tmp/copilot-api-compose-admin.out -w "%{http_code}" \
    "http://127.0.0.1:${COMPOSE_PORT}/admin"
)"
if [[ "${compose_admin_status}" != "401" ]]; then
  echo "Expected compose /admin without auth to return 401, got ${compose_admin_status}"
  cat /tmp/copilot-api-compose-admin.out
  exit 1
fi

compose_token_status="$(
  curl -sS -u "copilot:${PASSWORD}" -o /tmp/copilot-api-compose-token.out -w "%{http_code}" \
    "http://127.0.0.1:${COMPOSE_PORT}/token"
)"
if [[ "${compose_token_status}" != "200" ]]; then
  echo "Expected compose /token with auth to return 200, got ${compose_token_status}"
  cat /tmp/copilot-api-compose-token.out
  exit 1
fi

python3 - <<'PY'
import json
from pathlib import Path

payload = json.loads(Path("/tmp/copilot-api-compose-token.out").read_text())
if not isinstance(payload, dict):
    raise SystemExit("Expected compose /token response to be a JSON object")
PY

compose_cmd down -v >/dev/null 2>&1 || true

echo "Docker compose localhost smoke passed"

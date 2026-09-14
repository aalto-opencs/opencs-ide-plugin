#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)
default_coding_root=$(CDPATH= cd -- "$repository_root/../../../.." && pwd -P)
introcs_dir=${AALTO_OPENCS_INTROCS_DIR:-"$default_coding_root/introcs"}

with_test_course=false
detached=false

usage() {
  cat <<'EOF'
Usage: ./scripts/start-local-platform.sh [options]

Start the local IntroCS platform with Docker-backed code execution and grading.

Options:
  --with-test-course  Include the local IDE integration-test course overlay.
  --detach, -d        Start the containers in the background.
  --help, -h          Show this help.

Set AALTO_OPENCS_INTROCS_DIR to override the default IntroCS repository path.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-test-course)
      with_test_course=true
      ;;
    --detach|-d)
      detached=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

combined_compose="$introcs_dir/docker-compose-with-executor.yml"
executor_compose="$introcs_dir/../executor-and-grader/docker-compose.yml"
test_course_compose="$introcs_dir/docker-compose.with-test-course.yml"

if [ ! -f "$combined_compose" ]; then
  echo "Missing IntroCS compose file: $combined_compose" >&2
  echo "Set AALTO_OPENCS_INTROCS_DIR if IntroCS is stored elsewhere." >&2
  exit 1
fi

if [ ! -f "$executor_compose" ]; then
  echo "Missing sibling executor-and-grader repository: $executor_compose" >&2
  exit 1
fi

if "$with_test_course" && [ ! -f "$test_course_compose" ]; then
  echo "Missing local test-course overlay: $test_course_compose" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with Compose v2 is required." >&2
  exit 1
fi

compose_args=(-f docker-compose-with-executor.yml)
if "$with_test_course"; then
  compose_args+=(-f docker-compose.with-test-course.yml)
fi

up_args=(up --build)
if "$detached"; then
  up_args+=(-d)
fi

services=(
  opencs-ui
  opencs-api
  database
  flyway
  valkey
  traefik
  docker-exec-api
)

echo "Starting the local platform from $introcs_dir"
cd "$introcs_dir"
exec docker compose "${compose_args[@]}" "${up_args[@]}" "${services[@]}"

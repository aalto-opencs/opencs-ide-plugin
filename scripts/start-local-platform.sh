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
After the platform is ready, the IntroCS demo users are created. With
--with-test-course, every loaded course is also made available in the IDE for
both demo users.

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

  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required to read the platform's active courses." >&2
    exit 1
  fi

  # The platform's current active courses plus the local test course.
  OPENCS_ACTIVE_COURSES=$(
    node --input-type=module -e '
      const { ACTIVE_COURSES } = await import(process.argv[1]);
      console.log([...new Set([...ACTIVE_COURSES, "test-course"])].join(","));
    ' "$introcs_dir/shared/src/constants.js"
  )
  export OPENCS_ACTIVE_COURSES
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

db_data_dir="$introcs_dir/introcs_psql_data"

query_database() {
  docker exec -e PGPASSWORD=dev_password csfoundations-postgres psql \
    --host=database --username=dev_user --dbname=csfoundations \
    -At -c "$1" 2>/dev/null
}

# Waits for the API and course import, then creates the demo users and, with
# the test course, makes every loaded course available in the IDE.
set_up_demo_data() {
  local deadline=$((SECONDS + 1200))

  until curl --silent --fail http://localhost:8842/api/status >/dev/null &&
    query_database "SELECT 1 FROM users LIMIT 0" >/dev/null &&
    { ! "$with_test_course" ||
      [ "$(query_database "SELECT COUNT(*) FROM courses WHERE slug = 'test-course'")" = "1" ]; }; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "[setup] Timed out waiting for the platform; demo data was not created." >&2
      return 1
    fi
    sleep 5
  done

  echo "[setup] Creating demo users..."
  bash "$introcs_dir/scripts/add-demo-users.sh"

  if "$with_test_course"; then
    echo "[setup] Making local courses available in the IDE..."
    bash "$introcs_dir/scripts/configure-test-course-for-ide.sh"
  fi

  echo "[setup] Demo data ready."
}

echo "Starting the local platform from $introcs_dir"

cd "$introcs_dir"

echo "Stopping existing local platform..."
docker compose "${compose_args[@]}" down --remove-orphans

case "$db_data_dir" in
  */introcs_psql_data)
    echo "Deleting old local PostgreSQL database: $db_data_dir"
    rm -rf -- "$db_data_dir"
    ;;
  *)
    echo "Refusing to delete unexpected database path: $db_data_dir" >&2
    exit 1
    ;;
esac

echo "Starting fresh local platform..."

if "$detached"; then
  docker compose "${compose_args[@]}" "${up_args[@]}" "${services[@]}"
  set_up_demo_data
  exit
fi

set_up_demo_data &

exec docker compose "${compose_args[@]}" "${up_args[@]}" "${services[@]}"
#!/usr/bin/env bash

# OpenProject's own server on a runtime other than DDEV (Docker Compose, Podman, Kubernetes): the web container is the publisher's image
# with the workspace's layer, and runs this as the host user from the project's root (rt_serve) once the project's
# PostgreSQL takes connections. The database is loaded (or migrated) and seeded first, then the background worker
# starts beside the web server. Written by the OpenProject builder of the workspace; build again rather than editing.

set -a ;
# shellcheck disable=SC1091
. "$(dirname "$0")/env" || exit 1 ;
set +a ;
# The attachments' folder, in the project folder on a site built since the plugin keeps them there (its env says so).
mkdir -p "${OPENPROJECT_ATTACHMENTS__STORAGE__PATH:-/var/openproject/assets/files}" || exit 1 ;
cd "${APP_PATH:-/app}" || exit 1 ;
./docker/prod/migrate || exit 1 ;
./docker/prod/seeder --skip-migrate || exit 1 ;
# The background jobs (mail, notifications, copies) beside the web server; it stops with the container.
bundle exec good_job start &
exec ./docker/prod/web

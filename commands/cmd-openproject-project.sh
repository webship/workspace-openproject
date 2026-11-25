#!/usr/bin/env bash

# workspace-name: OpenProject (project management)

# Installed by the OpenProject plugin (plugins.sh --install openproject); __WORKSPACE__ is the workspace it was
# installed into.
#
# Build an OpenProject site in containers from the publisher's image, on the project's own PostgreSQL: on DDEV at
# https://<name>.ddev.site (the default), or on Docker Compose with --runtime docker at http://127.0.0.1:<port>. With
# --install the workspace account is an administrator of the site; with --add-users the default accounts are members
# of the project Webship site; with --sample-content its work packages, its active sprint and a comment.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="openproject";
distribution_title="OpenProject";

ARGPARSE_DESCRIPTION="Build an ${distribution_title} site in __WORKSPACE__"
# The args file comes with the plugin: core/scripts/plugins/openproject/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/openproject/args/arg-openproject.sh || exit 1 ;

shift $#;

openproject_build ;

#!/usr/bin/env bash

# Installed by the OpenProject plugin (plugins.sh --install openproject); __WORKSPACE__ is the workspace it was
# installed into.
#
# An OpenProject site of this folder: what it is and its accounts; --run one of OpenProject's own tasks in its
# container; --add-users and --cancel-users the default accounts; --sample-content the sample content; --tidy what a
# stopped test run left; --connect the dashboard's OpenProject to this site.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

ARGPARSE_DESCRIPTION="An OpenProject site of __WORKSPACE__: what it is, its accounts, OpenProject's own tasks"
# The args file comes with the plugin: core/scripts/plugins/openproject/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/openproject/args/arg-openproject-cli.sh || exit 1 ;

shift $#;

openproject_cli_tool ;

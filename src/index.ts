/**
 * OpenProject for Webship Workspace: a platform plugin and a provider of the tracker family.
 *
 * What the package carries is placed by the installer from the manifest: the builder and the tool in the sites
 * folders, their functions and argparse under core/scripts/plugins/openproject/ (with the compose file of OpenProject's
 * service, the Rails runner script the builder runs in its container, the start of a site on Docker Compose and the
 * first feature of a site), and its AI items (ai/ in this package) in the folder of their kind.
 *
 * What register() adds: the work packages of an OpenProject as work items (@webship.co/workspace-tracker): the
 * OPENPROJECT menu on the project rows of sites and code folders that work against an OpenProject project, the list,
 * one work package, analyze, do the work with the workspace's AI CLI on a branch, and, with writes on, a comment, a
 * worklog, a move and an assignee, each a person's click after a preview. And what the assistant is told.
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from the dashboard's own
 * files, so it can be installed from npm and removed without a trace.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { registerTracker } from '@webship.co/workspace-tracker';

import { openprojectTracker } from './lib/tracker';

export { openprojectTracker };

/** The plugin's name: a site is a generic project in containers that the plugin claims, and the core's tools call its functions under it. */
export const PLATFORM = 'openproject';

/** The commands the installer places in every sites folder. */
export const COMMANDS = ['cmd-openproject-project.sh', 'cmd-tools-openproject-cli.sh'];

/** The agents the installer places in the AI Agents folder. */
export const AGENTS = ['openproject-site-builder', 'openproject-tester', 'openproject-work-package-worker'];

/** The skill the installer places in the AI Skills folder (a folder each, with its SKILL.md). */
export const SKILLS = ['openproject-scenarios'];

/** The slash command the installer places in the AI Commands folder. */
export const AI_COMMANDS = ['openproject-test'];

/** The prompts the installer places in the AI Prompts folder: each a whole launch command for a new session. */
export const PROMPTS = ['openproject-build-and-test', 'openproject-work-package-to-branch'];

/** What the assistant is told about OpenProject sites in this workspace (the work packages are told by the tracker). */
export function assistantContext(): string {
  return [
    'OpenProject (a plugin, @webship.co/workspace-openproject), the open-source project management software: a site is built with',
    '`bash cmd-openproject-project.sh <name> --install --add-users --sample-content` from a sites folder (dev, test, sandboxes, demos):',
    'the publisher\'s image (17.9.8 by default, `--openproject-version`) on the project\'s own PostgreSQL, on DDEV at https://<name>.ddev.site, or with `--runtime docker` on Docker Compose at http://127.0.0.1:<port>.',
    '`--install` makes the workspace account an administrator; `--add-users` adds the default accounts (owner: Project admin, member: Member, reader: Reader of the project Webship site, stranger: no membership), each @example.com;',
    '`--sample-content` adds the work packages of Webship site, its active sprint "Sprint 1" and a comment.',
    '`bash cmd-tools-openproject-cli.sh <name>` says what the site is and lists its accounts; `--run "<task>"` runs one of OpenProject\'s own rake tasks in its container,',
    '`--sample-content` adds the sample content later, `--tidy` removes the work packages a stopped test run left ("Webship test …"), `--add-users` and `--cancel-users` manage the default accounts,',
    'and `--connect <login>` points the dashboard\'s OpenProject at the site as that account (a new API token in the plugin\'s settings, never shown).',
    '`bash cmd-tools-testing.sh <name>` sets up webship-js with the OpenProject step pack; `--run` runs the suite.',
    `For OpenProject sites hand over to the agent \`${AGENTS[0]}\`, for testing one to \`${AGENTS[1]}\`, for working a work package to \`${AGENTS[2]}\`.`,
    `The plugin also places the skill ${SKILLS.map((a) => `\`${a}\``).join(', ')} (the step pack's phrases, by area) in ai-skills/,`,
    `the command ${AI_COMMANDS.map((a) => `\`/${a} <site>\``).join(', ')} in ai-commands/ and the prompts ${PROMPTS.map((a) => `\`${a}\``).join(' and ')} in ai-prompts/.`,
    'Never run OpenProject\'s tools on the host for a project; removing the project removes its database and its files too.',
  ].join(' ');
}

export function register(api: PluginApi): void {
  registerTracker(api, openprojectTracker(api));
  if (typeof api.addAssistantContext === 'function') api.addAssistantContext(assistantContext);
}

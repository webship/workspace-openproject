# @webship.co/workspace-openproject

OpenProject, the open-source project management software, for the [Webship Workspace](https://github.com/webship/workspace),
a container-based workspace (DDEV by default). The plugin brings:

- **a builder**, `cmd-openproject-project.sh`: a real OpenProject site from the publisher's image on the project's own
  PostgreSQL, on DDEV (the default) or on Docker Compose, with its default accounts as members of a sample project, and
  its work packages and active sprint;
- **a tool**, `cmd-tools-openproject-cli.sh`: what a site is and its accounts, OpenProject's own tasks in its container,
  the default accounts, the sample content, a clean-up after a stopped test run, and the dashboard's connection;
- **the step pack** [`@webship-js/openproject-steps`](https://github.com/webship/openproject-steps) wired into the
  workspace's testing setup, with a first feature for a site;
- **the work packages as work items** of the tracker family
  ([`@webship.co/workspace-tracker`](https://github.com/webship/workspace-tracker)): the OPENPROJECT menu on a project
  row lists them, reads one, analyzes it, and lets the workspace's AI CLI work it on a branch, with a person in charge;
- **AI items** in their folders: three agents, a skill, a command and two prompts.

## Install

From the workspace's root, the same four steps as Settings → Plugins:

```bash
bash core/scripts/plugins.sh --require @webship.co/workspace-openproject
bash core/scripts/plugins.sh --activate openproject --with-needs
bash core/scripts/plugins.sh --install openproject --with-needs
bash core/scripts/plugins.sh --configure openproject
```

## What it needs

- A sites folder: one of the `dev`, `test`, `sandboxes` or `demos` plugins. The commands are placed there.
- The AI folders `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`, where its AI items land.
- A container runtime: DDEV, or Docker with the workspace's container runtimes (`--runtime docker`).
- About 2 GB of disk for the image the first time, and about 2 GB of memory for a running site.

## Build a site

```bash
cd ~/workspace/sandboxes                      # or dev, test, demos
bash cmd-openproject-project.sh mysite --install --add-users --sample-content
bash cmd-openproject-project.sh mysite --install --add-users --runtime docker
```

| Flag | What it does |
| --- | --- |
| `--install` | The workspace account (`account` of `core/config/settings.yml`) becomes an administrator of the site. OpenProject asks a password of at least ten characters |
| `--add-users` | With `--install`: the default accounts, each a member of the project Webship site in its role |
| `--sample-content` | With `--install --add-users`: the work packages of Webship site, its active sprint "Sprint 1" and a comment |
| `--openproject-version <x.y.z>` | The release of the publisher's image: 17.9.8 by default |
| `--runtime ddev` or `--runtime docker` | DDEV (the default, or `container.runtime` of `settings.yml`) or Docker Compose |
| `--launch` | Open the site when it is ready |

A project of the same name is deleted first, with its database and its files.

- **On DDEV** OpenProject's all-in-one image (its web server, background worker and cache) is a service of a generic
  project, on the project's PostgreSQL 17, at `https://mysite.ddev.site`. The project's web container keeps the mail
  catcher, at `https://mysite.ddev.site:8026`, and OpenProject sends its mail there.
- **On Docker Compose** the publisher's image is the web container's (the workspace's generic stack), on the project's
  PostgreSQL 17, at `http://127.0.0.1:<port>`; the build says the address. The site's server and background worker run
  as your user; its attachments are kept in the project folder.
- Podman, Kubernetes, Lando and Docksal are not proven for OpenProject yet: asked for one, the builder says so and
  changes nothing.

The site's own values, its secret key and the password of its first administrator (`admin`), are made for it and kept
in `openproject/env` of the project, which only you can read. The builder never prints them.

### The default accounts

| Account | Address | Role in Webship site |
| --- | --- | --- |
| `owner` | `owner@example.com` | Project admin |
| `member` | `member@example.com` | Member |
| `reader` | `reader@example.com` | Reader |
| `stranger` | `stranger@example.com` | No membership: the project is not open to it |

Each has the password of the workspace's other default lists, `dD.123123ddd`, and its first login is done (no welcome
dialog). They are configuration: a test suite never creates or deletes one. `bash cmd-tools-add-users.sh mysite
openproject` and `bash cmd-tools-cancel-users.sh mysite openproject` (the row's Tests menu) add them and lock them.

### The sample content

In Webship site (`webship-site`): "The greeting script says Helo instead of Hello" (a Task by the owner, In progress,
assigned to the member, in the active sprint "Sprint 1", with a comment), "The usage page spells greeting as greting"
(a Bug by the member) and "A work package opened by someone outside the project" (opened by the stranger: the tracker
treats it as from outside the project).

## The tool

```bash
bash cmd-tools-openproject-cli.sh mysite                              # what the site is: release, address, accounts
bash cmd-tools-openproject-cli.sh mysite --run "db:migrate:status"    # one of OpenProject's own tasks, in its container
bash cmd-tools-openproject-cli.sh mysite --sample-content             # the sample content, where it is missing
bash cmd-tools-openproject-cli.sh mysite --tidy                       # the work packages a stopped test run left
bash cmd-tools-openproject-cli.sh mysite --add-users                  # the default accounts and their memberships
bash cmd-tools-openproject-cli.sh mysite --cancel-users               # lock them
bash cmd-tools-openproject-cli.sh mysite --connect member             # the dashboard reads this site as member
```

`--connect <login>` makes a new API token of the account (the ones it made before for that account are revoked) and
writes it, with the site's address, into `core/config/plugin.openproject.settings.yml`, and the sample project as the
default one when none was set. The token is never shown.

## The work packages as work items

The plugin is a provider of the tracker family. With an OpenProject address and an API token in its settings
(`--connect` writes both for a site the workspace built; for your own OpenProject, make a token in My account → Access
tokens → API), the project rows of sites and code folders carry the **OPENPROJECT** menu, once they have an OpenProject
project to work against (`default_scope`, or one remembered from the list):

- **The list**: the open work packages, mine, assigned to someone, the current sprint, and a search.
- **One work package**: its text, its author and the last editor of its description, each with their standing, and
  its comments.
- **Analyze**: the AI CLI reads it and proposes a plan, with reading tools only.
- **Do the work**: the AI CLI works it on a new branch of the project (or a worktree), made from the default branch
  of the project's remote, in a screen session you watch. The work package is saved as data, never as instructions.
- **Result**: the branch, its commits and the notes, the reviewer role, and the comment to post.
- With writes on (`allow_writes: true`): a comment, a worklog (a time entry), a move through the workflow (the
  statuses OpenProject allows from where the work package is) and an assignee, each your click after a preview.

OpenProject opens no pull request: push the branch and open its pull request from the project's forge menu (GITHUB,
GITLAB) when its remote is on a forge.

**Who is inside.** A Project admin and a Member of the project are inside; so is an administrator of the site. A
Reader, another role, and an account with no membership are outside: their work packages are analyze only unless you
confirm one by its author's name (`outsider_items: refuse` refuses them).

**Credentials.** The token travels in a file only you can read, never on a command line. Before anything is posted,
the text is checked for credentials: the shapes of OpenProject's own tokens (`opapi-`, `opal-`, `opbk-`, `opical-`),
the ones the tracker family knows, and the token of the settings.

### Settings

`core/config/plugin.openproject.settings.yml` (Settings → Plugins → OpenProject):

| Key | What it is |
| --- | --- |
| `url` | The OpenProject address, without a trailing slash |
| `token` | An API token of the account the dashboard reads (and, with writes on, writes) as. Never printed |
| `allow_writes` | Comments, worklogs, moves, assignees and new work packages to OpenProject; `false` by default |
| `max_agents` | Author sessions at once |
| `default_scope` | The OpenProject project (its identifier) a workspace project works against when it remembers none |
| `scopes` | The OpenProject projects the list may be switched to; empty is any |
| `work_in` | `branch` (a new branch in the project) or `worktree` (outside the workspace folders) |
| `sandbox` | `required` (the AI CLI's sandbox, and no session without it) or `off` (a person's choice) |
| `network_domains` | The domains the sandbox allows (the project's package registries) |
| `allow_web` | Web fetch and web search in the author session |
| `comments_from` | The comments a saved work package keeps: `members` (Project admins and Members), `all`, `none` |
| `outsider_items` | A work package from outside the project: `analyze` (work it only after a confirmation by name) or `refuse` |

## Testing a site

```bash
bash cmd-tools-testing.sh mysite                       # webship-js, the step pack, the users registry, a first feature
bash cmd-tools-testing.sh mysite --run
```

The testing setup adds `@webship-js/openproject-steps` to the project, its step definitions to `cucumber.js`, the
managing account (`owner`, which makes and removes the test content through the site's API), the project of the steps
(`webship-site`), the users registry (`owner`, `member`, `reader`, `stranger`), and `tests/features/site.feature`.
The suite leaves the site as it found it.

## AI items

| Kind | Item | What it is for |
| --- | --- | --- |
| Agent | `openproject-site-builder` | Build, look after and remove OpenProject sites |
| Agent | `openproject-tester` | Test a site with the step pack: look at the screens first, write scenarios, run, read |
| Agent | `openproject-work-package-worker` | Work a work package on a branch, the writes left to a person |
| Skill | `openproject-scenarios` | The pack's phrases by area, the traps found on real sites, whole features |
| Command | `/openproject-test <site>` | Set the testing stack up, run the suite, report |
| Prompt | `openproject-build-and-test` | Build a site and prove it with its first feature |
| Prompt | `openproject-work-package-to-branch` | Work a work package on a branch |

## Proven

On this release, OpenProject 17.9.8 from the publisher's image was built, with `--install --add-users
--sample-content`, on DDEV 1.24.7 and on Docker Compose (the workspace's container runtimes). On each, the step
pack's suite passed and left the site as it found it. On the DDEV site, the dashboard listed the work packages in every
view, read them with each author's standing, and posted a comment, a worklog, a move and an assignee. The AI CLI worked
a work package on a branch: one commit, with its notes on the Result tab.

## License

ISC (see `LICENSE`). OpenProject itself is GPL-3.0; the plugin runs the publisher's image and carries none of its code.

---
name: openproject-scenarios
description: Write webship-js scenarios for an OpenProject site (the open-source project management software) of the Webship Workspace from phrases that exist — the OpenProject step pack's steps by area (logging in and out and a refused login, a project and who may open it, the work package list, one work package with its status, comments, time and assignee, a new work package, the backlog and its sprints, what a Reader or a stranger may not do, test content), the traps found on real sites, and whole features. Use when asked to write, extend or fix scenarios for an OpenProject site, or when a scenario of the site fails on a phrase.
---

# openproject-scenarios

Scenarios for a site built with the OpenProject plugin (`bash cmd-openproject-project.sh <site> --install
--add-users --sample-content`) in a container-based workspace (DDEV by default), tested with webship-js and
`@webship-js/openproject-steps` once `bash cmd-tools-testing.sh <site>` set the project up. Every phrase below exists
in the pack or in webship-js; a scenario names no platform.

## Accounts

- `Given I am a logged in user with the "member" user`: `owner` (Project admin of Webship site), `member` (Member),
  `reader` (Reader), `stranger` (no membership). `Given I am not logged in` for a visitor.
- The accounts are made by the build (`cmd-tools-openproject-cli.sh <site> --add-users`); a suite never creates or
  deletes one, and never writes a password: it logs in by the handle.

## Phrases by area

| Area | Steps |
| --- | --- |
| Session | `I am a logged in user with the "member" user`, `I log in with the "member" user`, `I log in as "member" with the password "…"`, `the login should be refused with "Invalid user or password"`, `I am not logged in`, `I log out`, `I should be logged in as "Member Test"` (or the login, `"member"`), `I should not be logged in` |
| Projects | `I open the project "webship-site"` (its identifier, or its name "Webship site"), `I should be refused the project "webship-site"` |
| Test content | `there is a work package "Webship test …" in the project "webship-site"` (it goes after the scenario), `there is no work package "Webship test …" in the project "webship-site"` |
| The list | `I open the work packages of the project "webship-site"`, `the work package list should show "…"` (`should not show`), `I create a work package "Webship test …" in the project "webship-site"` (it goes after the scenario) |
| One work package | `I open the work package "…"`, `I set the status of the work package to "In progress"`, `the status of the work package should be "In progress"`, `I comment "…" on the work package`, `the work package should show the comment "…"` (`… by "Member Test"`), `I log "0.5" hours on the work package` (`… with the comment "…"`), `the time spent on the work package should be "0.5h"`, `I assign the work package to "Member Test"`, `the work package should be assigned to "Member Test"` |
| What an account may not do | `I should not be able to change the status of the work package`, `I should not be able to log time on the work package`, `I should not be able to create a work package in the project "webship-site"`, `I should be refused the project "webship-site"` |
| Backlog and sprints | `I open the backlog of the project "webship-site"`, `the sprint "Sprint 1" should be "Active"`, `the sprint "Sprint 1" should list the work package "…"` (`should not list`), `the backlog should list the work package "…"` (`should not list`) |

## The sample content

`--sample-content` adds, in Webship site: "The greeting script says Helo instead of Hello" (a Task by the owner, In
progress, assigned to Member Test, in the active sprint "Sprint 1", with the owner's comment "The script is in the
project's repository: `greeting.sh`."), "The usage page spells greeting as greting" (a Bug by the member, New, in the
backlog) and "A work package opened by someone outside the project" (opened by the stranger). A suite reads them and
never changes them.

## Traps found on real sites

- A comment cannot be taken back, and a status change stays in the history: change only a work package the scenario
  made (`there is a work package "Webship test …"`), which goes after it with all of it.
- The list shows the open work packages: one moved to "Closed" leaves it.
- A refused login and a project an account may not open answer with an error status: tag those scenarios `@js-off`.
- A project an account may not open answers "[Error 404]"; the site does not say the project is there.
- A Reader's status button is there but cannot be pressed; "Log time" is not there at all.
- The statuses offered depend on the type and the role's workflow: a Member moves a Task from New to In progress, a
  Bug to Confirmed.
- The time spent shows as the site formats it, "0.5h" for half an hour.
- A run that was stopped half way leaves its "Webship test …" work packages: `bash cmd-tools-openproject-cli.sh
  <site> --tidy` removes them, with their time.

## Whole features

`examples/` holds three features that pass on a site built with `--install --add-users --sample-content`: the session
(`session.feature`), a work package worked by a member (`work-package.feature`) and the roles (`roles.feature`).

## The book

For any automated functional testing in this work (a Gherkin feature, a step definition, choosing a
step, a test run and its failures), read the book *Automated Functional Testing Recipes* first.

- **Where.** Use the first that exists: `.claude/automated-functional-testing-recipes/` in the project,
  `~/.claude/automated-functional-testing-recipes/` (installed by webship/webship-js-ai-agent,
  webship/webship-js-skills or webship/ai-agents), or
  https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes
- **How.** Its `README.md` first, then the chapter that matches the task (one file per chapter,
  named by its subject), not the single complete file.
- **Which wins.** The installed webship-js package and the step pack are the source of truth for
  step phrasing. When they differ from the book, follow them and say so.
- **For a site.** Start with `ch10-authentication-authorization.md` (logins, refusals and what each role may do),
  `ch07-waiting-dynamic-content.md` (waiting on the app's own signals) and `ch26-testing-cms-applications.md`
  (content made and removed, roles, a workflow across roles).

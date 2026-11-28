import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { assistantContext, PLATFORM, COMMANDS, AGENTS, SKILLS, AI_COMMANDS, PROMPTS } from '../src/index';
import { openprojectTracker } from '../src/lib/tracker';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = pkg.workspacePlugin;
const FUN = read('scripts/functions/fun-openproject.sh');

test('the manifest names the platform, and every file it names ships', () => {
  assert.strictEqual(manifest.name, PLATFORM);
  const named = [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args, ...manifest.scripts.machine,
    ...manifest.ai.agents, ...manifest.ai.skills, ...manifest.ai.commands, ...manifest.ai.prompts, ...manifest.features, manifest.settingsTemplate, manifest.labels];
  for (const f of named) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  for (const f of named) assert.ok(pkg.files.includes(f.split('/')[0]), `${f} is published with the package`);
  assert.deepStrictEqual(manifest.commands.files.map((f: string) => path.basename(f)), COMMANDS);
  assert.deepStrictEqual(manifest.ai.agents.map((f: string) => path.basename(f, '.md')), AGENTS);
  assert.deepStrictEqual(manifest.ai.skills.map((f: string) => path.basename(f)), SKILLS);
  assert.deepStrictEqual(manifest.ai.commands.map((f: string) => path.basename(f, '.md')), AI_COMMANDS);
  assert.deepStrictEqual(manifest.ai.prompts.map((f: string) => path.basename(f, '.md')), PROMPTS);
  assert.deepStrictEqual(manifest.commands.types, ['sites'], 'the commands go to sites folders only');
  assert.deepStrictEqual(manifest.typeActions, { openproject: ['sites', 'code'] }, 'the OPENPROJECT menu on the rows of sites and code folders');
  // The machine files land side by side in core/scripts/plugins/openproject/: no two may share a name.
  const names = manifest.scripts.machine.map((f: string) => path.basename(f));
  assert.strictEqual(new Set(names).size, names.length, 'the machine files have names of their own');
  assert.strictEqual(manifest.featuresSite, 'cmd-openproject-project.sh ci-openproject --install --add-users --sample-content --runtime docker', 'CI builds a site on Docker Compose for the features');
  assert.deepStrictEqual(pkg.dependencies, { '@webship.co/workspace-tracker': '^1.0.2' });
});

test('every command finds the workspace by itself, names its folder, and sources its args from where the installer puts them', () => {
  for (const f of manifest.commands.files) {
    const src = read(f);
    assert.match(src, /^#!\/usr\/bin\/env bash/, `${f} is a bash script`);
    assert.match(src, /WORKSPACE_SCRIPTS="\$\{WORKSPACE_SCRIPTS:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\.\/core\/scripts" && pwd\)\}"/, `${f} locates the tooling from its own path`);
    assert.match(src, /workspace\.__WORKSPACE__\.settings\.yml/, `${f} loads the settings of the folder it is installed into`);
    assert.match(src, /source \$\{WORKSPACE_SCRIPTS\}\/plugins\/openproject\/args\/arg-[a-z-]+\.sh \|\| exit 1 ;/, `${f} reads its arguments from the plugin's args`);
    const last = src.trim().split('\n').pop() as string;
    assert.match(FUN, new RegExp(`^function ${last.replace(/ ;$/, '')}\\(\\)`, 'm'), `${f} ends by calling a function the plugin defines`);
  }
  assert.match(read('commands/cmd-openproject-project.sh'), /^# workspace-name: OpenProject \(project management\)$/m, 'the builder carries the name the Build list shows');
  assert.doesNotMatch(read('commands/cmd-tools-openproject-cli.sh'), /^# workspace-name:/m, 'a tool is not a builder');
});

test('every shell script parses, and the site\'s script is Ruby the site\'s own runner reads', () => {
  for (const f of [...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args, 'scripts/openproject-serve.sh']) {
    const r = spawnSync('bash', ['-n', path.join(PKG, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
  const rb = read('scripts/openproject-site.rb');
  for (const verb of ['accounts', 'content', 'tidy', 'list', 'token']) assert.match(rb, new RegExp(`when '${verb}'`), `the runner script answers ${verb}`);
  assert.match(rb, /\$stdin\.read/, 'the accounts come on the input, never on a command line');
  assert.doesNotMatch(rb, /^\s*warn /m, 'Kernel#warn says nothing in a production runner: failures go to $stderr');
});

test('the runtimes: DDEV, Docker Compose, Podman and Kubernetes; another is refused before anything is changed', () => {
  assert.match(read('scripts/args/arg-openproject.sh'), /choices=\['ddev', 'docker', 'podman', 'kubernetes'\]/);
  const build = FUN.slice(FUN.indexOf('function openproject_build()'));
  const guard = build.indexOf('case "${runtime}" in');
  assert.ok(guard > 0 && guard < build.indexOf('drop_database') && guard < build.indexOf('ddev config'), 'the runtime is asked first');
  assert.match(build, /    ddev\|docker\|podman\|kubernetes\) ;;\n/, 'the four runtimes');
  assert.match(build, /OpenProject builds on DDEV, Docker Compose, Podman and Kubernetes for now \(--runtime ddev, docker, podman or kubernetes\), not on \$\{runtime\}: that runtime is not proven for it yet\. Nothing was changed\./);
  for (const f of ['README.md', 'src/index.ts', 'commands/cmd-openproject-project.sh', 'scripts/functions/fun-openproject.sh', 'scripts/args/arg-openproject.sh', ...manifest.ai.agents, ...manifest.ai.prompts]) {
    assert.doesNotMatch(read(f), /Podman, Kubernetes, Lando and Docksal are not proven|Other runtimes are not proven|not proven on the other runtimes/, `${f}: no runtime said unproven that is proven`);
  }
  const features = read('features/openproject-runtimes.feature');
  for (const [rt, menu] of [['docker', 'DOCKER'], ['podman', 'PODMAN'], ['kubernetes', 'K8S']]) {
    assert.match(features, new RegExp(`@needs-runtime-${rt} @needs-platform-openproject\\n  Scenario: A site built on [A-Za-z ]+ runs at [a-z ]+, with the ${menu} menu`), `the dashboard's row of a ${rt} site`);
    assert.match(features, new RegExp(`When I open "/login" on the "${rt}" site`), `the login screen of a ${rt} site`);
  }
  assert.match(build, /ddev config --project-type=generic --project-name=\$\{PROJECT_NAME\} --database=postgres:17 \\\n\s+--nodejs-version=\$\(ddev_nodejs_version\)/, 'on DDEV: a generic project on PostgreSQL 17, with the Node.js of the workspace');
  assert.match(build, /ddev config --project-type=generic --webserver-type=generic --project-name=\$\{PROJECT_NAME\} --database=postgres:17 --auto/, 'elsewhere: the generic stack on PostgreSQL 17');
  const write = FUN.slice(FUN.indexOf('function openproject_write_config()'), FUN.indexOf('function openproject_exec()'));
  assert.match(write, /rt_claim openproject/, 'the plugin claims the project on another runtime');
  assert.match(write, /rt_stack image "docker\.io\/openproject\/openproject:\$\{version\}"/, 'the publisher\'s image, pinned, is the web container\'s, by its full name, which Podman needs');
  assert.match(write, /ENTRYPOINT \[\]/, 'the image\'s own all-in-one start is not used there');
  assert.match(write, /chown -R www-data:www-data \/app\/tmp \/app\/log \/app\/files \/var\/openproject/, 'what it writes belongs to the host user, whatever its UID');
  assert.match(write, /rt_serve 8080 "bash \$\{OPENPROJECT_FILES\}\/openproject-serve\.sh"/);
  assert.match(write, /umask 077/, 'the site\'s own values are readable by their owner only');
  assert.match(write, /\nOPENPROJECT_ATTACHMENTS__STORAGE__PATH=\/var\/www\/html\/\$\{OPENPROJECT_FILES\}\/files\n/, 'the attachments in the project folder: not in the image\'s volume, which a new container or pod does not have and a Backup does not take');
  assert.match(FUN, /^readonly OPENPROJECT_FILES='openproject';$/m);
  const readme = read('README.md');
  const upgrade = readme.slice(readme.indexOf('On Docker Compose:\n'), readme.indexOf('## The tool'));
  assert.ok(upgrade.indexOf('mkdir -p openproject/files') < upgrade.indexOf('docker compose cp web:/var/openproject/assets/files/. openproject/files/')
    && upgrade.indexOf('docker compose cp') < upgrade.indexOf("echo 'OPENPROJECT_ATTACHMENTS__STORAGE__PATH=/var/www/html/openproject/files' >> openproject/env")
    && upgrade.indexOf('>> openproject/env') < upgrade.indexOf('docker compose restart web'), 'the upgrade of a 1.0.2 Docker Compose site: the folder, the copy, the env line the builder writes now, the restart');
  assert.match(readme, /\*\*Its attachments\*\* are in the project folder \(`openproject\/files`\) on every runtime, which the row's Backup holds/, 'the attachments in the project folder on every runtime');
  const ddevUpgrade = readme.slice(readme.indexOf('On DDEV, where OpenProject\'s service then runs as your user:'), readme.indexOf('On Docker Compose:\n'));
  const steps = ['mkdir -p openproject/files', 'docker cp ddev-mysite-openproject:/var/openproject/assets/files/. openproject/files/', 'cp ~/workspace/core/scripts/plugins/openproject/docker-compose.openproject.yaml .ddev/', 'ddev restart'];
  for (let i = 1; i < steps.length; i++) assert.ok(ddevUpgrade.indexOf(steps[i - 1]) >= 0 && ddevUpgrade.indexOf(steps[i - 1]) < ddevUpgrade.indexOf(steps[i]), `the upgrade of a 1.0.2 DDEV site, in order: ${steps[i]}`);
  const serve = read('scripts/openproject-serve.sh');
  assert.ok(serve.indexOf('./docker/prod/migrate') < serve.indexOf('./docker/prod/seeder --skip-migrate') && serve.indexOf('seeder') < serve.indexOf('exec ./docker/prod/web'), 'migrate, seed, then serve');
  assert.match(serve, /bundle exec good_job start &/, 'the background worker beside the web server');
  assert.ok(serve.indexOf('mkdir -p "${OPENPROJECT_ATTACHMENTS__STORAGE__PATH:-/var/openproject/assets/files}" || exit 1 ;') > serve.indexOf('. "$(dirname "$0")/env"') && serve.indexOf('mkdir -p') < serve.indexOf('./docker/prod/migrate'), 'the attachments\' folder made before OpenProject starts, wherever the site\'s env puts it');
});

test('OpenProject\'s service on DDEV: the publisher\'s image takes the project\'s address, on the project\'s database; the web container keeps the mail catcher', () => {
  const compose = read('scripts/docker-compose.openproject.yaml');
  assert.match(compose, /image: "openproject\/openproject:\$\{OPENPROJECT_VERSION:-17\.9\.8\}"/);
  assert.match(compose, /VIRTUAL_HOST: \$\{DDEV_HOSTNAME\}/, 'OpenProject takes the project\'s address');
  assert.match(compose, /HTTPS_EXPOSE=8457:80,8026:8025/, 'the web container moves, its mail catcher stays at :8026');
  assert.match(compose, /DATABASE_URL: postgres:\/\/db:db@db:5432\/db/, 'the project\'s own PostgreSQL');
  assert.match(compose, /OPENPROJECT_SMTP__ADDRESS: web/, 'the site\'s mail goes to the mail catcher of the web container');
  assert.match(compose, /env_file:\n\s+- \$\{DDEV_APPROOT\}\/openproject\/env/, 'the site\'s own values from its file');
  assert.match(compose, /name: ddev-\$\{DDEV_SITENAME\}-openproject-assets/, 'the files volume is the project\'s, removed with it');
  // Every volume the image declares (its registry's config of 17.9.8: /var/openproject/assets, /var/openproject/pgdata)
  // is mounted from a volume named after the project: an unnamed one is left on the machine by ddev delete (#3).
  for (const [volume, folder] of [['openproject_assets', '/var/openproject/assets'], ['openproject_pgdata', '/var/openproject/pgdata']]) {
    assert.ok(compose.includes(`      - ${volume}:${folder}\n`), `${folder} is mounted from ${volume}`);
    assert.match(compose, new RegExp(`\\n  ${volume}:\\n    name: ddev-\\$\\{DDEV_SITENAME\\}-${volume.replace('_', '-')}\\n`), `${volume} is named after the project`);
  }
  assert.doesNotMatch(compose, /SECRET_KEY_BASE:|PASSWORD:/, 'no secret in the compose file');
  // As the project's user, with the plugin's start: what it writes in the project folder is the project's own.
  assert.match(compose, /\n    user: "\$\{DDEV_UID\}:\$\{DDEV_GID\}"\n    command: \["bash", "\/opt\/webship\/openproject-serve\.sh"\]\n/, 'the project\'s user, the plugin\'s start (the all-in-one one needs root)');
  assert.match(compose, /\n    tmpfs:\n      - \/app\/tmp:mode=1777\n      - \/app\/log:mode=1777\n/, 'its caches and log where any user may write');
  assert.ok(compose.includes('      - ${DDEV_APPROOT}/openproject/files:/var/openproject/assets/files\n'), 'its attachments in the project folder');
  for (const line of ['OPENPROJECT_RAILS__CACHE__STORE: file_store', 'PORT: "80"', 'HOME: /tmp']) assert.ok(compose.includes(`      ${line}\n`), line);
  assert.match(FUN.slice(FUN.indexOf('function openproject_write_config()')), /cp "\$\{from\}\/docker-compose\.openproject\.yaml" "\$\{project_path\}\/\.ddev\/docker-compose\.openproject\.yaml" \|\| return 1 ;\n(\s+#.*\n)+\s+mkdir -p "\$\{project_path\}\/\$\{OPENPROJECT_FILES\}\/files" \|\| return 1 ;/, 'the folder made by the project\'s user before the service starts');
});

test('the functions carry the names the core\'s tools look for, and run OpenProject\'s tools in its container as its user', () => {
  for (const fn of ['set_openproject_users', 'add_openproject_users', 'cancel_openproject_users', 'testing_configure_openproject', 'openproject_build', 'openproject_cli_tool', 'openproject_connect']) {
    assert.match(FUN, new RegExp(`^function ${fn}\\(\\) \\{`, 'm'), `${fn} is defined`);
  }
  assert.match(FUN, /ddev exec -s openproject "if \[ \\"\\\$\(id -u\)\\" = 0 \] ; then exec su app -s \/bin\/bash -c \$\{inner\} ; else exec bash -c \$\{inner\} ; fi" ;/, 'on DDEV in OpenProject\'s container, as the user it runs as: the project\'s, or app on a site built before');
  assert.match(FUN, /OPENPROJECT_LOG__LEVEL=warn bundle exec rails runner \$\(openproject_scripts_dir\)\/openproject-site\.rb/, 'the site\'s own Rails runner');
  assert.match(FUN, /openproject_exec "bundle exec rake \$\{RUN\}"/, 'the tool runs OpenProject\'s own tasks');
  assert.match(FUN, /users=\(owner member reader stranger\);/);
  assert.match(FUN, /user_owner_role='Project admin' ;\n\s+user_member_role='Member' ;\n\s+user_reader_role='Reader' ;\n\s+user_stranger_role='' ;/);
  assert.doesNotMatch(FUN, /ddev stop -y/, 'ddev stop takes no -y');
  const connect = FUN.slice(FUN.indexOf('function openproject_connect()'), FUN.indexOf('function openproject_cli_tool()'));
  assert.match(connect, /OPENPROJECT_NEW_TOKEN="\$\{token\}" python3/, 'the token reaches the settings writer in its environment only');
  assert.match(connect, /0o600/, 'the settings file stays readable by its owner only');
  assert.doesNotMatch(connect, /echo[^\n]*\$\{token\}/, 'the token is never printed');
});

test('the provider names OpenProject\'s own token shapes, for the guard before anything is posted', () => {
  const api: any = { name: 'openproject', settings: { file: 'plugin.openproject.settings.yml', read: () => ({}) }, lib: {} };
  const shapes = openprojectTracker(api).tokenShapes as Array<[string, RegExp]>;
  assert.strictEqual(shapes.length, 1);
  const [words, shape] = shapes[0];
  assert.strictEqual(words, 'an OpenProject token');
  for (const prefix of ['opapi', 'opal', 'opbk', 'opical']) assert.ok(shape.test(`x ${prefix}-${'0123456789abcdef'.repeat(4)}`), prefix);
  assert.ok(!shape.test('opapi- is the prefix of its tokens'), 'the prefix alone is no token');
});

test('the assistant is told how to build, test and connect a site', () => {
  const told = assistantContext();
  for (const c of COMMANDS) assert.ok(told.includes(c), `the assistant is told about ${c}`);
  for (const a of AGENTS) assert.ok(told.includes(a), `the assistant is told about ${a}`);
  assert.match(told, /with `--runtime docker`, `podman` or `kubernetes` at the address the runtime gives it/);
  assert.match(told, /--connect <login>/);
});

test('the docs say container-based, name only what ships, and carry no personal value', () => {
  const docs = ['README.md', ...manifest.ai.agents, 'scripts/functions/fun-openproject.sh', 'config/plugin.openproject.settings.yml'];
  for (const f of docs) {
    const src = read(f);
    assert.doesNotMatch(src, /DDEV-only/i, `${f}: the workspace is container-based, DDEV by default`);
    assert.doesNotMatch(src, /\/home\/(?!YOUR_USER)[a-z]/, `${f} carries no personal path`);
    const mails = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g) || [];
    for (const m of mails) assert.match(m, /@example\.(com|org)$/, `${f}: ${m} is not an example address`);
  }
  for (const c of COMMANDS) assert.ok(read('README.md').includes(c), `the README lists ${c}`);
  const keys = [...read('config/plugin.openproject.settings.yml').matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 12);
  for (const k of keys) assert.ok(read('README.md').includes(`\`${k}\``), `the README describes the setting ${k}`);
});

test('the testing setup writes the accounts and the sample content in the project, and says which part did not work', () => {
  const testing = FUN.slice(FUN.indexOf('function testing_configure_openproject()'));
  // add_openproject_users ends in the sites folder: the sample content is asked for in the project again (#7).
  assert.match(FUN, /^function add_openproject_users\(\) \{[\s\S]*?\n  cd \$\{WORKSPACE_ROOT\}\/\$\{doc_name\};\n  return \$\{status\} ;\n\}/m);
  assert.match(testing, /elif ! \( cd "\$\{project_path\}" && add_openproject_users > \/dev\/null 2>&1 \) ; then/, 'the accounts, in the project');
  assert.match(testing, /elif ! \( cd "\$\{project_path\}" && openproject_site content < \/dev\/null > \/dev\/null 2>&1 \) ; then/, 'the sample content, in the project');
  assert.doesNotMatch(testing, /add_openproject_users[^\n]*&& openproject_site content/, 'never after add_openproject_users in one subshell, which ends in the sites folder');
  for (const said of ['does not answer', 'The default accounts could not be written', 'The sample content could not be written']) assert.ok(testing.includes(said), said);
});

/**
 * OpenProject, as a provider of the tracker family (@webship.co/workspace-tracker): the work packages of an OpenProject
 * project, over the API v3 with an API token (basic auth as `apikey`), in a header file, never on a command line.
 *
 * Reads: the open work packages, mine, assigned to someone, the current sprint, and a search; one work package with
 * its comments. Each author's standing is their membership of the project: Project admin and Member are inside, a
 * global admin too; a Reader, a commenter or someone with no membership is outside, so the base keeps their work
 * packages analyze-only unless a person confirms by name.
 *
 * Writes, which the base offers only with writes on, each after a person's click: a comment, a worklog (a time
 * entry), a move through the workflow (the statuses the work package's form allows), an assignee, and a new work
 * package. OpenProject is not a forge: the pull request of the work is opened from the project's forge menu.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginApi } from '@webship.co/workspace-plugin-api';
import type { Person, TrackerItem, TrackerItemFull, TrackerProvider, TrackerScope, WriteResult } from '@webship.co/workspace-tracker';

const SCOPE_RE = /^[a-z][a-z0-9_-]{0,99}$/;
const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : ''; };
/** The id at the end of an API link: '/api/v3/users/6' -> '6'. */
export const idOf = (href: unknown) => String(href || '').split('/').pop() || '';

/** A project role, as the base reads an author's standing. */
export function roleAssociation(roles: string[]): Person['association'] {
  if (roles.some((r) => /project admin/i.test(r))) return 'owner';
  if (roles.some((r) => /^member$/i.test(r))) return 'member';
  if (roles.some((r) => /editor/i.test(r))) return 'collaborator';
  return roles.length ? 'contributor' : 'outside';
}

/** How a status reads: closed and rejected are done; new is open; the rest is work going on. */
export function stateClassOf(status: string): TrackerItem['stateClass'] {
  if (/^(closed|rejected|done|resolved)$/i.test(status)) return 'done';
  if (/^new$/i.test(status)) return 'open';
  return 'doing';
}

/** A work package of the API, as the base reads an item. */
export function itemOf(wp: any, base: string): TrackerItem {
  const l = wp._links || {};
  const state = String((l.status && l.status.title) || '');
  return {
    id: String(wp.id),
    title: String(wp.subject || ''),
    url: `${base}/work_packages/${wp.id}`,
    state,
    stateClass: stateClassOf(state),
    type: l.type && l.type.title ? String(l.type.title) : undefined,
    assignees: l.assignee && l.assignee.title ? [String(l.assignee.title)] : [],
    labels: l.category && l.category.title ? [String(l.category.title)] : [],
    iteration: l.sprint && l.sprint.title ? `sprint ${l.sprint.title}` : undefined,
    updated: wp.updatedAt || undefined,
  };
}

/** The sprint a "current sprint" view means: the active one, else the one whose dates hold today. */
export function currentSprint(list: any[], now = new Date()): string {
  const all = (list || []).filter((s) => s && s.id);
  const active = all.find((s) => /:active$/.test(String((s._links && s._links.status && s._links.status.href) || '')));
  if (active) return String(active.id);
  const day = now.toISOString().slice(0, 10);
  const dated = all.find((s) => s.startDate && s.finishDate && s.startDate <= day && day <= s.finishDate);
  return dated ? String(dated.id) : '';
}

const filters = (f: Record<string, unknown>[]) => encodeURIComponent(JSON.stringify(f));

export function openprojectTracker(api: PluginApi): TrackerProvider {
  const lib = api.lib;
  const settings = () => api.settings.read() || {};
  const base = () => configured(settings().url).replace(/\/+$/, '');
  const token = () => configured(settings().token);

  /** One call of the API v3: the token and the body in files only this user reads, removed after. */
  async function call(method: string, p: string, body?: unknown): Promise<{ status: number; data: any }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-openproject-'));
    try {
      const h = path.join(dir, 'headers');
      fs.writeFileSync(h, `Authorization: Basic ${Buffer.from(`apikey:${token()}`).toString('base64')}\nAccept: application/hal+json\n`, { mode: 0o600 });
      const args = ['-sS', '-m', '30', '-X', method, '-w', '\n%{http_code}', '-H', `@${h}`];
      if (body !== undefined) {
        const b = path.join(dir, 'body.json');
        fs.writeFileSync(b, JSON.stringify(body), { mode: 0o600 });
        args.push('-H', 'Content-Type: application/json', '--data-binary', `@${b}`);
      }
      args.push(`${base()}/api/v3${p}`);
      const r = await lib.run('curl', args, process.env.HOME || '/', { timeoutMs: 40 * 1000, env: process.env });
      const out = String(r.stdout || '');
      const at = out.lastIndexOf('\n');
      const status = Number(out.slice(at + 1)) || 0;
      if (!status) throw new Error(lib.cliError(String(r.stderr || 'curl did not answer')));
      let data: any = null;
      try { data = JSON.parse(at >= 0 ? out.slice(0, at) : out); } catch (_) { data = null; }
      return { status, data };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const why = (r: { status: number; data: any }) => `OpenProject answered ${r.status}: ${String((r.data && r.data.message) || '').slice(0, 200)}`;
  async function get(p: string): Promise<any> {
    const r = await call('GET', p);
    if (r.status < 200 || r.status >= 300) throw new Error(why(r));
    return r.data;
  }
  async function write(method: string, p: string, body: unknown, url: string): Promise<WriteResult & { data?: any }> {
    try {
      const r = await call(method, p, body);
      return r.status >= 200 && r.status < 300 ? { ok: true, error: '', url, data: r.data } : { ok: false, error: why(r) };
    } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
  }

  const projectIds = new Map<string, string>();
  async function projectId(scope: TrackerScope): Promise<string> {
    if (!projectIds.has(scope.id)) projectIds.set(scope.id, String((await get(`/projects/${encodeURIComponent(scope.id)}`)).id));
    return projectIds.get(scope.id) as string;
  }
  /** Someone who can be assigned in a project (or to a work package), by login or by name: their id. */
  async function assigneeId(where: string, who: string): Promise<string> {
    const d = await get(`${where}/available_assignees?pageSize=200`);
    const people: any[] = (d && d._embedded && d._embedded.elements) || [];
    const w = who.trim().toLowerCase();
    const found = people.find((u) => String(u.login || '').toLowerCase() === w) || people.find((u) => String(u.name || '').toLowerCase() === w);
    if (!found) throw new Error(`${who} cannot be assigned here (not a member who takes work packages)`);
    return String(found.id);
  }

  // A user's name and whether they administer the whole site, asked once per user for a few minutes: an activity's
  // link to its user carries no name.
  const users = new Map<string, { at: number; name: string; admin: boolean }>();
  async function userInfo(uid: string): Promise<{ name: string; admin: boolean }> {
    const hit = users.get(uid);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit;
    let info = { name: 'unknown', admin: false };
    try { const u = await get(`/users/${uid}`); info = { name: String((u && (u.name || u.login)) || 'unknown'), admin: !!(u && u.admin) }; } catch (_) { /* a deleted or hidden user */ }
    users.set(uid, { at: Date.now(), ...info });
    return info;
  }

  // The members of a project and their roles, asked once per project for a few minutes. Asking for one person by a
  // filter is refused (400) for a person the account cannot see, which is everyone outside its projects: the whole list
  // answers for them too. Without the right to see the members (403) every standing is unknown.
  const memberships = new Map<string, { at: number; roles: Map<string, string[]> | null }>();
  async function membersOf(scope: TrackerScope): Promise<Map<string, string[]> | null> {
    const hit = memberships.get(scope.id);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.roles;
    let roles: Map<string, string[]> | null = null;
    try {
      const pid = await projectId(scope);
      const d = await get(`/memberships?pageSize=1000&filters=${filters([{ project: { operator: '=', values: [pid] } }])}`);
      roles = new Map();
      for (const m of ((d && d._embedded && d._embedded.elements) || []) as any[]) {
        const uid = idOf(m._links && m._links.principal && m._links.principal.href);
        const names = ((m._links && m._links.roles) || []).map((r: any) => String(r.title || ''));
        roles.set(uid, [...(roles.get(uid) || []), ...names]);
      }
    } catch (_) { roles = null; }
    memberships.set(scope.id, { at: Date.now(), roles });
    return roles;
  }
  async function standing(scope: TrackerScope, href: unknown): Promise<Person['association']> {
    const uid = idOf(href);
    if (!/^\d+$/.test(uid)) return 'unknown';
    const roles = await membersOf(scope);
    if (!roles) return 'unknown';
    const a = roleAssociation(roles.get(uid) || []);
    // An administrator of the whole site who is no member of the project, when the account may see that.
    return a === 'outside' && (await userInfo(uid)).admin ? 'owner' : a;
  }
  /** A person of a link: its title when it carries one, else the user's name. */
  async function personOf(scope: TrackerScope, link: any): Promise<Person> {
    const href = link && link.href;
    const uid = idOf(href);
    const name = link && link.title ? String(link.title) : (/^\d+$/.test(uid) ? (await userInfo(uid)).name : 'unknown');
    return { name, association: await standing(scope, href) };
  }

  const wpUrl = (id: string) => `${base()}/work_packages/${id}`;

  return {
    id: api.name,
    title: 'OpenProject',
    label: 'OPENPROJECT',
    noun: { one: 'work package', many: 'work packages' },
    capabilities: {
      views: ['open', 'mine', 'assigned', 'iteration', 'query'],
      iterationWord: 'sprint',
      comment: true, worklog: true, transition: true, labels: false, assign: true, create: true,
      request: 'none',
    },
    idPattern: /^[1-9][0-9]{0,9}$/,
    tokenVariables: ['OPENPROJECT_API_KEY', 'OPENPROJECT_TOKEN'],
    // OpenProject's own tokens: opapi- (an API token), opal- (a login cookie), opbk- (a backup), opical- (a calendar
    // feed), each followed by 64 hex digits. The base refuses them in what is about to be posted.
    tokenShapes: [['an OpenProject token', /\bop(?:api|al|bk|ical)-[0-9a-f]{32,}/]],
    secret: () => token(),
    ready: () => (!base() ? `no OpenProject address in ${api.settings.file} (url)` : !token() ? `no API token in ${api.settings.file} (token)` : ''),
    // A workspace project has no OpenProject project of its own: it remembers one, or the default is used.
    scopeOf: () => null,
    parseScope: (text) => {
      const t = String(text || '').trim();
      return SCOPE_RE.test(t) && base() ? { id: t, name: t, web: `${base()}/projects/${t}` } : null;
    },
    urlOf: (_s, id) => wpUrl(id),
    account: async () => { try { return String((await get('/users/me')).login || ''); } catch (_) { return ''; } },
    scopes: async () => {
      const d = await get('/projects?pageSize=200');
      return ((d && d._embedded && d._embedded.elements) || []).filter((x: any) => x.identifier && SCOPE_RE.test(String(x.identifier)))
        .map((x: any) => ({ id: String(x.identifier), name: String(x.name || x.identifier), web: `${base()}/projects/${x.identifier}` }));
    },

    list: async (scope, q) => {
      const f: Record<string, unknown>[] = [{ status: { operator: 'o', values: [] } }];
      if (q.view === 'mine') f.push({ assignee: { operator: '=', values: ['me'] } });
      if (q.view === 'assigned') { if (!q.who) return []; f.push({ assignee: { operator: '=', values: [await assigneeId(`/projects/${await projectId(scope)}`, q.who)] } }); }
      if (q.view === 'iteration') {
        const sprints = await get(`/sprints?filters=${filters([{ definingWorkspace: { operator: '=', values: [await projectId(scope)] } }])}`);
        const sid = currentSprint((sprints && sprints._embedded && sprints._embedded.elements) || []);
        if (!sid) return [];
        f.push({ sprint: { operator: '=', values: [sid] } });
      }
      if (q.view === 'query') f.push({ search: { operator: '**', values: [String(q.text || '')] } });
      const sort = encodeURIComponent(JSON.stringify([['updatedAt', 'desc']]));
      const d = await get(`/projects/${encodeURIComponent(scope.id)}/work_packages?pageSize=${Math.max(1, Math.min(q.limit, 100))}&sortBy=${sort}&filters=${filters(f)}`);
      return ((d && d._embedded && d._embedded.elements) || []).map((wp: any) => itemOf(wp, base()));
    },

    get: async (scope, id) => {
      const [wp, acts] = await Promise.all([get(`/work_packages/${id}`), get(`/work_packages/${id}/activities`)]);
      const l = wp._links || {};
      const author = await personOf(scope, l.author);
      const list: any[] = (acts && acts._embedded && acts._embedded.elements) || [];
      // The description's last editor: the newest journal that changed it, when it is not the author.
      let lastEditor: Person | undefined;
      const edit = [...list].reverse().find((a: any) => (a.details || []).some((d: any) => /^description (changed|set)/i.test(String(d.raw || ''))));
      const editorLink = edit && edit._links && edit._links.user;
      if (editorLink && idOf(editorLink.href) !== idOf(l.author && l.author.href)) lastEditor = await personOf(scope, editorLink);
      const comments = [];
      for (const a of list) {
        const raw = a.comment && String(a.comment.raw || '').trim();
        if (!raw) continue;
        comments.push({ author: await personOf(scope, a._links && a._links.user), body: raw, at: String(a.createdAt || '') });
      }
      const full: TrackerItemFull = { ...itemOf(wp, base()), body: String((wp.description && wp.description.raw) || ''), author, ...(lastEditor ? { lastEditor } : {}), comments };
      return full;
    },

    comment: async (_scope, id, markdown) => write('POST', `/work_packages/${id}/activities`, { comment: { raw: markdown } }, `${wpUrl(id)}/activity`),
    worklog: async (_scope, id, entry) => write('POST', '/time_entries', {
      hours: `PT${entry.minutes}M`, spentOn: new Date().toISOString().slice(0, 10), comment: { raw: entry.text },
      _links: { workPackage: { href: `/api/v3/work_packages/${id}` } },
    }, wpUrl(id)),
    transitions: async (_scope, id) => {
      const wp = await get(`/work_packages/${id}`);
      const form = await call('POST', `/work_packages/${id}/form`, { lockVersion: wp.lockVersion });
      const allowed = (((form.data || {})._embedded || {}).schema || {}).status;
      const now = (wp._links && wp._links.status && wp._links.status.title) || '';
      return (((allowed && allowed._links && allowed._links.allowedValues) || []) as any[])
        .filter((s) => s.title && s.title !== now).map((s) => ({ id: idOf(s.href), name: String(s.title) }));
    },
    transition: async (_scope, id, to) => {
      if (!/^\d+$/.test(to)) return { ok: false, error: `not a status: ${to}` };
      const wp = await get(`/work_packages/${id}`);
      return write('PATCH', `/work_packages/${id}`, { lockVersion: wp.lockVersion, _links: { status: { href: `/api/v3/statuses/${to}` } } }, wpUrl(id));
    },
    assign: async (_scope, id, whom) => {
      let uid = '';
      try { uid = await assigneeId(`/work_packages/${id}`, whom); } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
      const wp = await get(`/work_packages/${id}`);
      return write('PATCH', `/work_packages/${id}`, { lockVersion: wp.lockVersion, _links: { assignee: { href: `/api/v3/users/${uid}` } } }, wpUrl(id));
    },
    create: async (scope, item) => {
      const r = await write('POST', `/projects/${encodeURIComponent(scope.id)}/work_packages`, { subject: item.title, description: { raw: item.body } }, '');
      return r.ok ? { ok: true, error: '', id: String(r.data && r.data.id), url: wpUrl(String(r.data && r.data.id)) } : r;
    },
  };
}

// ---------------------------------------------------------------------------
// Reading a SharePoint / OneDrive folder through its "anyone with the link"
// share, the way the Planning Unit shares its working files.
//
// Opening the link gives a guest session cookie (FedAuth) scoped to that
// folder; with it, SharePoint's REST API lists the folder (names, sizes,
// modified time, version, ETag, who saved it last) and returns a file's
// bytes. No account, key or tenant consent is needed — and nothing more than
// the link already grants is reachable. The session is renewed when
// SharePoint stops accepting it, and every 30 minutes regardless.
//
// Read-only by construction: GET requests only.
// ---------------------------------------------------------------------------

const SESSION_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 60 * 1000;

const sessions = new Map(); // link -> { cookies, site, root, at }

const encode = (p) => encodeURIComponent(String(p).replace(/'/g, "''"));

async function request(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Follow the share link to the folder view, keeping the cookies it sets. */
async function open(link) {
  const u = new URL(link);
  if (!/\.sharepoint\.com$/i.test(u.hostname) || u.protocol !== 'https:') throw new Error('Only https SharePoint links can be tracked.');
  let cookies = [];
  let url = link;
  for (let hop = 0; hop < 8; hop++) {
    const r = await request(url, { redirect: 'manual', headers: cookies.length ? { cookie: cookies.join('; ') } : {} });
    for (const c of r.headers.getSetCookie?.() || []) {
      const pair = c.split(';')[0];
      const name = pair.split('=')[0];
      cookies = [...cookies.filter((x) => x.split('=')[0] !== name), pair];
    }
    const loc = r.headers.get('location');
    if (!loc) break;
    url = new URL(loc, url).href;
    if (/login\.microsoftonline\.com/i.test(url)) throw new Error('The link asks for a sign-in: it must be shared as "Anyone with the link can view".');
  }
  const final = new URL(url);
  const root = decodeURIComponent(final.searchParams.get('id') || '');
  if (!root) throw new Error('The link did not open a folder.');
  // The site is the personal (or team) site the folder lives in.
  const m = /^(\/(?:personal|sites|teams)\/[^/]+)/.exec(root);
  if (!m) throw new Error('The folder is not on a SharePoint site the tracker recognises.');
  if (!cookies.some((c) => c.startsWith('FedAuth='))) throw new Error('SharePoint did not open a guest session for the link.');
  const session = { cookies: cookies.join('; '), site: `${final.origin}${m[1]}`, root, at: Date.now() };
  sessions.set(link, session);
  return session;
}

async function sessionFor(link, fresh = false) {
  const s = sessions.get(link);
  if (!fresh && s && Date.now() - s.at < SESSION_MS) return s;
  return open(link);
}

/** A REST GET with the session, renewed once if SharePoint refuses it. */
async function api(link, pathAndQuery, { binary = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await sessionFor(link, attempt > 0);
    const r = await request(`${s.site}/_api/${pathAndQuery(s)}`, {
      headers: { cookie: s.cookies, accept: binary ? '*/*' : 'application/json;odata=nometadata' },
    });
    if ((r.status === 401 || r.status === 403) && attempt === 0) continue;
    if (!r.ok) throw new Error(`SharePoint answered ${r.status}`);
    return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
  }
  throw new Error('SharePoint refused the link.');
}

/**
 * Every file under the link's folder, recursively:
 * { path (relative to the shared folder), name, size, modifiedAt, version, etag, modifiedBy }.
 */
async function list(link, { maxDepth = 4 } = {}) {
  const s = await sessionFor(link);
  const out = [];
  const walk = async (rel, depth) => {
    const folder = rel ? `${s.root}/${rel}` : s.root;
    const j = await api(link, () => `web/GetFolderByServerRelativePath(decodedurl='${encode(folder)}')?$expand=Files/ModifiedBy,Folders&$select=Files/Name,Files/Length,Files/TimeLastModified,Files/UIVersionLabel,Files/ETag,Files/ModifiedBy/Title,Folders/Name`);
    for (const f of j.Files || []) {
      out.push({
        path: rel ? `${rel}/${f.Name}` : f.Name,
        name: f.Name,
        size: Number(f.Length) || 0,
        modifiedAt: f.TimeLastModified ? new Date(f.TimeLastModified) : null,
        version: f.UIVersionLabel || null,
        etag: f.ETag || null,
        modifiedBy: f.ModifiedBy?.Title || null,
      });
    }
    if (depth >= maxDepth) return;
    for (const d of j.Folders || []) {
      if (/^forms$/i.test(d.Name)) continue;
      await walk(rel ? `${rel}/${d.Name}` : d.Name, depth + 1);
    }
  };
  await walk('', 0);
  return { root: s.root, files: out };
}

/** One file's bytes, by its path relative to the shared folder. */
async function download(link, relPath) {
  return api(link, (s) => `web/GetFileByServerRelativePath(decodedurl='${encode(`${s.root}/${relPath}`)}')/$value`, { binary: true });
}

module.exports = { list, download, open, _sessions: sessions };

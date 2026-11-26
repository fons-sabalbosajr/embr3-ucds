import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// syncToWindows: the startup step that puts every stored share password back
// into Windows. Fake containers and a fake writer, so it runs anywhere — no
// database, no Windows, no Credential Manager touched.
const require = createRequire(import.meta.url);
const { syncToWindows } = require('../services/nasContainers');

const container = (over = {}) => ({
  key: 'records',
  root: '\\\\records-nas\\IDMS_Records_Database',
  username: 'RecordsDB User',
  domain: 'EMBR3SYNOLOGY',
  password: 'secret',
  passwordReadable: true,
  enabled: true,
  incoming: false,
  ...over,
});

const run = (containers, outcome = { ok: true }) => {
  const applied = [];
  const apply = async (c) => {
    applied.push(c.key);
    return typeof outcome === 'function' ? outcome(c) : outcome;
  };
  return syncToWindows({ list: async () => containers, apply, platform: 'win32' }).then((r) => ({ ...r, applied }));
};

describe('NAS credentials restored to Windows at startup', () => {
  const saved = {};
  beforeEach(() => {
    for (const k of ['NAS_ENABLED', 'NAS_CREDENTIAL_SYNC']) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('applies every enabled container that has a readable password', async () => {
    const r = await run([
      container(),
      container({ key: 'legal', root: '\\\\legal-nas\\IDMS_Legal_Database', username: 'LegalDB User' }),
    ]);
    expect(r.applied).toEqual(['records', 'legal']);
    expect(r.results.every((x) => x.ok && x.code === 'APPLIED')).toBe(true);
  });

  it('leaves disabled and incoming containers alone, without reporting them', async () => {
    const r = await run([container({ enabled: false }), container({ key: 'cpd', incoming: true })]);
    expect(r.applied).toEqual([]);
    expect(r.results).toEqual([]);
  });

  it('reports, and does not write, a container it cannot use', async () => {
    const r = await run([
      container({ key: 'a', password: null }),
      container({ key: 'b', password: null, passwordReadable: false }),
      container({ key: 'c', username: null }),
      container({ key: 'd', root: 'not-a-share' }),
    ]);
    expect(r.applied).toEqual([]);
    expect(r.results.map((x) => x.code)).toEqual(['NO_PASSWORD', 'PASSWORD_UNREADABLE', 'NO_USERNAME', 'BAD_ROOT']);
  });

  it('never writes a second account over the first on the same server name', async () => {
    const r = await run([
      container(),
      container({ key: 'legal', username: 'LegalDB User' }), // same host as records
    ]);
    expect(r.applied).toEqual(['records']);
    expect(r.results[1]).toMatchObject({ key: 'legal', ok: false, code: 'HOST_CONFLICT', with: 'records' });
  });

  it('writes a shared server name once when the account is the same', async () => {
    const r = await run([container(), container({ key: 'archive', root: '\\\\RECORDS-NAS\\Archive', username: 'recordsdb user' })]);
    expect(r.applied).toEqual(['records']);
    expect(r.results).toHaveLength(1);
  });

  it('passes on a refusal from Windows', async () => {
    const r = await run([container()], { ok: false, code: 'CREDENTIAL_WRITE_FAILED' });
    expect(r.results).toEqual([{ key: 'records', ok: false, code: 'CREDENTIAL_WRITE_FAILED' }]);
  });

  it('does nothing off Windows, with the NAS off, or when switched off', async () => {
    const list = async () => [container()];
    const apply = async () => {
      throw new Error('must not be called');
    };
    expect((await syncToWindows({ list, apply, platform: 'linux' })).skipped).toBe('NOT_WINDOWS');
    process.env.NAS_ENABLED = 'false';
    expect((await syncToWindows({ list, apply, platform: 'win32' })).skipped).toBe('NAS_DISABLED');
    delete process.env.NAS_ENABLED;
    process.env.NAS_CREDENTIAL_SYNC = 'false';
    expect((await syncToWindows({ list, apply, platform: 'win32' })).skipped).toBe('SYNC_DISABLED');
  });

  it('never puts a password in what it returns', async () => {
    const r = await run([container({ password: 'do-not-leak' })]);
    expect(JSON.stringify(r)).not.toContain('do-not-leak');
  });
});

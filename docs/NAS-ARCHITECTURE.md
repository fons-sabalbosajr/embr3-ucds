# Document access — the records share

Scanned documents live on a NAS. The desktop ERMS reached them through `Z:\`, a
drive letter mapped by hand on every Records workstation. E-Universe reaches
them from the server instead.

```
browser  ──HTTPS/HTTP──▶  E-Universe SPA
                              │
                              ▼
                        E-Universe API        ← holds the service account
                              │  SMB (TCP 445, internal only)
                              ▼
                    \\10.14.76.167\IDMS_Records_Database
```

Nothing about the share reaches the browser: not the host, not the share name,
not the credentials, not a path. A document is asked for by **record serial**,
and the server looks up where it lives.

---

## Why not an SMB client library

The previous implementation used the `smb2` npm package. **It cannot work on
Node 18 or later.** It builds an NTLMv1 response, which needs DES, which
OpenSSL 3 removed — every call fails with `ERR_OSSL_EVP_UNSUPPORTED`. The
package was last published in 2018 and speaks a dialect a current Synology
would reject even if the crypto worked.

The server is Windows on the same network, so the operating system is already
an SMB client and `fs` opens `\\host\share\...` directly. That is why
[`services/nasStorage.js`](../server/services/nasStorage.js) has no SMB code in
it. It also means real streaming and range requests rather than reading whole
files into memory.

**A Linux server would need a different answer** — mount the share with
`cifs-utils` at boot and point `NAS_ROOT` at the mount point. The rest of the
code is unchanged; only the root looks different.

---

## The 260-character limit

**26.7% of the migrated records have paths longer than `MAX_PATH`.** Windows
does not report those as an error — it reports them as *file not found*.

A first attempt at measuring coverage said 0 of 400 records resolved, which
looked like catastrophic data loss. It was the API. Every path is prefixed with
`\\?\UNC\` before it reaches the filesystem, and the same sample then resolved
**98.7%**.

Two consequences worth knowing:

- `\\?\` also **disables path normalisation**, so `..` stops collapsing and
  becomes a literal directory name. Validation must therefore happen *before*
  the prefix is applied. `resolveSharePath()` does exactly that, then re-checks
  containment against the root afterwards.
- Never test a path with a bare `fs.existsSync` while debugging this. It will
  lie to you about a quarter of the records.

---

## Legacy path resolution

Stored on every record, produced during migration:

```
document.filePath   Z:\RECORDS\Database\Records Database\Bataan\1992\Sample.pdf
document.sharePath  RECORDS\Database\Records Database\Bataan\1992\Sample.pdf
```

`sharePath` is the same value with the drive letter removed, and it resolves
directly against the share root — the share happens to contain a `RECORDS`
folder, so no base directory is needed. `NAS_BASE_DIR` exists for a deployment
where that is not true.

The drive letter is **not** hard-coded. 18,065 rows say `Z:` and **two say
`N:`**; a hard-coded `Z:` would have silently lost those two.
`NAS_LEGACY_PREFIXES` lists what to accept.

Nothing needs rewriting in the CSV or the database.

---

## Coverage

```bash
cd server && node scripts/nas-coverage.js 300     # or: all
```

Last measured: **98.3% of a 300-record sample resolved to a real file.** The
remainder are directories that no longer exist on the share — including one row
whose path contains `Bulacan\Bulacan`, a fault in the original data rather than
in the resolver.

Records with no file still show their metadata; the document panel says the
document is not on the share, which is different from saying it is forbidden.

---

## Access control

| Who | May |
|---|---|
| Records / anyone with the ERMS domain | Open and download the document **of a record they can already read**. Province scope is inherited from the record. |
| Developer | The above, plus the share configuration and diagnostics — **after an emailed one-time code** |
| Everyone else | Nothing. `/api/nas/*` refuses non-developers outright |

Endpoints:

```
GET /api/erms/records/:serialNo/file            metadata
GET /api/erms/records/:serialNo/file/preview    inline, honours Range
GET /api/erms/records/:serialNo/file/download   attachment
```

**There is no endpoint that accepts a path.** `GET /api/nas/view-pdf?file=…`
was removed rather than guarded. Browsing the share from the UI is likewise
gone: it would have bypassed the province scope that governs every other way of
reaching a record.

### Step-up authentication

Reading or changing the share configuration sends a six-digit code to the email
address **registered on the account** — never one supplied with the request,
which would let a caller redirect their own challenge.

- code valid 10 minutes, single use, 5 attempts
- elevation lasts 15 minutes, held in the server-side session
- ends at sign-out, because the session does

Opening a document never asks for a code. A clerk files all day; a code per PDF
would only teach everyone to keep one on a sticky note.

---

## What is audited

Written to `app-logs` with `domain: 'nas'`: user, timestamp, record serial,
file name, operation, success, byte count.

**The resolved UNC path is deliberately not recorded.** It names the internal
host and share, and the audit trail is readable from the Admin screens — so
logging it would publish the network topology to everyone who can read a log.
The serial identifies the document; the path is derivable by anyone entitled to
the record.

---

## Deployment requirements

1. **The server must be able to reach the NAS.** Verified here: ping 47ms, TCP
   445 open from `10.14.76.250` to `10.14.76.167`.
2. **Port 445 must never be exposed to the Internet.** Nothing in this design
   requires it. If E-Universe is ever hosted outside the network, the answer is
   a VPN or a site-to-site link — not an open SMB port.
3. **The Node process needs credentials for the share.** On Windows this is a
   stored credential for the service account:

   ```powershell
   cmdkey /add:10.14.76.167 /user:EMBR3SYNOLOGY\<account> /pass
   ```

   `NAS_USERNAME` / `NAS_PASSWORD` in `.env` document which account is intended
   and are read by the connection test; the SMB session itself is established
   by Windows.

### The account: the existing NAS credentials, unchanged

**E-Universe does not require a new NAS account.** The existing credentials —
the ones a Records user already types when Windows asks them to map the drive —
are what the server uses, stored once with `cmdkey` instead of once per
workstation.

This corrects an earlier note here that treated provisioning a dedicated
read-only Synology account as a prerequisite. It never was one. The desktop
ERMS did not need a separate account and neither does this: the change is
*where* the credential lives, not *which* credential it is.

A read-only account would still be a sensible hardening step, because nothing
in E-Universe writes to the share — it opens files and lists the root. But that
is **NAS administration, not application work**, and it is not a blocker for
anything in this repository. If someone does provision one later, the only
change is `NAS_USERNAME` / `NAS_PASSWORD` and a new `cmdkey` entry; no code
moves.

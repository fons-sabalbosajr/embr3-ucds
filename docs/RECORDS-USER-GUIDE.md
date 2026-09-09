# E-Universe for the Records Unit

Training material for Phase 10 — the period when the desktop ERMS is read-only
and filing happens here.

> **Sign in at** `http://10.14.76.250:5173`
> Same username and password as before. Nothing to install, no drive to map.

---

## What changed, in one paragraph

The records database now lives on a server instead of on one PC. You reach it
in a browser. Everything the desktop application held is here — **all 18,067
records**, their permits, their scanned documents. You no longer map `Z:` and
you no longer need to be at a particular machine.

**The desktop application is read-only during this period.** File everything
here. If you file something in both places they will disagree, and the daily
check will flag it.

---

## Finding a record

**Records → Records.** The search box matches, all at once:

- serial number — `FSN-0000512`
- permit number — `R03-1312-0490`
- proponent name
- project title

Partial text works. You do not need the whole name.

Narrow with the filters beside it: permit type, province, who uploaded it,
whether it is linked to the register, whether it needs review.

> **You only see the provinces you are assigned.** A record you cannot see
> reports "not found" rather than "not allowed" — that is deliberate, so the
> system does not confirm a record exists to someone who may not see it. If a
> record you should see is missing, it is a permissions question: ask the
> administrator, do not re-create the record.

---

## Opening a document

Open the record, scroll to **Document**, click **Open document**. It opens in a
viewer without leaving the page. **Download** saves a copy.

Large scans page in as you scroll rather than making you wait for the whole
file — a 59 MB document opens in a few seconds.

### If the document will not open

The message tells you which of these it is, and they mean different things:

| Message | What it means | What to do |
|---|---|---|
| *No document is filed against this record* | The record was created without a scan | Nothing is wrong. File the scan when you have it |
| *Not on the records share* | The record names a file that is not there — usually moved or renamed since 2021 | Report it. **Do not delete the record**; the metadata is still the evidence it existed |
| *The records share could not be reached* | The server has lost the NAS | Tell IT. It affects everyone, not just you |
| *Path cannot be resolved* | The stored path is malformed | Report it — it needs correcting on the record |

About **1 record in 60** points at a folder that no longer exists. That is
inherited from the old data, not something you did.

---

## Filing a new record

**Records → Records → New record.** The serial number is issued automatically —
do not type one, and do not reuse one from the desktop app.

Two things worth knowing:

- **The permit number is checked as you type.** It tells you which establishment
  it will link to, or says plainly that none carries it. *"No establishment
  carries this permit number"* is common and usually fine — the register does
  not cover every record. Do not "fix" a permit number that was correct.
- **A permit number already on another record is refused.** That is a duplicate,
  not a system fault. Find the existing record first.

You can only create and edit records in provinces where you have **write**
access. Read access lets you look, not change.

---

## Moving a record — tracking

**Tracking** on the record detail. Record who took it, when, and when it is due
back. Overdue loans appear on the dashboard.

**The custody trail cannot be edited or deleted.** That is the point of it — a
trail somebody can rewrite is not a trail. A mistake is corrected by recording a
correction, which leaves both entries visible.

---

## Archiving

**Records → Archive.** File records into boxes, seal a box when it is full,
record a disposal when one is authorised.

**Sealing is not deletion.** A sealed box refuses new records; everything in it
stays readable. **Recording a disposal does not delete anything either** — it
records that the paper went, and requires you to name the approving authority.
The database keeps the trail after the paper is gone.

---

## During the parallel period

- **File here, not in the desktop app.**
- If something is wrong, say so the same day. A problem found in week one is a
  fix; the same problem found in week four is four weeks of divergent data.
- Somebody runs `npm run daily-check` each morning and compares this system
  against the last desktop extract. It catches drift, not mistakes — it cannot
  tell whether *what* you filed was right.

**Do not go back to the desktop app to "just do this one quickly."** That is the
single thing most likely to turn a clean cutover into a reconciliation exercise.

---

## What you cannot do, and why

- **Browse the NAS folders.** Documents are opened from their record, so the
  province rules that decide who sees which record also decide who sees which
  document. A folder browser would go around that.
- **See the share configuration.** Developer-only, and even they need a code
  emailed to them.
- **See other provinces.** Ask the administrator if your assignment is wrong.

---

## Who to tell

| Problem | Who |
|---|---|
| A record or document is wrong | Records supervisor |
| You cannot see something you should | Administrator — it is a permissions setting |
| Nobody can open documents | IT — the server has probably lost the NAS |
| The site will not load at all | IT — check the server address first |

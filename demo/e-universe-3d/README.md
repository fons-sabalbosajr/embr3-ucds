# E-Universe — 3D demo

A three-minute, self-running 3D walkthrough of E-Universe for presentations.
Open `index.html` in Chrome or Edge (double-click works; no server, no
network). Press **Play**.

| Time | Chapter | What it shows |
|---|---|---|
| 0:00 | Welcome | A spiral of records forming, with the EMB and Bagong Pilipinas seals over the title |
| 0:10 | Two systems · one universe | The legacy tools (Planning's Excel workbooks, the desktop EMB-ERMS and its three SQL Server databases) migrating into Universe Central DB and ERMS, which merge into E-Universe with the Document Portal and the shared platform |
| 0:32 | How it connects | Browser → Express API → UCDS / ERMS / Portal / Shared → MongoDB, the NAS bridge, HRPMS, the AI provider |
| 0:58 | Access & security | The gates every request passes; a refusal by `requireDomain`; the audit trail |
| 1:18 | Processing records | A record from upload → FSN → permit check → `erms-records` → NAS → custody → archive box |
| 1:44 | Document Portal | Find → identify → terms → the room of 50 → the view-only reader |
| 2:06 | VERA | The dotted flame (from the app's own outline and states) and a live conversation with her guards |
| 2:30 | Dashboard | The Central DB and ERMS · Records dashboards on a 3D screen, province bars, project status |
| 2:52 | One universe | Closing card |

**Keys:** Space play/pause · ← → chapters · C captions · M sound · F full screen · H hide the controls (for screen recording) · R restart.
Click a point on the timeline to jump; hovering it names the chapter.

**URL options:** `?t=95` opens paused at 1:35; `?autoplay` starts at once.

Dashboard figures, establishment names and request references are
illustrative, and the screen says so. Everything else follows the README and
the app's sources.

## Making the video

`render-video.cjs` renders the demo to `E-Universe-3D-Demo.mp4`
(1920×1080, 30 fps, H.264 with AAC audio). It drives Chrome frame by frame,
so the result is smooth on any machine, and renders the soundtrack offline.
It needs Chrome, ffmpeg (on `PATH`, or `FFMPEG=<path to ffmpeg.exe>`) and
the Playwright package `server/` already installs.

```bash
node demo/e-universe-3d/render-video.cjs
```

`--from 30 --seconds 10` renders a short clip, for checking a change.

## Files

- `index.html`, `demo.css`, `demo.js` — the page, the HUD, and the engine
  (every frame is a function of one clock, so seeking is exact).
- `vendor/three.min.js` — three.js r149 (MIT, `vendor/THREE-LICENSE`), the
  last release with a classic-script build, so the page runs from `file://`.
- `assets/brand.js` — generated; the two logos and VERA's dot outline,
  inlined. Rebuild after the logos change:

  ```bash
  node demo/e-universe-3d/build-brand.mjs
  ```

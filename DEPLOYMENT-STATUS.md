# E-Universe: deployment status

**Status: LIVE, FOR TESTING ONLY.** Not officially launched.
**Since:** 26 November 2026
**Address:** https://embr3-onlinesystems.cloud/e-universe

E-Universe is running in its production setup so it can be tested end to end:
the office server runs the application around the clock, the public address
serves it over HTTPS, and scanned documents open from the NAS through the
application. It has **not** been announced to staff, and it is still being
improved.

## What "testing only" means

- **Authorised testers only.** Use it only if the Developer has asked you to
  test it. Do not share the address or announce it until the official launch.
- **The data is real.** The testing site and development both use the live
  E-Universe database, and documents come from the real NAS shares. Anything
  you add, edit or delete is a real change. Test with care, and do not create
  dummy records in the live register.
- **It changes without notice.** Updates are deployed as they are ready, and
  the site may be briefly unavailable while that happens. A plain "temporarily
  unavailable" page is shown during that time.
- **No support commitment yet.** Problems are fixed as they are found, not
  against a service level.

## Reporting a problem

Tell the Developer what you were doing, what you expected, and what happened
instead, with a screenshot if you can. Include the time, so it can be found
in the server log.

## Development continues

New work is built and tested on the developer laptop first, then deployed to
the office server. How to update the server, rotate NAS passwords and turn
document access on or off:

- `server/scripts/CI-CD.md`: how a push to `main` is checked and deployed
  (front-end to the VPS, API to the office server), and how to roll back
- `server/scripts/winserver/README.md`: the office server, updates, rollback
- `server/scripts/vps/add-e-universe-site.sh` and `add-e-universe-apex.sh`: the public address
- In the application: **Storage › Developer guide** (Developer accounts only)

## Before the official launch

- [ ] 2-Step Verification on the account that administers the private network
- [ ] Key-only SSH on the VPS, and its pending restart
- [ ] Off-site test: sign in and open a scanned document from outside the office
- [ ] Restart test: the office server comes back by itself without anyone signing in
- [ ] Server BIOS set to power on after a power interruption
- [ ] Staff told the new address (old `10.14.76.x` bookmarks no longer work)
- [ ] Optional: an uptime monitor that alerts the Developer if the site goes down

When these are done and the launch is announced, change the status at the top
of this file to **LIVE** and record the date.

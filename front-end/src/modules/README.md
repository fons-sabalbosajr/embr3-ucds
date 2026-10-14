# Domain modules

One React application, two business domains over a shared platform, and the
public Document Portal.

```
src/
├── modules/
│   ├── ucds/      Planning — the register by province and year, permits, datasets
│   ├── erms/      Records, Legal Services, Laboratory — records, documents, tracking, archive
│   ├── portal/    The E-Universe Document Portal: the public page
│   │              (/e-universe/document-portal, no sign-in) and the units'
│   │              Portal Requests desk inside the app
│   ├── admin/     Platform administration — users, org units, audit
│   ├── settings/  Per-person and per-unit settings
│   ├── storage/   Storage containers (NAS shares)
│   └── vera/      VERA, the assistant (staff and public surfaces)
│
├── shared/        Layout, common components, cross-domain services
└── auth/          Session, route guards, entitlement
```

## Rules

1. **`shared/` and `auth/` never import from `modules/`.** If shared code needs
   something from a domain, the dependency is pointing the wrong way.
2. **`modules/ucds/` and `modules/erms/` never import from each other.**
   Cross-domain data is read through the owning domain's exported service, never
   by reaching into its components.
3. **Menu visibility is not a control.** Every route behind a domain link is
   checked again by the API with `requireDomain()`. `DomainGuard` only spares
   the user a screen that would fail to load.
4. **The portal's public page talks only to `/api/portal/*`**, with cookies for
   its ticket and the `X-Portal-Request` header on every change. It never uses
   a staff sign-in. Its desk, inside the app, talks to `/api/erms/portal/*`.
   ERMS screens may show portal summaries (the dashboard does); the portal never
   imports from `ucds/`.

Rules 1 and 2 are enforced by `no-restricted-imports` in `.eslintrc.cjs` and
fail at lint time.

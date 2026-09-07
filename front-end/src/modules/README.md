# Domain modules

One React application, two business domains over a shared platform.

```
src/
├── modules/
│   ├── ucds/     Planning Personnel — register, permits, survey, eSWM
│   ├── erms/     Records Personnel — records, documents, tracking, archiving
│   └── admin/    Platform administration — users, roles, org units, audit
│
├── shared/       Layout, common components, cross-domain services
└── auth/         Session, route guards, entitlement
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

Rules 1 and 2 are enforced by `no-restricted-imports` in `.eslintrc.cjs` and
fail at lint time.

## Migration status

`modules/admin/` holds new Phase 4 work. The existing `menu-*` folders move into
`modules/ucds/` during Phase 5, in rename-only commits. `modules/erms/` is
populated in Phase 7.

See `docs/UNIFICATION-PLAN.md`.

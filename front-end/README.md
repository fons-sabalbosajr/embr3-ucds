# E-Universe — front end

The React 18 + Vite + Ant Design 5 single-page app for E-Universe. See the [repository README](../README.md) for what the system is, how to run it, and how it is deployed.

## Scripts

- `npm run dev` — development server on the LAN (`vite --host`)
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — ESLint

`dev` and `build` first copy the `VITE_*` keys from `server/.env` into `.env.local` (`../scripts/sync-env.js`) and check them (`../scripts/check-client-env.js`). Only `VITE_*` keys ever reach the browser bundle.

## Layout

- `src/modules/` — feature modules: `ucds/`, `erms/`, `portal/`, `admin/`, `settings/`, `storage/`, `vera/`
- `src/modules/portal/` — the public **E-Universe Document Portal** (`/e-universe/document-portal`, no sign-in: `DocumentPortal.jsx`) and the units' **Portal Requests** desk inside the app (`PortalDesk.jsx`, `RecordsDesk.jsx`). Document kinds and their colours are in `docTypes.js`.
- `src/shared/` — session transport, feedback, hooks (`useFitHeight`, `visibleInterval`)
- `src/components/` — the app shell: side menu, header, footer, sign-in pages

Production builds run PurgeCSS (`postcss.config.js`). A class name built at runtime from state must be added to its safelist, or its rules are dropped from the build.

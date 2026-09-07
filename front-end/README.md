# embr3-ucds — Front-end

React + Vite front-end for the Universe Central Database System (UCDS).

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — run ESLint

## Deployment notes

- Environment-specific URLs are configured via environment variables (see `src/config/`), not hardcoded in source.
- The server is deployed to Render (see `render.yaml`); the front-end is deployed as a static build.

import purgecss from '@fullhuman/postcss-purgecss';

const isProd = process.env.NODE_ENV === 'production';

export default {
  plugins: [
    // other PostCSS plugins can go here
    isProd &&
      purgecss({
        content: [
          './index.html',
          './src/**/*.{js,jsx,ts,tsx,html}',
        ],
        safelist: {
          standard: [
            // theme toggles and known dynamic classes
            'dark-theme',
            'light-theme',
          ],
          greedy: [
            /^ant-/, // Ant Design
            /^rc-/,  // rc-* deps used by AntD
            /^joyride/, // react-joyride
            /^slick-/, // carousels if any
            // VERA builds modifier classes from state (`vera-msg--${role}`,
            // `vera-status-dot--${...}`), which no extractor can see whole.
            /^vera-/,
          ],
        },
        // Extract identifier-shaped tokens rather than everything between
        // whitespace. The previous expression did not treat `$` or `{` as
        // separators, so a class built as
        //
        //     className={`logo-icon-img${collapsed ? " collapsed" : ""}`}
        //
        // yielded the single token "logo-icon-img${collapsed", PurgeCSS never
        // saw "logo-icon-img" as used, and dropped its rule from the build.
        // The logo then rendered at its intrinsic size and covered the menu —
        // in production only, since PurgeCSS does not run in development.
        //
        // The neighbouring "logo-icon-text ${...}" survived purely because it
        // had a space before the interpolation.
        defaultExtractor: (content) => content.match(/[A-Za-z0-9_:\/-]+/g) || [],
      }),
  ].filter(Boolean),
};

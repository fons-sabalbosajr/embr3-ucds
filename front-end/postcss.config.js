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
          ],
        },
        defaultExtractor: (content) => content.match(/[^\r\n\t `"'<>@]+/g) || [],
      }),
  ].filter(Boolean),
};

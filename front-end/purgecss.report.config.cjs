const path = require('path');

module.exports = {
  css: [
    path.join(__dirname, 'src/**/*.css'),
  ],
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,jsx,ts,tsx,html}'),
  ],
  safelist: {
    standard: [
      'dark-theme',
      'light-theme',
    ],
    greedy: [
      /^ant-/,
      /^rc-/,
      /^joyride/,
      /^slick-/,
    ],
  },
  defaultExtractor: (content) => content.match(/[^\r\n\t `"'<>@]+/g) || [],
  rejected: true,
  output: path.join(__dirname, 'reports/purge'),
};

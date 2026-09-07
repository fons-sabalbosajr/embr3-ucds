module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/jsx-no-target-blank': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // Build/config files run in Node, not the browser.
      files: ['vite.config.js', 'postcss.config.js', '*.config.js', '*.config.cjs'],
      env: { node: true },
    },

    // ---------------------------------------------------------------------
    // Domain boundaries.
    //
    // The unified application is a modular monolith: two business domains over
    // one shared platform. These rules make the boundary fail at lint time
    // rather than in review.
    //
    //   shared/  and  auth/   may not depend on a domain module
    //   modules/ucds/  and  modules/erms/  may not depend on each other
    //
    // Cross-domain data is read through the owning domain's service, never by
    // importing its components. See docs/UNIFICATION-PLAN.md.
    // ---------------------------------------------------------------------
    {
      files: ['src/shared/**/*.{js,jsx}', 'src/auth/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/modules/*', '**/modules/**'],
                message:
                  'Shared platform code must not depend on a domain module. Move the shared part into src/shared/, or invert the dependency.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/modules/ucds/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                // Patterns match the literal import string, so the relative
                // forms a sibling module would actually write are listed too.
                group: [
                  '**/modules/erms/**',
                  '../erms/**',
                  '../../erms/**',
                  '../../modules/erms/**',
                ],
                message:
                  'UCDS must not import from ERMS. Read ERMS data through its exported service instead.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/modules/erms/**/*.{js,jsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                // Patterns match the literal import string, so the relative
                // forms a sibling module would actually write are listed too.
                group: [
                  '**/modules/ucds/**',
                  '../ucds/**',
                  '../../ucds/**',
                  '../../modules/ucds/**',
                ],
                message:
                  'ERMS must not import from UCDS. Read the establishment register through its exported service instead.',
              },
            ],
          },
        ],
      },
    },
  ],
}

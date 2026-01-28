module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // project-wide defaults
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }]
  },
  overrides: [
    {
      files: ['tests/**/*.mjs'],
      env: { browser: true, node: true, es2021: true },
      rules: {
        // make tests more permissive
        'no-empty': ['warn', { allowEmptyCatch: true }],
        'max-lines': ['warn', { max: 800 }],
        complexity: ['warn', 18]
      }
    }
  ]
};

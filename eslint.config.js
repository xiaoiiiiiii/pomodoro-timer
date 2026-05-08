const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        window: 'readonly',
        document: 'readonly',
        Audio: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    files: ['renderer.js', 'timer-logic.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        Audio: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly'
      }
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        vi: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/', 'dist/', 'out/']
  },
  {
    files: ['vitest.config.js'],
    languageOptions: {
      sourceType: 'module'
    }
  }
];

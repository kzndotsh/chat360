// @ts-check

import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import promise from 'eslint-plugin-promise';
import react from 'eslint-plugin-react';
import * as importPlugin from 'eslint-plugin-import';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      'tmp_old',
      'node_modules',
      '.next',
      'dist',
      'build',
      'coverage',
      '**/*.min.js',
      '**/*.d.ts',
      // Exclude config files from TypeScript parsing
      'postcss.config.js',
      'vitest.setup.ts',
    ],
  },
  // Config for JS configuration files
  {
    files: [
      '*.js',
      '*.cjs',
      '*.mjs',
      'eslint.config.mjs',
      'next.config.js',
      'postcss.config.js',
      'vitest.setup.ts',
    ],
    ignores: ['src/**'],
    languageOptions: {
      globals: {
        process: true,
        module: true,
        require: true,
        __dirname: true,
        exports: true,
        global: true,
      },
      sourceType: 'module',
    },
  },
  ...compat.config({
    extends: ['eslint:recommended'],
  }),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/tmp_old/**', '**/tmp_old'],
    plugins: {
      '@next/next': nextPlugin,
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      promise: promise,
      react: react,
      import: importPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: true,
        document: true,
        navigator: true,
        localStorage: true,
        sessionStorage: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
        console: true,
        fetch: true,
        crypto: true,
        // Node.js globals
        process: true,
        // React globals
        React: true,
      },
    },
    rules: {
      // Next.js
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'error',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Promise rules
      'promise/always-return': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',

      // TypeScript
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          args: 'none',
        },
      ],
      'no-unused-vars': 'off',

      // React
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
    settings: {
      next: {
        rootDir: '.',
      },
    },
  },
];

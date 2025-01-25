import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: ['.next/**/*', 'node_modules/**/*', 'out/**/*', 'tmp_old/**/*', 'public/**/*'],
  },
  ...compat.config({
    extends: ['next', 'next/typescript', 'prettier'],
    plugins: ['perfectionist'],
    rules: {
      'perfectionist/sort-imports': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          groups: [
            // Type imports
            [
              'builtin-type',
              'external-type',
              'internal-type',
              'parent-type',
              'sibling-type',
              'index-type',
            ],
            // React imports
            'react',
            // Next.js imports
            'next',
            // External libraries
            ['builtin', 'external'],
            // Shadcn components
            'shadcn',
            // Feature components
            'features',
            // Other components
            'components',
            // Lib imports
            'lib',
            // Parent/sibling/index imports
            ['parent', 'sibling', 'index'],
            // Style imports
            'style',
          ],
          customGroups: {
            value: {
              react: ['^react$', '^react-dom$', '^react/(.*)$'],
              next: ['^next$', '^next/(.*)$'],
              shadcn: ['^@/components/ui/(.*)$'],
              features: ['^@/components/features/(.*)$'],
              components: ['^@/components/(?!ui/|features/)(.*)$'],
              lib: ['^@/lib/(.*)$'],
            },
          },
          newlinesBetween: 'always',
          internalPattern: ['^@/.*'],
        },
      ],
      'perfectionist/sort-union-types': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          groups: [
            'keyword',
            'named',
            'literal',
            'function',
            'import',
            'conditional',
            'object',
            'tuple',
            'intersection',
            'union',
            'nullish',
          ],
          newlinesBetween: 'never',
        },
      ],
      'perfectionist/sort-interfaces': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          groups: [
            'index-signature',
            'required-property',
            'optional-property',
            'required-method',
            'optional-method',
            'required-multiline-member',
            'optional-multiline-member',
          ],
          newlinesBetween: 'never',
        },
      ],
      'perfectionist/sort-variable-declarations': [
        'error',
        {
          type: 'natural',
          order: 'asc',
        },
      ],
      'perfectionist/sort-jsx-props': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          groups: ['multiline', 'callback', 'shorthand', 'unknown'],
          customGroups: {
            callback: '^on[A-Z]',
          },
          newlinesBetween: 'always',
        },
      ],
    },
  }),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
  },
];

export default eslintConfig;

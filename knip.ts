import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Entry files are the starting point for dependency analysis
  // Using more specific entry patterns rather than including everything
  entry: [
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'src/app/**/page.tsx',
    'src/app/**/layout.tsx',
    'src/app/api/**/route.ts'
  ],
  // Project files define the scope of what can be considered "unused"
  project: [
    'src/**/*.{ts,tsx}!', // Production files with ! suffix
    '!src/**/*.{test,spec}.{ts,tsx}', // Exclude test files
    '!src/**/__tests__/**'
  ],
  // Dependencies to ignore from unused checks
  ignoreDependencies: [
    '@types/*',
    'prettier-plugin-tailwindcss',
    // Common Next.js dependencies that may appear unused
    'next',
    'react',
    'react-dom'
  ],
  // Files to ignore from issue reporting
  ignore: [
    '**/*.d.ts',
    '**/generated/**', // Generated files
    'src/lib/types/**' // Type definition files
  ],
  ignoreExportsUsedInFile: true,
  // Workspace configuration for monorepo support
  workspaces: {
    // Configure specific rules per workspace if needed
    '.': {
      entry: [
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/api/**/route.ts'
      ]
    }
  },
  rules: {
    classMembers: 'warn',
    exports: 'error',
    files: 'error',
    types: 'error',
    dependencies: 'error',
    // Additional rules for better coverage
    unlisted: 'error', // Report unlisted dependencies
    duplicates: 'warn', // Warn about duplicate dependencies
    nsExports: 'error' // Check namespace exports
  }
} as const;

export default config;

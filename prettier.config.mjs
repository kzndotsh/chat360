/** @type {import('prettier').Config} */

const config = {
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'es5',
  tabWidth: 2,
  printWidth: 100,
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  singleAttributePerLine: true,
  endOfLine: 'lf',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindConfig: './tailwind.config.ts',
  tailwindFunctions: ['clsx', 'cn', 'twMerge'],
};

export default config;

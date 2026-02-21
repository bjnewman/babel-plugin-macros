import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  {
    ignores: ['src/__tests__/fixtures/', 'other/', 'dist/'],
  },
]

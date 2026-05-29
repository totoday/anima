import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Files that intentionally export both components and non-components
      // (context providers, barrel modules, sidebar sub-components, etc.) —
      // this rule fires on essentially every shared module; disable entirely.
      'react-refresh/only-export-components': 'off',

      // Empty catch blocks are a legitimate "swallow intentionally" pattern.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // React Compiler rules — useful signal but too strict as errors for
      // established patterns (stable handler refs, last-value refs, icon lookup
      // variables). Downgrade to warn so they stay visible in editors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
])

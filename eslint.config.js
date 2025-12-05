import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Fastify requires async route handlers even without await
      '@typescript-eslint/require-await': 'off',
      // Allow console in main entry point and error handlers
      'no-console': 'off',
      // Allow void for event handlers
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // vitest mocks commonly trigger this with vi.fn()
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.cjs', '*.js', 'eslint.config.js'],
  }
);

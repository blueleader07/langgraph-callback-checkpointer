import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['node_modules', 'dist', 'coverage', 'test-reports', '*.js']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            indent: ['error', 4],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-require-imports': 'off',
            'no-useless-constructor': 'off',
            'new-cap': 'off'
        }
    }
)

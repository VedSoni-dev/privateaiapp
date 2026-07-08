module.exports = {
  root: true,
  extends: 'expo',
  ignorePatterns: ['node_modules/', 'worker/node_modules/', '.claude/', '.expo/'],
  rules: {
    // React-Compiler-era rules; this app doesn't use the compiler, and
    // `useRef(new Animated.Value()).current` is the documented RN pattern.
    'react-hooks/refs': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'react/display-name': 'off',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-shadow': 'off',
        'no-undef': 'off',
      },
    },
    {
      // Plain-Node backend; its deps install on Render, not in this workspace.
      files: ['server/**/*.js', 'scripts/**/*.mjs'],
      env: { node: true },
      rules: {
        'import/no-unresolved': 'off',
        'no-undef': 'off',
      },
    },
  ],
};

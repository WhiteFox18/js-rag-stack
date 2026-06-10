module.exports = {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { decoratorMetadata: true },
        },
        module: { type: 'commonjs' },
      },
    ],
  },
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
  transform: {
    '^.+\\.(ts|js)$': 'ts-jest'
  },
  coverageReporters: ['lcov', 'text-summary'],
  collectCoverage: true,
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.spec.json'
    }
  }
};

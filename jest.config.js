const path = require('path');
const fs = require('fs');

const sdkPath = path.resolve(__dirname, '../lo-sdk/src/index.cjs');

const moduleNameMapper = {};

// 本地开发时映射 @lo/sdk；CI 环境下 lo-sdk 不存在则跳过映射
if (fs.existsSync(sdkPath)) {
  moduleNameMapper['^@lo/sdk$'] = sdkPath;
}

module.exports = {
  testMatch: ['**/test/**/*.test.cjs'],
  testEnvironment: 'node',
  transform: { '^.+\\.cjs$': 'babel-jest' },
  moduleNameMapper,
  collectCoverageFrom: [
    'packages/*/src/**/*.cjs',
    '!**/test/**',
  ],
  coverageDirectory: 'coverage',
};

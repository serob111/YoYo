/** @type {import('jest').Config} */
module.exports = {
  rootDir: "test",
  testEnvironment: "node",
  transform: { "^.+\\.ts$": "ts-jest" },
  testRegex: ".*\\.e2e-spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  setupFiles: ["<rootDir>/utils/load-test-env.ts"],
  testTimeout: 30000
};

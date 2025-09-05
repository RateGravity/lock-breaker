module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.js", "!src/**/*.test.js"],
  testMatch: ["**/__tests__/**/*.js"],
  moduleFileExtensions: ["js", "json"],
  transform: {},
  verbose: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

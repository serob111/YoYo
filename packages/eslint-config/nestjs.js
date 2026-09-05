/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ["./base.js"],
  parserOptions: {
    sourceType: "module"
  },
  rules: {
    "@typescript-eslint/no-floating-promises": "error"
  }
};

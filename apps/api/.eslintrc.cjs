/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["@yoyo/eslint-config/nestjs"],
  parserOptions: {
    project: "./tsconfig.eslint.json",
    tsconfigRootDir: __dirname
  }
};

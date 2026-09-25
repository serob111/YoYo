const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : filename.endsWith(".tsx") ? [filename] : [];
  });
}
for (const filename of files("apps/web/src")) {
  if (/lib\\i18n/.test(filename)) continue;
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node) && /[a-zа-я]/i.test(node.text)) console.log(filename, "TEXT", node.text.trim().replace(/\s+/g, " "));
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression && !/translateText|format|^<|=>/.test(node.expression.getText(source))) console.log(filename, "EXPR", node.expression.getText(source).slice(0, 180));
    if (ts.isTemplateExpression(node)) console.log(filename, "TEMPLATE", node.getText(source).slice(0, 240));
    ts.forEachChild(node, visit);
  }
  visit(source);
}

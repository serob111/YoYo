const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : filename.endsWith(".tsx") ? [filename] : [];
  });
}
let patch = "*** Begin Patch\n";
for (const filename of files("apps/web/src")) {
  const original = fs.readFileSync(filename, "utf8");
  const source = ts.createSourceFile(filename, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.body) {
      const text = node.body.getText(source);
      const declaration = "const { t: translateText, locale, intlLocale } = ";
      if (text.includes(declaration)) {
        const fields = ["translateText", "locale", "intlLocale"].filter((name) => (text.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length > 1);
        const existing = text.split("\n").find((line) => line.includes(declaration));
        const updated = existing.replace("t: translateText, locale, intlLocale", fields.map((name) => name === "translateText" ? "t: translateText" : name).join(", "));
        if (updated !== existing) replacements.push([existing, updated]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (replacements.length) {
    patch += `*** Update File: ${filename.replaceAll("\\", "/")}\n`;
    for (const [before, after] of replacements) patch += `@@\n-${before}\n+${after}\n`;
  }
}
process.stdout.write(patch + "*** End Patch");

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : filename.endsWith(".tsx") ? [filename] : [];
  });
}

const entries = new Map();
for (const filename of files("apps/web/src")) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = node.text.replace(/\s+/g, " ").trim();
      if (/[a-zA-Zа-яА-Я]/.test(value) && !/^[a-z0-9_./:@#-]+$/.test(value) && !value.includes("className") && !/(?:^| )(?:text-|bg-|flex|grid|w-|h-|border|rounded|px-|py-|gap-|items-|mt-|mb-|hover:)/.test(value)) {
        if (!entries.has(value)) entries.set(value, []);
        entries.get(value).push(filename.replaceAll("\\", "/"));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
process.stdout.write(JSON.stringify([...entries.keys()], null, 2));

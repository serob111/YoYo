const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const words = new Set();
for (const name of ["messages", "legal-messages"]) {
  const source = fs.readFileSync(`apps/web/src/lib/i18n/${name}.ts`, "utf8");
  for (const row of source.slice(source.indexOf("`") + 1, source.lastIndexOf("`")).trim().split("\n")) {
    const [english, russian] = row.split("|");
    words.add(english);
    words.add(russian);
  }
}
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&sup2;/g, "²").replace(/&nbsp;/g, " ");
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : filename.endsWith(".tsx") ? [filename] : [];
  });
}
let patch = "*** Begin Patch\n";
for (const filename of files("apps/web/src")) {
  if (/i18n|language-switcher|providers|app\\layout/.test(filename)) continue;
  const original = fs.readFileSync(filename, "utf8").replace(/\r\n/g, "\n");
  const source = ts.createSourceFile(filename, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const functions = new Set();
  const server = /app\\(?:privacy|terms|storefront\\\[orgSlug\]\\(?:not-found|layout|page))/.test(filename);
  const add = (node, text, component) => {
    edits.push({ start: node.getStart(source), end: node.end, text });
    if (component) functions.add(component);
  };
  function visit(node, component = null, display = false) {
    if (ts.isFunctionDeclaration(node) && node.body && node.name && /^[A-Z]/.test(node.name.text)) component = node;
    if (!component) return ts.forEachChild(node, (child) => visit(child, component, display));
    if (ts.isJsxText(node)) {
      const raw = decode(node.text).replace(/\s+/g, " ");
      const key = raw.trim();
      if (words.has(key)) {
        const leading = /^\s/.test(raw) ? " " : "";
        const trailing = /\s$/.test(raw) ? " " : "";
        add(node, `${leading}{translateText(${JSON.stringify(key)})}${trailing}`, component);
      }
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const allowed = /^(title|subtitle|label|placeholder|aria-label|alt|description|submitLabel)$/.test(node.name.text);
      if (allowed && node.initializer && ts.isStringLiteral(node.initializer) && words.has(decode(node.initializer.text))) {
        add(node.initializer, `{translateText(${JSON.stringify(decode(node.initializer.text))})}`, component);
      } else if (allowed && node.initializer) visit(node.initializer, component, true);
      else if (node.initializer && ts.isJsxExpression(node.initializer)) {
        ts.forEachChild(node.initializer, (child) => visit(child, component, false));
      }
      return;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const expression = node.expression;
      const text = expression.getText(source);
      const parentIsAttribute = ts.isJsxAttribute(node.parent);
      if (!parentIsAttribute) display = true;
      if (display && (/^(?:[A-Z_]*LABELS?|SENDER_LABEL)\[/.test(text) || /^(?:greeting|label|type|status|period|role|intent|state|error|submitError|sendError|home\.(?:title|meta|tag)|item\.label|message\.status|member\.role|viewing\.status|followUp\.(?:status|actionType)|task\.status|execution\.status|roleLabel\(.+\))$/.test(text))) {
        add(expression, `translateText(${text})`, component);
        return;
      }
    }
    if (display && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && words.has(node.text)) {
      add(node, `translateText(${JSON.stringify(node.text)})`, component);
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^toLocale(?:DateString|TimeString|String)$/.test(node.expression.name.text)) {
      if (node.arguments.length === 0) edits.push({ start: node.end - 1, end: node.end - 1, text: "intlLocale" });
      else if (ts.isStringLiteral(node.arguments[0])) add(node.arguments[0], "intlLocale", component);
      functions.add(component);
    }
    if (ts.isCallExpression(node) && /^(formatCents|formatPrice)$/.test(node.expression.getText(source))) {
      edits.push({ start: node.end - 1, end: node.end - 1, text: ", locale" });
      functions.add(component);
    }
    ts.forEachChild(node, (child) => visit(child, component, display && !ts.isCallExpression(node) && !ts.isBinaryExpression(node)));
  }
  visit(source);
  if (!edits.length) continue;
  for (const component of functions) {
    edits.push({ start: component.body.getStart(source) + 1, end: component.body.getStart(source) + 1, text: `\n  const { t: translateText, locale, intlLocale } = ${server ? "getI18n" : "useI18n"}();` });
  }
  let updated = original;
  for (const edit of edits.sort((first, second) => second.start - first.start)) updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  const imported = `import { ${server ? "getI18n" : "useI18n"} } from "@/lib/i18n/${server ? "server" : "provider"}";\n`;
  if (!server && !/^"use client"/.test(updated)) updated = '"use client";\n\n' + imported + updated;
  else if (!server) updated = updated.replace(/^("use client";?\n)/, `$1\n${imported}`);
  else updated = imported + updated;
  const before = original.trimEnd().split("\n");
  const after = updated.trimEnd().split("\n");
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left--) {
    for (let right = after.length - 1; right >= 0; right--) {
      lengths[left][right] = before[left] === after[right] ? lengths[left + 1][right + 1] + 1 : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
    }
  }
  const operations = [];
  let left = 0;
  let right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) { operations.push(" " + before[left++]); right++; }
    else if (right < after.length && (left === before.length || lengths[left][right + 1] >= lengths[left + 1][right])) operations.push("+" + after[right++]);
    else operations.push("-" + before[left++]);
  }
  patch += `*** Update File: ${filename.replaceAll("\\", "/")}\n`;
  let position = 0;
  while (position < operations.length) {
    if (operations[position][0] === " ") { position++; continue; }
    const start = Math.max(0, position - 2);
    let end = position + 1;
    while (end < operations.length) {
      if (operations[end][0] !== " ") end++;
      else if (operations.slice(end, end + 5).some((line) => line[0] !== " ")) end++;
      else break;
    }
    end = Math.min(operations.length, end + 2);
    patch += "@@\n" + operations.slice(start, end).join("\n") + "\n";
    position = end;
  }
}
process.stdout.write(patch + "*** End Patch");

import { slugify, withUniqueSuffix } from "./slug.util";

describe("slugify", () => {
  it("lowercases and dashes the name", () => {
    expect(slugify("Acme Bakery & Co.")).toBe("acme-bakery-co");
  });

  it("falls back to 'org' for a name with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("org");
  });

  it("withUniqueSuffix appends a distinguishing suffix", () => {
    const a = withUniqueSuffix("acme");
    const b = withUniqueSuffix("acme");
    expect(a).not.toEqual(b);
    expect(a.startsWith("acme-")).toBe(true);
  });
});

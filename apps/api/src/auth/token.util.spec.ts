import { generateOpaqueToken, hashToken } from "./token.util";

describe("token.util", () => {
  it("generates unique tokens", () => {
    expect(generateOpaqueToken()).not.toEqual(generateOpaqueToken());
  });

  it("hashes deterministically", () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("a")).not.toEqual(hashToken("b"));
  });
});

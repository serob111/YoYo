// Property/BuyerPreference/PropertyImportCandidate price fields are BigInt in
// the DB (a real AMD-denominated property already exceeds Postgres's INT4
// range once converted to cents). Node's JSON.stringify has no native BigInt
// support and throws "Do not know how to serialize a BigInt" for any
// response containing one. Imported for its side effect from app.module.ts
// (not main.ts) so it's installed regardless of entry point - the e2e test
// harness (test/utils/test-app.ts) builds AppModule directly and never runs
// main.ts's bootstrap.
//
// BigInt values serialize as numeric strings on the wire; the frontend
// converts back with Number(...) wherever it does arithmetic (see
// apps/web/src/lib/format.ts) - safe, since cent amounts never approach
// Number's 2^53 safe-integer limit.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

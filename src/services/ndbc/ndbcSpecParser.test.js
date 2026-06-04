import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNdbcSpecLatest } from "./ndbcSpecParser.js";

const SAMPLE = `#YY  MM DD hh mm WVHT  SwH  SwP  WWH  WWP SwD WWD  STEEPNESS  APD MWD
#yr  mo dy hr mn    m    m  sec    m  sec  -  degT     -      sec degT
2026 05 24 20 56  1.5  1.1 16.7  1.1  8.3  NW  NW      SWELL  9.2 306
`;

describe("parseNdbcSpecLatest", () => {
  it("parses latest row WVHT and metadata", () => {
    const r = parseNdbcSpecLatest(SAMPLE);
    assert.ok(r);
    assert.equal(r.hsM, 1.5);
    assert.equal(r.swellHsM, 1.1);
    assert.equal(r.periodS, 16.7);
    assert.equal(r.directionDeg, 306);
    assert.ok(Number.isFinite(r.ageMinutes));
  });

  it("returns null for empty input", () => {
    assert.equal(parseNdbcSpecLatest(""), null);
  });
});

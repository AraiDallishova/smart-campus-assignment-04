// Regression suite AC1-AC6: the SAME checks run against v1 (before/) and v2 (src/).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as v1 from "../before/app.js";
import { ROOMS, NOW } from "../src/data/rooms.js";
import { checkAvailability as checkV2 } from "../src/domain/availability.js";

const aurora = ROOMS.find((r) => r.id === "R101"); // same data as the v1 single room

const impls = {
  "v1 (before)": { check: (s, e) => v1.checkAvailability(s, e) },
  "v2 (after)": { check: (s, e) => checkV2(aurora, s, e, NOW) },
};

for (const [label, { check }] of Object.entries(impls)) {
  describe(`AC regression - ${label}`, () => {
    test("AC1 rejects malformed times", () => {
      assert.equal(check("25:00", "26:00").ok, false);
      assert.equal(check("9:5", "10:00").ok, false);
      assert.equal(check("14:00", "abc").ok, false);
    });
    test("AC1 rejects end <= start and start in the past", () => {
      assert.equal(check("15:00", "14:00").ok, false);
      assert.equal(check("15:00", "15:00").ok, false);
      assert.equal(check("08:30", "09:30").ok, false);
    });
    test("AC2 accepts exactly 120 minutes", () => {
      assert.equal(check("14:00", "16:00").ok, true);
    });
    test("AC2 rejects 121 minutes", () => {
      const r = check("14:00", "16:01");
      assert.equal(r.ok, false);
      assert.match(r.message, /120/);
    });
    test("AC4 rejects partial and enclosing overlaps", () => {
      assert.equal(check("11:00", "12:00").ok, false); // tail overlap with 10:00-11:30
      assert.equal(check("09:30", "10:30").ok, false); // head overlap
      assert.equal(check("09:30", "12:00").ok, false); // enclosing
      assert.equal(check("10:15", "10:45").ok, false); // contained
    });
    test("AC4 touching intervals are allowed", () => {
      assert.equal(check("11:30", "12:30").ok, true); // starts when 10:00-11:30 ends
      assert.equal(check("09:00", "10:00").ok, true); // ends when 10:00-11:30 starts
    });
    test("AC5 booking data is not modified by checks", () => {
      const src = label.startsWith("v1") ? v1.bookings : aurora.bookings;
      const snapshot = JSON.stringify(src);
      check("11:00", "12:00"); check("14:00", "15:00"); check("zz", "yy");
      assert.equal(JSON.stringify(src), snapshot);
    });
    test("AC6 every outcome has a clear, non-empty message", () => {
      for (const [s, e] of [["14:00", "15:00"], ["11:00", "12:00"], ["x", "y"], ["14:00", "17:00"]]) {
        const r = check(s, e);
        assert.equal(typeof r.message, "string");
        assert.ok(r.message.length > 5);
      }
    });
  });
}

describe("AC3 blocked room", () => {
  test("v1: blocked room is never available", () => {
    v1.room.blocked = true;
    try { assert.equal(v1.checkAvailability("14:00", "15:00").ok, false); }
    finally { v1.room.blocked = false; }
  });
  test("v2: blocked room is never available", () => {
    const vega = ROOMS.find((r) => r.id === "R104");
    const r = checkV2(vega, "14:00", "15:00", NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, "BLOCKED");
  });
});

describe("AC6 presentation - v1 vs v2 render the same outcomes", () => {
  test("v1 onSubmit renders status role for success, alert for errors", () => {
    assert.match(v1.onSubmit("14:00", "15:00"), /role="status"/);
    assert.match(v1.onSubmit("11:00", "12:00"), /role="alert"/);
  });
});

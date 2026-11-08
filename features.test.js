// New requirements F1-F5 + room catalog + integration checks (v2 only).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ROOMS, NOW } from "../src/data/rooms.js";
import { filterRooms, allEquipment } from "../src/domain/filters.js";
import { checkAvailability } from "../src/domain/availability.js";
import { renderRoomList, renderResult } from "../src/ui/render.js";
import { createController } from "../src/ui/controller.js";

const byId = (id) => ROOMS.find((r) => r.id === id);
const ids = (rooms) => rooms.map((r) => r.id);

describe("Room catalog", () => {
  test("contains at least four rooms with all required fields", () => {
    assert.ok(ROOMS.length >= 4);
    for (const r of ROOMS) {
      assert.ok(r.id && r.name);
      assert.ok(Number.isInteger(r.capacity) && r.capacity > 0);
      assert.ok(Array.isArray(r.equipment) && Array.isArray(r.bookings));
      assert.equal(typeof r.blocked, "boolean");
    }
  });
  test("room data is deeply frozen (immutable)", () => {
    assert.ok(Object.isFrozen(ROOMS) && Object.isFrozen(ROOMS[0]) && Object.isFrozen(ROOMS[0].bookings[0]));
    assert.throws(() => { "use strict"; ROOMS[0].bookings.push({ start: "15:00", end: "16:00" }); }, TypeError);
  });
});

describe("F1 capacity filter", () => {
  test("exact capacity is accepted (>=)", () => {
    assert.ok(ids(filterRooms(ROOMS, { attendees: 30 })).includes("R101")); // capacity exactly 30
  });
  test("insufficient capacity is rejected", () => {
    assert.ok(!ids(filterRooms(ROOMS, { attendees: 31 })).includes("R101"));
    assert.deepEqual(ids(filterRooms(ROOMS, { attendees: 31 })), ["R104"]);
  });
});

describe("F2 equipment filter", () => {
  test("room must contain ALL selected items", () => {
    assert.deepEqual(ids(filterRooms(ROOMS, { equipment: ["projector", "video-conference"] })), ["R102", "R104"]);
  });
  test("an item nobody has yields no rooms; filters combine with AND", () => {
    assert.deepEqual(filterRooms(ROOMS, { equipment: ["3d-printer"] }), []);
    assert.deepEqual(ids(filterRooms(ROOMS, { attendees: 10, equipment: ["whiteboard"] })), ["R101", "R102"]);
  });
  test("equipment list for the UI is unique and sorted", () => {
    const list = allEquipment(ROOMS);
    assert.deepEqual(list, [...new Set(list)].sort());
  });
});

describe("F3 blocked room", () => {
  test("blocked room cannot be reported as available, even with no bookings", () => {
    const r = checkAvailability(byId("R104"), "14:00", "15:00", NOW);
    assert.equal(r.ok, false);
    assert.equal(r.code, "BLOCKED");
  });
});

describe("F4 empty state", () => {
  test("no matching rooms renders a clear empty-state message", () => {
    const html = renderRoomList(filterRooms(ROOMS, { attendees: 500 }), null);
    assert.match(html, /class="empty"/);
    assert.match(html, /No rooms match/);
  });
});

describe("F5 room switching + per-room data", () => {
  test("availability uses the chosen room's own bookings", () => {
    assert.equal(checkAvailability(byId("R101"), "11:00", "12:00", NOW).ok, false); // 10:00-11:30
    assert.equal(checkAvailability(byId("R102"), "11:00", "12:00", NOW).ok, true);  // touches 12:00 only
    assert.equal(checkAvailability(byId("R103"), "11:00", "12:00", NOW).code, "CONFLICT"); // own booking 11:00-12:00
  });
});

describe("Integration: controller + renderer", () => {
  test("switching room refreshes the result (conflict -> available)", () => {
    const ctl = createController(ROOMS, NOW);
    ctl.selectRoom("R101");
    ctl.check("11:00", "12:00");
    assert.match(ctl.view().result, /Not available/);
    ctl.selectRoom("R102"); // same time window, different room
    assert.match(ctl.view().result, /Nova Seminar Room is available/);
  });
  test("changing filters that hide the selected room clears selection and result", () => {
    const ctl = createController(ROOMS, NOW);
    ctl.selectRoom("R103");
    ctl.check("14:00", "15:00");
    assert.match(ctl.view().result, /Available/);
    ctl.setFilters({ attendees: 20 }); // Orion Studio (6 seats) is hidden
    const v = ctl.view();
    assert.equal(ctl.state.selectedId, null);
    assert.equal(v.result, "");
    assert.ok(!v.rooms.includes("Orion Studio"));
  });
  test("full flow: filter -> select -> check shows correct HTML", () => {
    const ctl = createController(ROOMS, NOW);
    ctl.setFilters({ attendees: 10, equipment: ["projector"] });
    assert.deepEqual([...ctl.view().rooms.matchAll(/value="(R\d+)"/g)].map((m) => m[1]), ["R101", "R102", "R104"]);
    ctl.selectRoom("R104");
    ctl.check("14:00", "15:00");
    assert.match(ctl.view().result, /blocked/i);
  });
  test("renderResult escapes HTML in messages and returns empty for null", () => {
    assert.equal(renderResult(null), "");
    assert.ok(!renderResult({ ok: false, code: "X", message: "<script>alert(1)</script>" }).includes("<script>"));
  });
});

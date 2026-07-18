import assert from "node:assert/strict";
import test from "node:test";
import { applyViewQuery, evaluateFilter, groupRecords } from "../lib/database/query.ts";

const records = [
  { id: "1", title: "Ship offline package", properties: { status: "Done", priority: "High", progress: 100, tags: ["Offline"] } },
  { id: "2", title: "Build Telegram adapter", properties: { status: "Inbox", priority: "Medium", progress: 12, tags: ["Connector"] } },
  { id: "3", title: "Review sync protocol", properties: { status: "Review", priority: "High", progress: 80, tags: ["Sync", "Offline"] } },
];

test("evaluates nested AND/OR filters up to the Notion-compatible depth", () => {
  const filter = {
    type: "group",
    operator: "and",
    filters: [
      { type: "condition", property: "priority", operator: "equals", value: "High" },
      {
        type: "group",
        operator: "or",
        filters: [
          { type: "condition", property: "status", operator: "equals", value: "Done" },
          { type: "condition", property: "tags", operator: "contains", value: "Sync" },
        ],
      },
    ],
  };
  assert.deepEqual(records.filter((record) => evaluateFilter(record, filter)).map((record) => record.id), ["1", "3"]);
});

test("applies search and multi-sort without mutating the source", () => {
  const original = structuredClone(records);
  const result = applyViewQuery(records, {
    search: "offline",
    sorts: [{ property: "progress", direction: "descending" }],
  });
  assert.deepEqual(result.map((record) => record.id), ["1", "3"]);
  assert.deepEqual(records, original);
});

test("groups multi-select values into each matching group", () => {
  const groups = groupRecords(records, "tags");
  assert.deepEqual(groups.get("Offline")?.map((record) => record.id), ["1", "3"]);
  assert.deepEqual(groups.get("Connector")?.map((record) => record.id), ["2"]);
});

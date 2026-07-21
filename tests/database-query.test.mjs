import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("database UI exposes persisted nested filters and ordered multi-sort", async () => {
  const [workspace, route] = await Promise.all([
    readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/database/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /function FilterGroupEditor/);
  assert.match(workspace, /depth < 3/);
  assert.match(workspace, /setFilterGroup\(tableConfig\.filters/);
  assert.match(workspace, /setFilterGroup\(config\.filters/);
  assert.match(workspace, /function SortEditor/);
  assert.match(workspace, /从上到下优先/);
  assert.match(workspace, /BoardView\(\{ tasks, property, subGroupProperty/);
  assert.match(workspace, /CalendarView\(\{ tasks, dateProperty/);
  assert.match(workspace, /MapView\(\{ tasks, placeProperty/);
  assert.match(workspace, /FormView\(\{ schema, addTask/);
  assert.match(workspace, /groupTasksByProperty\(group, subGroupBy\)/);
  assert.doesNotMatch(workspace, /statusFilter|priorityFilter/);
  assert.match(route, /FilterGroupDepth3Schema/);
  assert.match(route, /config: ViewConfigSchema/);
  assert.match(route, /sorts: z\.array\([\s\S]*?\)\.max\(20\)/);
});

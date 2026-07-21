import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  computeDatabaseProperties,
  databasePropertySchemaMarkdown,
  defaultProductTaskPropertySchema,
  evaluateDatabaseFormula,
  normalizeDatabasePropertySchema,
  normalizeDatabasePropertyValues,
} from "../lib/database/properties.ts";

test("database property schema validates the Notion-style property model", () => {
  const schema = normalizeDatabasePropertySchema(defaultProductTaskPropertySchema);
  assert.equal(schema.properties.filter((property) => property.type === "title").length, 1);
  assert.equal(schema.properties.find((property) => property.id === "dependency_count")?.type, "rollup");
  assert.match(databasePropertySchemaMarkdown("产品任务", schema), /\| 依赖数量 \| `dependency_count` \| rollup \| count \|/);

  assert.throws(() => normalizeDatabasePropertySchema({ version: 1, properties: [
    { id: "title", name: "标题", type: "title" },
    { id: "bad_rollup", name: "汇总", type: "rollup", rollup: { relationPropertyId: "missing", targetPropertyId: "title", aggregation: "count" } },
  ] }), /无效的关联属性/);
  assert.throws(() => normalizeDatabasePropertySchema({ version: 1, properties: [
    { id: "title", name: "标题", type: "title" },
    { id: "title", name: "重复", type: "text" },
  ] }), /无效或重复/);
  assert.throws(() => normalizeDatabasePropertySchema({ version: 1, properties: [
    { id: "title", name: "标题", type: "title" },
    { id: "danger", name: "危险按钮", type: "button", button: { label: "打开", action: "open-url", url: "javascript:alert(1)" } },
  ] }), /只允许 HTTP\(S\) 链接/);
});

test("formula evaluator handles precedence and supported functions without eval", () => {
  const context = { progress: 86, title: "Sync", tags: ["Cloud", "Core"] };
  assert.equal(evaluateDatabaseFormula("1 + 2 * 3", context), 7);
  assert.equal(evaluateDatabaseFormula('if(progress >= 100, "Complete", upper(title))', context), "SYNC");
  assert.equal(evaluateDatabaseFormula('contains(tags, "Cloud") && length(title) == 4', context), true);
  assert.equal(evaluateDatabaseFormula('round(10 / 3, 2)', context), 3.33);
  assert.equal(evaluateDatabaseFormula('prop("constructor")', context), null);
  assert.equal(evaluateDatabaseFormula("__proto__", context), null);
  assert.throws(() => evaluateDatabaseFormula("globalThis.process.exit()", context), /数字无效|不支持的公式字符/);
  assert.throws(() => evaluateDatabaseFormula("constructor(1)", context), /不支持的公式函数/);
});

test("relations, rollups, IDs, timestamps and formulas compute deterministically", () => {
  const recordsById = new Map([
    ["T-1", { title: "First", properties: { progress: 100 } }],
    ["T-2", { title: "Second", properties: { progress: 40 } }],
  ]);
  const result = computeDatabaseProperties({
    schema: defaultProductTaskPropertySchema,
    raw: { progress: 100, dependencies: ["T-1", "T-2"] },
    record: { id: "T-25", title: "Ship", createdAt: "2026-07-20T10:00:00Z", updatedAt: "2026-07-21T10:00:00Z" },
    recordsById,
  });
  assert.equal(result.dependency_count, 2);
  assert.equal(result.activity, "Complete");
  assert.equal(result.task_id, "TASK-25");
  assert.equal(result.created_at, "2026-07-20T10:00:00Z");
  assert.equal(result.updated_at, "2026-07-21T10:00:00Z");
});

test("writable property normalization strips unknown and derived values", () => {
  const result = normalizeDatabasePropertyValues(defaultProductTaskPropertySchema, {
    status: "Review",
    progress: "72",
    tags: ["Sync", "Sync", "Cloud"],
    dependencies: ["T-1", "T-2"],
    activity: "forged",
    dependency_count: 999,
    task_id: "forged",
    unknown: "drop me",
  });
  assert.deepEqual(result, {
    status: "Review",
    tags: ["Sync", "Cloud"],
    progress: 72,
    dependencies: ["T-1", "T-2"],
  });
});

test("database API persists schema revisions and returns computed properties", async () => {
  const [route, schema] = await Promise.all([
    readFile(new URL("../app/api/database/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/ensure.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /action: z\.literal\("save-schema"\)/);
  assert.match(route, /computeDatabaseProperties/);
  assert.match(route, /baseRevision/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS database_property_schemas/);
});

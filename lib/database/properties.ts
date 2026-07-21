export const DATABASE_PROPERTY_TYPES = [
  "title", "text", "number", "select", "multi-select", "status", "date", "person", "files",
  "checkbox", "url", "email", "phone", "created-time", "created-by", "last-edited-time",
  "last-edited-by", "formula", "relation", "rollup", "button", "id", "place",
] as const;

export type DatabasePropertyType = typeof DATABASE_PROPERTY_TYPES[number];
export type RollupAggregation = "count" | "count-values" | "sum" | "average" | "min" | "max" | "percent-checked" | "show-unique";

export type DatabasePropertyDefinition = {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: string[];
  numberFormat?: "number" | "percent" | "currency";
  formula?: string;
  relation?: { dataSourceId: string; twoWay?: boolean };
  rollup?: { relationPropertyId: string; targetPropertyId: string; aggregation: RollupAggregation };
  button?: { label: string; action: "set-property" | "open-url"; propertyId?: string; value?: unknown; url?: string };
  idPrefix?: string;
};

export type DatabasePropertySchema = {
  version: 1;
  properties: DatabasePropertyDefinition[];
};

const typeSet = new Set<string>(DATABASE_PROPERTY_TYPES);
const rollupSet = new Set<string>(["count", "count-values", "sum", "average", "min", "max", "percent-checked", "show-unique"]);

export const defaultProductTaskPropertySchema: DatabasePropertySchema = {
  version: 1,
  properties: [
    { id: "title", name: "任务名称", type: "title" },
    { id: "status", name: "状态", type: "status", options: ["Inbox", "In progress", "Review", "Done"] },
    { id: "priority", name: "优先级", type: "select", options: ["High", "Medium", "Low"] },
    { id: "due", name: "截止日期", type: "date" },
    { id: "owner", name: "负责人", type: "person" },
    { id: "tags", name: "标签", type: "multi-select", options: ["Product", "Offline", "Sync", "Cloud", "Connector", "Database", "Core"] },
    { id: "progress", name: "进度", type: "number", numberFormat: "percent" },
    { id: "place", name: "位置", type: "place" },
    { id: "dependencies", name: "依赖任务", type: "relation", relation: { dataSourceId: "product-tasks", twoWay: false } },
    { id: "dependency_count", name: "依赖数量", type: "rollup", rollup: { relationPropertyId: "dependencies", targetPropertyId: "title", aggregation: "count" } },
    { id: "activity", name: "活跃状态", type: "formula", formula: "if(progress >= 100, \"Complete\", \"Active\")" },
    { id: "task_id", name: "任务 ID", type: "id", idPrefix: "TASK" },
    { id: "created_at", name: "创建时间", type: "created-time" },
    { id: "updated_at", name: "最后编辑时间", type: "last-edited-time" },
  ],
};

function stringList(value: unknown, max = 100) {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

export function normalizeDatabasePropertySchema(input: unknown): DatabasePropertySchema {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("属性 schema 必须是对象");
  const raw = input as { version?: unknown; properties?: unknown };
  if (!Array.isArray(raw.properties) || raw.properties.length < 1 || raw.properties.length > 100) throw new Error("属性数量必须在 1–100 之间");
  const seen = new Set<string>();
  const properties = raw.properties.map((value, index): DatabasePropertyDefinition => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`第 ${index + 1} 个属性无效`);
    const item = value as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    const name = String(item.name ?? "").trim();
    const type = String(item.type ?? "") as DatabasePropertyType;
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) || seen.has(id)) throw new Error(`属性 id 无效或重复：${id || index + 1}`);
    if (!name || name.length > 100 || !typeSet.has(type)) throw new Error(`属性 ${id} 的名称或类型无效`);
    seen.add(id);
    const property: DatabasePropertyDefinition = { id, name, type };
    const options = stringList(item.options, 100);
    if (options?.length) property.options = options;
    if (["number", "percent", "currency"].includes(String(item.numberFormat))) property.numberFormat = item.numberFormat as DatabasePropertyDefinition["numberFormat"];
    if (type === "formula") {
      const formula = String(item.formula ?? "").trim();
      if (!formula || formula.length > 500) throw new Error(`公式属性 ${id} 缺少有效表达式`);
      property.formula = formula;
    }
    if (type === "relation") {
      const relation = item.relation as Record<string, unknown> | undefined;
      const dataSourceId = String(relation?.dataSourceId ?? "").trim();
      if (!dataSourceId || dataSourceId.length > 240) throw new Error(`关联属性 ${id} 缺少有效数据源`);
      property.relation = { dataSourceId, twoWay: Boolean(relation?.twoWay) };
    }
    if (type === "rollup") {
      const rollup = item.rollup as Record<string, unknown> | undefined;
      const aggregation = String(rollup?.aggregation ?? "") as RollupAggregation;
      if (!rollupSet.has(aggregation)) throw new Error(`汇总属性 ${id} 的聚合方式无效`);
      property.rollup = {
        relationPropertyId: String(rollup?.relationPropertyId ?? ""),
        targetPropertyId: String(rollup?.targetPropertyId ?? ""),
        aggregation,
      };
      if (!property.rollup.relationPropertyId || !property.rollup.targetPropertyId) throw new Error(`汇总属性 ${id} 缺少关联或目标属性`);
    }
    if (type === "id") property.idPrefix = String(item.idPrefix ?? "ID").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || "ID";
    if (type === "button") {
      const button = item.button as Record<string, unknown> | undefined;
      const action = String(button?.action ?? "set-property") as "set-property" | "open-url";
      const label = String(button?.label ?? name).trim().slice(0, 100) || name;
      if (!button || !["set-property", "open-url"].includes(action)) throw new Error(`按钮属性 ${id} 的动作无效`);
      if (action === "open-url") {
        const url = String(button.url ?? "").trim();
        let parsed: URL;
        try { parsed = new URL(url); } catch { throw new Error(`按钮属性 ${id} 的链接无效`); }
        if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(`按钮属性 ${id} 只允许 HTTP(S) 链接`);
        property.button = { label, action, url: parsed.toString() };
      } else {
        property.button = { label, action, propertyId: String(button.propertyId ?? "").trim(), value: button.value };
      }
    }
    return property;
  });
  if (properties.filter((property) => property.type === "title").length !== 1) throw new Error("数据源必须且只能有一个标题属性");
  for (const property of properties) {
    if (property.type === "rollup") {
      const relation = properties.find((candidate) => candidate.id === property.rollup?.relationPropertyId);
      if (relation?.type !== "relation") throw new Error(`汇总属性 ${property.id} 引用了无效的关联属性`);
    }
    if (property.type === "button" && property.button?.action === "set-property") {
      const target = properties.find((candidate) => candidate.id === property.button?.propertyId);
      if (!target || ["title", "button", "formula", "rollup", "id", "created-time", "created-by", "last-edited-time", "last-edited-by"].includes(target.type)) {
        throw new Error(`按钮属性 ${property.id} 引用了不可写的目标属性`);
      }
    }
  }
  return { version: 1, properties };
}

export function databasePropertySchemaMarkdown(name: string, schema: DatabasePropertySchema) {
  const rows = schema.properties.map((property) => `| ${property.name} | \`${property.id}\` | ${property.type} | ${property.formula ?? property.rollup?.aggregation ?? ""} |`);
  return [
    `# ${name} · 属性 Schema`,
    "",
    "| 属性 | ID | 类型 | 派生规则 |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
  ].join("\n");
}

type FormulaToken = { type: "number" | "string" | "identifier" | "operator" | "punctuation" | "eof"; value: string };

function tokenizeFormula(source: string) {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9.]/.test(char)) {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
      if (!match) throw new Error("数字无效");
      tokens.push({ type: "number", value: match[0] }); index += match[0].length; continue;
    }
    if (char === '"' || char === "'") {
      const quote = char; let value = ""; index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          index += 1;
          const escaped = source[index];
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped ?? "";
        } else value += source[index];
        index += 1;
      }
      if (source[index] !== quote) throw new Error("字符串没有结束");
      index += 1; tokens.push({ type: "string", value }); continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/)?.[0];
    if (identifier) { tokens.push({ type: "identifier", value: identifier }); index += identifier.length; continue; }
    const operator = ["===", "!==", ">=", "<=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", ">", "<", "!"].find((item) => source.startsWith(item, index));
    if (operator) { tokens.push({ type: "operator", value: operator }); index += operator.length; continue; }
    if (["(", ")", ","].includes(char)) { tokens.push({ type: "punctuation", value: char }); index += 1; continue; }
    throw new Error(`不支持的公式字符：${char}`);
  }
  if (tokens.length > 256) throw new Error("公式过长");
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function formulaFunction(name: string, args: unknown[], context: Record<string, unknown>) {
  if (name === "prop") {
    const key = String(args[0] ?? "");
    return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : null;
  }
  if (name === "if") return args[0] ? args[1] : args[2];
  if (name === "empty") return args[0] === null || args[0] === undefined || args[0] === "" || (Array.isArray(args[0]) && args[0].length === 0);
  if (name === "length") return Array.isArray(args[0]) || typeof args[0] === "string" ? args[0].length : 0;
  if (name === "contains") return Array.isArray(args[0]) ? args[0].includes(args[1]) : String(args[0] ?? "").includes(String(args[1] ?? ""));
  if (name === "lower") return String(args[0] ?? "").toLowerCase();
  if (name === "upper") return String(args[0] ?? "").toUpperCase();
  if (name === "round") return Math.round(numeric(args[0]) * 10 ** numeric(args[1])) / 10 ** numeric(args[1]);
  if (name === "min") return Math.min(...args.map(numeric));
  if (name === "max") return Math.max(...args.map(numeric));
  throw new Error(`不支持的公式函数：${name}`);
}

class FormulaParser {
  private index = 0;
  private depth = 0;
  private readonly tokens: FormulaToken[];
  private readonly context: Record<string, unknown>;
  constructor(tokens: FormulaToken[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.context = context;
  }

  private current() { return this.tokens[this.index]; }
  private consume(value?: string) {
    const token = this.current();
    if (value && token.value !== value) throw new Error(`公式需要 ${value}`);
    this.index += 1;
    return token;
  }

  parse() {
    const value = this.expression(0);
    if (this.current().type !== "eof") throw new Error("公式包含多余内容");
    return value;
  }

  private expression(minimum: number): unknown {
    this.depth += 1;
    if (this.depth > 20) throw new Error("公式嵌套过深");
    let left = this.unary();
    const precedence: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "===": 3, "!=": 3, "!==": 3, ">": 4, ">=": 4, "<": 4, "<=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
    while (this.current().type === "operator" && (precedence[this.current().value] ?? -1) >= minimum) {
      const operator = this.consume().value;
      const right = this.expression(precedence[operator] + 1);
      if (operator === "+") left = typeof left === "string" || typeof right === "string" ? String(left ?? "") + String(right ?? "") : numeric(left) + numeric(right);
      else if (operator === "-") left = numeric(left) - numeric(right);
      else if (operator === "*") left = numeric(left) * numeric(right);
      else if (operator === "/") left = numeric(right) === 0 ? null : numeric(left) / numeric(right);
      else if (operator === "%") left = numeric(right) === 0 ? null : numeric(left) % numeric(right);
      else if (["==", "==="].includes(operator)) left = left === right;
      else if (["!=", "!=="].includes(operator)) left = left !== right;
      else if (operator === ">") left = numeric(left) > numeric(right);
      else if (operator === ">=") left = numeric(left) >= numeric(right);
      else if (operator === "<") left = numeric(left) < numeric(right);
      else if (operator === "<=") left = numeric(left) <= numeric(right);
      else if (operator === "&&") left = Boolean(left && right);
      else if (operator === "||") left = Boolean(left || right);
    }
    this.depth -= 1;
    return left;
  }

  private unary(): unknown {
    if (this.current().value === "!") { this.consume("!"); return !this.unary(); }
    if (this.current().value === "-") { this.consume("-"); return -numeric(this.unary()); }
    return this.primary();
  }

  private primary(): unknown {
    const token = this.consume();
    if (token.type === "number") return Number(token.value);
    if (token.type === "string") return token.value;
    if (token.value === "(") { const result = this.expression(0); this.consume(")"); return result; }
    if (token.type !== "identifier") throw new Error("公式值无效");
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (token.value === "null") return null;
    if (this.current().value !== "(") return Object.prototype.hasOwnProperty.call(this.context, token.value) ? this.context[token.value] : null;
    this.consume("(");
    const args: unknown[] = [];
    while (this.current().value !== ")") {
      args.push(this.expression(0));
      if (this.current().value !== ",") break;
      this.consume(",");
    }
    this.consume(")");
    return formulaFunction(token.value, args, this.context);
  }
}

export function evaluateDatabaseFormula(formula: string, context: Record<string, unknown>) {
  return new FormulaParser(tokenizeFormula(formula), context).parse();
}

function rollupValue(values: unknown[], aggregation: RollupAggregation) {
  if (aggregation === "count") return values.length;
  if (aggregation === "count-values") return values.filter((value) => value !== null && value !== undefined && value !== "").length;
  if (aggregation === "show-unique") return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => value !== null && value !== undefined && value !== ""))];
  if (aggregation === "percent-checked") return values.length ? Math.round(values.filter(Boolean).length / values.length * 100) : 0;
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  if (aggregation === "sum") return numbers.reduce((total, value) => total + value, 0);
  if (aggregation === "average") return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  if (aggregation === "min") return Math.min(...numbers);
  if (aggregation === "max") return Math.max(...numbers);
  return null;
}

export function computeDatabaseProperties(input: {
  schema: DatabasePropertySchema;
  raw: Record<string, unknown>;
  record: { id: string; title: string; createdAt?: string; updatedAt?: string; createdBy?: string; updatedBy?: string };
  recordsById?: Map<string, { title: string; properties: Record<string, unknown> }>;
}) {
  const result: Record<string, unknown> = { ...input.raw, title: input.record.title };
  for (const property of input.schema.properties) {
    if (property.type === "created-time") result[property.id] = input.record.createdAt ?? null;
    else if (property.type === "last-edited-time") result[property.id] = input.record.updatedAt ?? null;
    else if (property.type === "created-by") result[property.id] = input.record.createdBy ?? "Sophie";
    else if (property.type === "last-edited-by") result[property.id] = input.record.updatedBy ?? "Sophie";
    else if (property.type === "id") {
      const numericPart = input.record.id.match(/(\d+)(?!.*\d)/)?.[1] ?? input.record.id.replace(/[^A-Za-z0-9]/g, "").slice(-8);
      result[property.id] = `${property.idPrefix || "ID"}-${numericPart}`;
    } else if (property.type === "rollup" && property.rollup) {
      const relationIds = Array.isArray(result[property.rollup.relationPropertyId]) ? result[property.rollup.relationPropertyId] as unknown[] : [];
      const values = relationIds.map(String).map((id) => input.recordsById?.get(id)).filter(Boolean).map((record) => property.rollup?.targetPropertyId === "title" ? record?.title : record?.properties[property.rollup!.targetPropertyId]);
      result[property.id] = rollupValue(values, property.rollup.aggregation);
    }
  }
  for (const property of input.schema.properties.filter((item) => item.type === "formula" && item.formula)) {
    try { result[property.id] = evaluateDatabaseFormula(property.formula!, result); }
    catch { result[property.id] = null; }
  }
  return result;
}

export function normalizeDatabasePropertyValues(schema: DatabasePropertySchema, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("记录属性必须是对象");
  const raw = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const property of schema.properties) {
    if (["title", "created-time", "created-by", "last-edited-time", "last-edited-by", "formula", "rollup", "button", "id"].includes(property.type)) continue;
    const value = raw[property.id];
    if (value === undefined) continue;
    if (property.type === "number") result[property.id] = Number.isFinite(Number(value)) ? Number(value) : 0;
    else if (property.type === "checkbox") result[property.id] = Boolean(value);
    else if (["multi-select", "files", "relation"].includes(property.type)) result[property.id] = stringList(value, 100) ?? [];
    else if (value === null) result[property.id] = null;
    else result[property.id] = String(value).slice(0, 10_000);
  }
  return result;
}

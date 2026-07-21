export type DatabaseValue = string | number | boolean | string[] | null | undefined;

export type DatabaseRecordLike = {
  id: string;
  title: string;
  properties: Record<string, DatabaseValue>;
};

export type FilterCondition = {
  type: "condition";
  property: string;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "on_or_after" | "on_or_before" | "is_empty" | "is_not_empty";
  value?: DatabaseValue;
};

export type FilterGroup = {
  type: "group";
  operator: "and" | "or";
  filters: Array<FilterCondition | FilterGroup>;
};

export type ViewSort = { property: string; direction: "ascending" | "descending" };
export const DATABASE_CONDITIONAL_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type DatabaseConditionalColor = typeof DATABASE_CONDITIONAL_COLORS[number];
export type ConditionalColorRule = Omit<FilterCondition, "type"> & { color: DatabaseConditionalColor };

function recordValue(record: DatabaseRecordLike, property: string) {
  return property === "title" ? record.title : record.properties[property];
}

function isEmpty(value: DatabaseValue) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function comparable(value: DatabaseValue) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) return value.join("\u0000").toLocaleLowerCase();
  const text = String(value ?? "");
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? text.toLocaleLowerCase() : timestamp;
}

function includesValue(actual: DatabaseValue, expected: DatabaseValue) {
  if (Array.isArray(actual)) return actual.some((item) => item.toLocaleLowerCase().includes(String(expected ?? "").toLocaleLowerCase()));
  return String(actual ?? "").toLocaleLowerCase().includes(String(expected ?? "").toLocaleLowerCase());
}

export function conditionMatches(record: DatabaseRecordLike, filter: FilterCondition) {
  const actual = recordValue(record, filter.property);
  const expected = filter.value;
  if (filter.operator === "is_empty") return isEmpty(actual);
  if (filter.operator === "is_not_empty") return !isEmpty(actual);
  if (filter.operator === "contains") return includesValue(actual, expected);
  if (filter.operator === "not_contains") return !includesValue(actual, expected);
  if (filter.operator === "starts_with") return String(actual ?? "").toLocaleLowerCase().startsWith(String(expected ?? "").toLocaleLowerCase());
  if (filter.operator === "ends_with") return String(actual ?? "").toLocaleLowerCase().endsWith(String(expected ?? "").toLocaleLowerCase());
  const left = comparable(actual);
  const right = comparable(expected);
  if (filter.operator === "equals") return left === right;
  if (filter.operator === "not_equals") return left !== right;
  if (filter.operator === "greater_than" || filter.operator === "on_or_after") return left >= right;
  if (filter.operator === "less_than" || filter.operator === "on_or_before") return left <= right;
  return true;
}

export function matchingConditionalColor(record: DatabaseRecordLike, rules: ConditionalColorRule[]) {
  return rules.find((rule) => conditionMatches(record, { type: "condition", property: rule.property, operator: rule.operator, value: rule.value }))?.color;
}

export function evaluateFilter(record: DatabaseRecordLike, filter: FilterCondition | FilterGroup, depth = 1): boolean {
  if (filter.type === "condition") return conditionMatches(record, filter);
  if (depth > 3) return false;
  const values = filter.filters.map((child) => evaluateFilter(record, child, depth + 1));
  return filter.operator === "and" ? values.every(Boolean) : values.some(Boolean);
}

export function applyViewQuery<T extends DatabaseRecordLike>(records: T[], input: {
  search?: string;
  filter?: FilterCondition | FilterGroup;
  sorts?: ViewSort[];
}) {
  const search = input.search?.trim().toLocaleLowerCase();
  const filtered = records.filter((record) => {
    if (search) {
      const haystack = [record.title, ...Object.values(record.properties).flatMap((value) => Array.isArray(value) ? value : [String(value ?? "")])].join(" ").toLocaleLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return input.filter ? evaluateFilter(record, input.filter) : true;
  });
  const sorts = input.sorts ?? [];
  return [...filtered].sort((left, right) => {
    for (const sort of sorts) {
      const leftValue = comparable(recordValue(left, sort.property));
      const rightValue = comparable(recordValue(right, sort.property));
      const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      if (comparison) return sort.direction === "ascending" ? comparison : -comparison;
    }
    return 0;
  });
}

export function groupRecords<T extends DatabaseRecordLike>(records: T[], property?: string) {
  if (!property) return new Map([["全部", records]]);
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const value = recordValue(record, property);
    const keys = Array.isArray(value) ? (value.length ? value : ["未填写"]) : [String(value ?? "未填写")];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return groups;
}

import type { SophieBlock } from "./sophie-package";

const nonTextBlockTypes = new Set<SophieBlock["type"]>(["image", "file", "page-reference", "divider", "database"]);

export function splitBlockContent(content: string, selectionStart: number, selectionEnd = selectionStart) {
  const start = Math.max(0, Math.min(content.length, selectionStart));
  const end = Math.max(start, Math.min(content.length, selectionEnd));
  return { before: content.slice(0, start), after: content.slice(end) };
}

export function continuationBlockType(type: SophieBlock["type"]): SophieBlock["type"] {
  return type === "bulleted-list" || type === "numbered-list" || type === "todo" ? type : "text";
}

export function isTextEditableBlock(type: SophieBlock["type"]) {
  return !nonTextBlockTypes.has(type);
}

export function nearestEditableBlockId(blocks: SophieBlock[], removedBlockId: string) {
  const index = blocks.findIndex((block) => block.id === removedBlockId);
  if (index < 0) return undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (isTextEditableBlock(blocks[cursor].type)) return blocks[cursor].id;
  }
  for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
    if (isTextEditableBlock(blocks[cursor].type)) return blocks[cursor].id;
  }
  return undefined;
}

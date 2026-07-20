export function scopedResourceId(workspaceId: string, resourceId: string) {
  if (workspaceId === "default") return resourceId;
  const prefix = `${workspaceId}:`;
  return resourceId.startsWith(prefix) ? resourceId : `${prefix}${resourceId}`;
}

export function publicResourceId(workspaceId: string, storedId: string) {
  if (workspaceId === "default") return storedId;
  const prefix = `${workspaceId}:`;
  return storedId.startsWith(prefix) ? storedId.slice(prefix.length) : storedId;
}

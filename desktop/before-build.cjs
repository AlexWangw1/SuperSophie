/**
 * The Electron shell only uses built-in Electron/Node APIs and loads the
 * SuperSophie web workspace from its configured URL. Its app archive therefore
 * has no production npm dependencies to rebuild or collect.
 *
 * Returning false tells electron-builder that dependency handling is external,
 * preventing it from traversing the web application's pnpm dependency graph.
 */
exports.default = async function skipDesktopDependencyCollection() {
  return false;
};

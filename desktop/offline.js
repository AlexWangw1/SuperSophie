const picker = document.getElementById("package-picker");
const extraPicker = document.querySelector("[data-package-picker]");
const retryButton = document.getElementById("retry-online");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const pageView = document.getElementById("page-view");
const pageIcon = document.getElementById("page-icon");
const pageTitle = document.getElementById("page-title");
const pageMeta = document.getElementById("page-meta");
const pageProperties = document.getElementById("page-properties");
const pageBlocks = document.getElementById("page-blocks");
const assetUrls = [];

function clearAssetUrls() {
  while (assetUrls.length) URL.revokeObjectURL(assetUrls.pop());
}

function assetUrl(asset) {
  const bytes = window.SophieOfflinePackage.base64ToBytes(asset.data);
  const url = URL.createObjectURL(new Blob([bytes], { type: asset.mime }));
  assetUrls.push(url);
  return url;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderBlock(block, assets) {
  const className = `page-block ${block.type}`;
  if (block.type === "heading") return element("h2", className, block.content);
  if (block.type === "todo") {
    const label = element("label", `${className} todo`);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(block.checked);
    checkbox.disabled = true;
    label.append(checkbox, document.createTextNode(block.content));
    return label;
  }
  if (block.type === "quote") return element("blockquote", `${className} quote`, block.content);
  if (block.type === "callout") return element("aside", `${className} callout`, block.content);
  if (block.type === "code") {
    const pre = element("pre", `${className} code`);
    const code = element("code", "", block.content);
    code.dataset.language = block.language || "text";
    pre.append(code);
    return pre;
  }
  if (block.type === "bulleted-list" || block.type === "numbered-list") {
    const list = element(block.type === "bulleted-list" ? "ul" : "ol", className);
    list.append(element("li", "", block.content));
    return list;
  }
  if (block.type === "toggle") {
    const details = element("details", className);
    details.append(element("summary", "", block.content));
    return details;
  }
  if (block.type === "divider") return element("hr", `${className} divider`);
  if (block.type === "image") {
    const asset = assets.find((item) => item.id === block.assetId);
    const image = element("img", `${className} image`);
    image.alt = block.content || asset.name;
    image.src = assetUrl(asset);
    return image;
  }
  if (block.type === "file") {
    const asset = assets.find((item) => item.id === block.assetId);
    const anchor = element("a", `${className} file`, `↓ ${block.content || asset.name}`);
    anchor.href = assetUrl(asset);
    anchor.download = asset.name;
    return anchor;
  }
  if (block.type === "page-reference") return element("div", `${className} reference`, `↗ ${block.content}`);
  if (block.type === "database") return element("div", `${className} database`, `▦ 数据库视图：${block.content}`);
  return element("p", className, block.content);
}

function renderPackage(result, fileName) {
  clearAssetUrls();
  const { page, assets, manifest } = result;
  pageIcon.textContent = page.icon || "";
  pageTitle.textContent = page.title;
  pageMeta.textContent = `${fileName || "离线页面"} · 修订 ${page.revision} · ${new Date(page.updatedAt).toLocaleString("zh-CN")} · ${assets.length} 个附件 · 校验通过`;
  pageProperties.replaceChildren();
  for (const [key, value] of Object.entries(page.properties)) {
    pageProperties.append(element("dt", "", key), element("dd", "", Array.isArray(value) ? value.join("、") : String(value)));
  }
  pageProperties.hidden = Object.keys(page.properties).length === 0;
  pageBlocks.replaceChildren(...page.blocks.map((block) => renderBlock(block, assets)));
  document.title = `${page.title} · SuperSophie 离线阅读`;
  emptyState.hidden = true;
  errorState.hidden = true;
  pageView.hidden = false;
  pageMeta.dataset.packageId = manifest.packageId || "";
}

async function openSource(source, name) {
  try {
    renderPackage(await window.SophieOfflinePackage.read(source), name);
  } catch (error) {
    pageView.hidden = true;
    emptyState.hidden = false;
    errorState.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : "文件无法解析";
  }
}

async function openFile(file) {
  if (!file) return;
  await openSource(await file.text(), file.name);
}

async function consumePendingPackage() {
  const opened = await window.sophieDesktop?.consumeOpenedPackage();
  if (opened) await openSource(opened.content, opened.name);
}

picker.addEventListener("change", () => openFile(picker.files?.[0]));
extraPicker.addEventListener("change", () => openFile(extraPicker.files?.[0]));
retryButton.addEventListener("click", () => window.sophieDesktop?.retryOnline());
window.addEventListener("beforeunload", clearAssetUrls);

window.sophieDesktop?.onPackageAvailable(() => { void consumePendingPackage(); });
void consumePendingPackage();

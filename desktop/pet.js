const character = document.getElementById("pet-character");
const bubble = document.getElementById("pet-bubble");
const openButton = document.getElementById("open-app");
const quitButton = document.getElementById("quit-app");

const messages = [
  "我会留在这里，需要我时双击一下。",
  "今天也辛苦了，要不要把想法先交给我？",
  "你的笔记和任务都还在，随时可以继续。",
];

character.addEventListener("dblclick", () => window.sophieDesktop.showMain());
character.addEventListener("click", () => {
  const current = messages.indexOf(bubble.textContent);
  bubble.textContent = messages[(current + 1) % messages.length];
});
openButton.addEventListener("click", () => window.sophieDesktop.showMain());
quitButton.addEventListener("click", () => window.sophieDesktop.quit());

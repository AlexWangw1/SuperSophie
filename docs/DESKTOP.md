# Windows 桌面端

SuperSophie 桌面端是云端工作区的安全 Electron 外壳，并提供本地代码项目桥接、托盘、桌面宠物和不依赖网络的 `.sophie` 阅读器。

## 构建

```powershell
pnpm desktop:pack
```

安装器输出到 `dist/SuperSophie Setup <version>.exe`。安装后 Windows 会把 `.sophie` 注册为 “SuperSophie Page”，双击文件会交给正在运行的单实例应用；若应用未运行，则先启动再打开文件。

## 离线阅读

- 云端加载失败时自动进入本地离线阅读器。
- 使用 `SuperSophie.exe --offline <page.sophie>` 可主动进入离线模式。
- 也可设置 `SUPERSOPHIE_OFFLINE=1` 后启动应用。
- “重新连接云端”会退出强制离线状态并重新加载正式工作区。

读取器会校验 `SOPHIE/1` 魔数、容器版本、Markdown 真相源、页面 SHA-256、附件清单和每个附件摘要。包内文本只通过 DOM `textContent` 渲染，不执行包内 HTML 或脚本。

## 桌面宠物

首页开关会同步到桌面设置并跨重启保存。启用时关闭主窗口不会退出进程，而是显示桌面宠物；可双击角色或点“打开”恢复主窗口，通过“退出”或托盘菜单完全退出。

## 安全边界

- 渲染进程启用 `contextIsolation` 与沙箱，并关闭 Node.js 集成。
- 本地页面只信任打包内的 `pet.html` 与 `offline.html`。
- 代码文件桥接只接受正式产品源或本地开发源，不向离线/宠物页面开放。
- `.sophie` 文件路径不会暴露给远程页面，只传递经过大小限制的文件名与内容。

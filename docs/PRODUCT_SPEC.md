# SuperSophie 产品基线

SuperSophie 是一个 Markdown-first、离线优先、可同步的个人智能工作空间。笔记、数据库条目、Agent 计划、执行记录和消息草稿都以 Markdown 文档为内容真源；结构化数据库只承担索引、查询、同步版本和文件元数据。

## 首期产品面

1. **块编辑与知识库**：段落、标题、待办、列表、引用、提示、代码、图片、文件、数据库、页面引用；支持 `/` 命令、拖拽排序、块转换和键盘操作。
2. **数据库**：每条记录也是可编辑页面；同一数据源可建立多个互不干扰的视图。
3. **Agent Work**：主 Agent 分解目标、创建子 Agent、分配模型、展示依赖、执行日志、产物与人工审批点。
4. **代码工作台**：文件树、多标签编辑、差异审阅、终端输出和 Agent 任务上下文。
5. **模型配置**：支持 OpenAI、Anthropic、Google、OpenRouter、Ollama 与 OpenAI-compatible endpoint；密钥不写入 Markdown。
6. **连接器**：微信、QQ、Telegram、OneDrive 与 App Cloud；消息先进入可审阅的 Markdown outbox，再由连接器发送。
7. **离线包**：`.sophie` 文件使用 `SOPHIE/1` 魔数，包含 manifest、页面 Markdown、块索引、属性、附件与校验和。最新版客户端可直接打开，不依赖网络。
8. **同步**：设备本地保留离线副本；在线时通过 revision、内容哈希和变更日志与 D1/R2、OneDrive 或自托管存储同步。

## Notion 数据库兼容目标

依据 Notion 官方帮助中心当前功能，SuperSophie 的数据库层覆盖：

- 视图：Table、Board、Timeline、Calendar、List、Gallery、Chart、Form、Map、Feed、Dashboard。
- 视图级设置：属性显隐、筛选、排序、分组、子分组、条件色、卡片预览、打开方式。
- 筛选：简单筛选，以及最多三层嵌套的 `AND`/`OR` 高级筛选。
- 属性：标题、文本、数字、选择、多选、状态、日期、人员、文件、复选框、URL、邮箱、电话、创建/编辑时间与人员、公式、关联、汇总、按钮、唯一 ID。
- 数据组织：内联/全页数据库、链接数据源、多数据源、模板、子项目、锁定视图、批量编辑。

官方基线：

- https://www.notion.com/help/views-filters-and-sorts
- https://www.notion.com/help/database-properties
- https://www.notion.com/help/data-sources-and-linked-databases
- https://www.notion.com/help/what-is-a-block

## Markdown 约定

```md
---
sophie: 1
id: page_launch
title: Launch SuperSophie
kind: database-item
revision: 12
properties:
  status: In progress
  priority: High
---

<!-- sophie:block=block_1 type=heading -->
# Launch SuperSophie

<!-- sophie:block=block_2 type=todo checked=false -->
- [ ] Finish offline package import
```

YAML frontmatter 保存页面级属性；正文是可移植 Markdown；HTML 注释保存稳定块 ID，不影响普通 Markdown 阅读器。

## 数据安全边界

- API Key、OAuth refresh token 等秘密进入系统密钥库或托管环境变量，不进入 Markdown、同步日志或 `.sophie` 包。
- 所有社交消息默认先预览再发送；Agent 不能绕过审批策略。
- 云端 D1 保存可查询索引和 Markdown，R2 保存附件与离线包；设备数据库是离线副本，不是在线模式下的唯一真源。


# Database Engine

SuperSophie 把数据库拆成三个层次：

1. `data_sources` 保存数据源名称和属性 schema Markdown。
2. `database_records` 中每条记录都是独立 Markdown 页面；`properties_json` 只是查询索引。
3. `database_views` 保存同一数据源的视图设置，包含可见属性、筛选树、排序、分组/子分组和页面打开方式。

## 已实现

- Table、Board、Timeline、Calendar、List、Gallery、Chart、Form、Map、Feed、Dashboard 共 11 种布局。
- 同一数据源在各视图间共享记录，但每个视图独立保存配置。
- 搜索、属性显隐、多个排序定义、分组和子分组。
- `AND` / `OR` 筛选树，求值器限制为最多三层嵌套。
- 每条记录可在 side peek 中编辑属性和 Markdown 正文。
- Board 拖拽更改状态；Form 创建记录。
- D1 乐观并发 revision；API 对冲突返回 `409 revision_conflict`。
- 删除记录不会触发演示数据重新生成；初始记录只在首次创建默认数据源时写入。

## 官方功能基线

2026-07-18 依据 Notion 官方帮助中心核对：

- [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)
- [Database properties](https://www.notion.com/help/database-properties)
- [Data sources](https://www.notion.com/help/data-sources-and-linked-databases)
- [Database views](https://www.notion.com/help/category/database-views/all)
- [Dashboards view](https://www.notion.com/help/dashboards)

## 仍需扩展

公式语言、跨数据源 Relation/Rollup、按钮自动化、权限共享、模板、条件色编辑器和真实地理编码尚未达到 Notion 的完整深度。产品界面不应把这些未连通能力显示为已完成。

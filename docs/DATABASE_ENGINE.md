# Database Engine

SuperSophie 把数据库拆成四个层次：

1. `data_sources` 保存数据源名称和面向人的 schema Markdown。
2. `database_property_schemas` 保存可版本化的动态属性定义；JSON 用于运行时，Markdown 用于同步、审计与人工阅读。
3. `database_records` 中每条记录都是独立 Markdown 页面；`properties_json` 只是查询索引。
4. `database_views` 保存同一数据源的视图设置，包含可见属性、筛选树、排序、分组/子分组、条件色和页面打开方式。
5. `database_templates` 保存可版本化的标题、属性预设与 Markdown 正文模板，并随工作区快照同步。

## 已实现

- Table、Board、Timeline、Calendar、List、Gallery、Chart、Form、Map、Feed、Dashboard 共 11 种布局。
- 可新建和切换多个数据源；同一数据源在各视图间共享记录，但每个视图独立保存配置。
- 搜索、属性显隐、可调整优先级的多重排序，以及真实分组/子分组。
- 23 种动态属性：标题、文本、数字、选择、多选、状态、日期、人员、文件、复选框、URL、邮箱、电话、创建/编辑时间与人员、公式、关联、汇总、按钮、唯一 ID 和位置。
- 属性编辑器支持新增、删除、重排和类型专属配置；schema 使用 revision 乐观并发并进入 OneDrive 工作区快照。
- 公式使用无 `eval` 的受限解析器，提供算术、比较、布尔运算以及 `prop`、`if`、`empty`、`length`、`contains`、`lower`、`upper`、`round`、`min`、`max`。
- Relation 可用目标数据源的真实记录选择器连接任意工作区数据源；Rollup 按关系的目标 schema 计算 count、count-values、sum、average、min、max、percent-checked 和 show-unique。双方都配置双向 Relation 时，新增、移除和删除会同步反向关系。
- 数据库模板可预设标题、属性与 Markdown 正文；创建、编辑、删除和由模板生成记录都由 API 持久化，删除墓碑会同步到其他设备。
- 每个视图可保存最多 20 条条件色规则，按顺序对表格、看板卡片和列表记录应用首条匹配颜色。
- 按钮可安全设置属性或打开 HTTP(S) 链接。
- 可视化 `AND` / `OR` 筛选树支持所有动态属性，界面和服务端都限制为最多三层嵌套。
- 每条记录可在 side peek 中编辑属性和 Markdown 正文。
- Board 按所选动态属性分列并支持子分组与拖拽；Timeline/Calendar 读取日期属性，Map 读取位置坐标，Chart/Dashboard 读取分组与数字属性，Form 自动生成动态属性字段。
- D1 乐观并发 revision；API 对冲突返回 `409 revision_conflict`。
- 删除记录不会触发演示数据重新生成；初始记录只在首次创建默认数据源时写入。

## 官方功能基线

2026-07-21 依据 Notion 官方帮助中心核对：

- [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)
- [Database properties](https://www.notion.com/help/database-properties)
- [Data sources](https://www.notion.com/help/data-sources-and-linked-databases)
- [Database views](https://www.notion.com/help/category/database-views/all)
- [Dashboards view](https://www.notion.com/help/dashboards)

## 仍需扩展

复杂按钮工作流、数据库级权限共享、模板按钮/重复规则以及真实地址地理编码尚未达到 Notion 的完整深度。产品界面不应把这些未连通能力显示为已完成。

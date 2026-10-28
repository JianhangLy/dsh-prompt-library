# dsh-prompt-library

DSH Web GUI 的「提示词库」插件：把常用提示词 / 提示词模板存起来，在输入框旁点一下就能取用。

## 功能

- 输入框工具行一个 **▤** 按钮，或按 **Alt+P**，打开取用浮层；
- 浮层顶部是分类行：全部 / 未分组 / 各个分组（带条数），点一下只看那一类，可与搜索、置顶叠加；
- 搜索按空格分词、逐词 AND 匹配，范围是标题、正文、分组；
- 选中一条用它的正文**替换**当前草稿；**Shift+点击**改为追加到草稿末尾；↑↓ 选择、Enter 插入、Esc 关闭；
- 每条右侧有 ▸ 三角，展开看完整正文（限高 40vh，内部滚动），可同时展开多条；
- 正文里的 `{{变量}}` 在插入前弹小表单填值，`{{date}}`、`{{time}}` 自动补当天日期与时间，留空的变量保留原样；
- 点「存当前草稿」把草稿存成一条提示词，存之前可以先填标题与分组；
- 设置页支持增删改、改分组、★ 置顶、删除后 6 秒内撤销、整库导入（合并 / 替换）、导出，并显示数据文件与备份文件路径；
- 设置页的列表带搜索框与分类 chips，单条编辑在条目下方内联展开；
- 「分组管理」可以重命名分组（改成已有名字即合并）或解散分组（只清分组名，不删条目），两者都走同一个二次确认弹窗；
- 首次加载自动补上 13 套内置模板，删掉后可点「补齐内置模板」找回；
- 数据只存在本机一个 JSON 文件里，不联网、不上传。

## 内置模板

按使用场景分 6 组，正文里留了 `{{变量}}` 空位，取用时填：

| 分组 | 模板 |
| --- | --- |
| 内置 · 开工 | 开工对齐（先别动手）、需求澄清四问 |
| 内置 · 排错 | 最小改动修复、线上问题排查 |
| 内置 · 验收 | 严格验收、方案评审（只评审不改）、反假绿自查 |
| 内置 · 工程 | 代码审查、行为不变的重构、交接文档 |
| 内置 · 写作 | 中文技术文档润色、长文事实与数字校对 |
| 内置 · 学习 | 概念讲解 |

播种规则：只按 `id`（`builtin:*`）补缺失项，**不会覆盖**改过的正文；每个版本自动补一次（记在浏览器 localStorage 的 `dsh-prompt-library:builtin`）。内置模板和普通条目一样，可编辑、可改分组、可删除。

## 安装

从 GitHub 安装：

```bash
dsh plugin --profile desktop add github:JianhangLy/dsh-prompt-library
```

本地开发用 link，改完刷新页面即可，不用重装：

```bash
dsh plugin --profile desktop add link:<插件目录>
# 或
plugin_manager install_bundle target=link:<插件目录>
```

客户端改动刷新页面生效；宿主（`lib/index.js`）改动需要重启 DSH。卸载：

```bash
dsh plugin --profile desktop remove dsh-prompt-library
```

## 使用

1. 在输入框旁点 ▤（或 Alt+P）打开浮层；
2. 点分类 chip 缩小范围，或在搜索框里输入关键词；
3. 点某一条 → 正文替换当前草稿；要接着后面写就 Shift+点击（追加时用空行分隔）；
4. 正文有 `{{变量}}` 时，先填值再进入草稿；
5. 想改内容、分组、置顶，去「设置 → 提示词库」。

## 设置项

| 位置 | 作用 |
| --- | --- |
| 列表搜索框 | 按标题 / 正文 / 分组过滤，分词 AND |
| 分类 chips | 全部 / 未分组 / 各分组，带条数 |
| 条目的 ★ | 置顶，排序优先级最高 |
| 条目的「编辑」 | 在该条下方内联展开编辑框，同一时间只编辑一条 |
| 条目的「删除」 | 二次确认后删除，6 秒内可撤销 |
| 导入并合并 / 导入并替换 | 前者按 id 覆盖同名、保留其余；后者清空后写入，会再确认一次 |
| 导出 | 下载整库 JSON |
| 分组管理 | 每行显示条数与 ▸ 三角，可展开看组内条目；可重命名 / 解散 |
| 补齐内置模板 | 把缺失的内置模板按 id 补回，不动已有内容 |

## HTTP 接口

宿主只监听回环 Host，不做鉴权（同源页面）。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/prompt-library` | 读整库，附带 `path` / `backupPath` |
| PUT | `/prompt-library` | 整库覆盖保存，body 为 `{ version, rev, prompts }`；`rev` 与磁盘不符回 409 并带回最新整库 |
| POST | `/prompt-library/used` | `{ id }`，只更新该条的 `lastUsedAt`，返回新的 `rev` |

请求体上限 200 KB，单条正文上限 64 K 字符；不带 `rev` 的 PUT 跳过校验（方便 curl 手测或从备份强制覆盖）。

## 数据结构

数据文件按下列顺序取第一个可用目录，文件名固定 `prompt-library.json`：`DSH_PROFILE_DIR` → `DSH_HOME` → `~/.dsh` → 插件目录（兜底）。

```jsonc
{
  "version": 1,
  "rev": 7,                       // 单调递增；PUT 带上它做乐观锁
  "prompts": [
    {
      "id": "p_...",
      "title": "代码审查",
      "body": "请按以下维度审查……",
      "group": "日常",
      "pinned": false,
      "createdAt": 1730000000000,
      "updatedAt": 1730000000000,
      "lastUsedAt": 0
    }
  ]
}
```

`id` 只生成一次、导入导出都保留，重复导入同一份文件不会产生副本（同 id 覆盖）。排序：置顶 → 最近使用 → 最近修改。分类默认「全部」；浮层里选过的分类在本次页面会话内保持不变，刷新页面回到「全部」。

## 目录结构

```text
dsh-prompt-library/
├── client/client.js      # 浏览器半边：按钮、浮层、设置页，无构建、无 JSX
├── lib/index.js          # 宿主半边：三条回环路由 + 落盘与备份
├── locale/zh.json        # 插件在市场里的标题与描述
├── locale/en.json
├── cordis.patch.yml      # bundle 补丁：插入本插件
├── icon.svg
├── package.json
└── README.md
```

## 设计说明

- 客户端通过 slots 注册三处：`conversation.input.right`（order 50，▤ 按钮）、`conversation.input.overlay`（order 10，取用浮层）、`settings.section`（order 116，设置页）。
- 浮层渲染在 composer 卡片内部，主题皮肤常对卡片内所有 `button` 下重规则，因此本插件样式全部挂在 `#pl-pop` / `#pl-settings` 这两个 ID 作用域下，并把 `border` / `border-radius` / `background` / `background-image` / `box-shadow` / `text-shadow` 用 `!important` 写回。
- 回填草稿用插槽的 `inputActions.setDraft()`，读草稿用同组件的 `useInput()`，不直接操作 DOM。
- 宿主用 `webServer.register({ kind: 'prefix' })` 注册路由，只接受回环 Host；写盘先写 `.tmp` 再 `rename`，每次整库保存前把上一版复制成 `prompt-library.backup.json`（只记使用时间的写入不备份）。
- 整库保存带 `rev` 乐观锁：多窗口同时改，后到的请求拿到 409 与最新整库，前端据此刷新后重试，不会静默覆盖。

## 已知限制

- 选中即替换草稿，没有确认步骤；插错了重新写即可。
- 备份只有「上一版」一份，不是历史存档；要长期留底请用导出。
- 导出文件是纯 JSON，可手工编辑后用「导入并替换」灌回去。
- 浮层用 `position: fixed` 贴按钮定位；若某个主题下位置偏了，改 `client/client.js` 里 `LibraryPanel` 的 `style` 计算即可。
- 列表是全量渲染，条目量在百条以内无压力，上千条需要改为虚拟滚动。
- 只允许回环地址访问接口，没有鉴权；不要把这个端口暴露到公网。

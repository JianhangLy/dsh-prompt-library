// dsh-prompt-library — 浏览器半边（手写、无构建步骤）。
// 只 require('react')，不 import 任何 Harness Client 包。
//
// 注册点：
//   conversation.input.right     ▤ 提示词库按钮（order 50，排在 dsh-prompt-boost 的 ✦ order 55 左边）
//   conversation.input.overlay   取用浮层（搜索 / 分组筛选 / ↑↓ Enter 插入 / Shift+点击追加 / 模板变量填值）
//   settings.section            「提示词库」设置页（增删改、置顶、导入合并或替换、导出、数据文件路径）
//
// 按钮、浮层、设置页是三个不同插槽，通过模块级 store + 订阅保持同步。
// Alt+P 全局唤起浮层：挂在真实的 ▤ 按钮上，所以位置与聚焦会话都对得上。
'use strict'

window.__ModuleLoader__.load({
  id: 'dsh-prompt-library',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-prompt-library'
    const ENDPOINT = '/prompt-library'
    const ENDPOINT_USED = ENDPOINT + '/used'
    const BUTTON_ORDER = 50
    const OVERLAY_ORDER = 10
    const SETTINGS_SECTION_ID = 'prompt-library'
    const SETTINGS_SECTION_ORDER = 116

    // —— 内置模板 ——
    // 随插件发布，首次加载按 id 补进库里；之后用户可改可删，「补齐内置模板」只补缺失的 id，
    // 不会覆盖用户改过的正文。分类用分组名表达（「内置 · 验收」等），不额外加字段。
    const BUILTIN_VERSION = 1
    const BUILTIN_SEED_KEY = 'dsh-prompt-library:builtin'
    const BUILTINS = [
      {
        id: 'builtin:align',
        group: '内置 · 开工',
        title: '开工对齐（先别动手）',
        body: `# 任务
{{任务描述}}

## 背景
{{为什么做、现状如何}}

## 目标行为
1. {{目标一}}
2. {{目标二}}

## 约束
- 只改动与目标直接相关的文件，不顺手改相邻代码。
- 不新增依赖、不新增数据字段，除非先说明理由与迁移方式。
- 列出需要保持不变的行为，改完逐条确认。

## 现在先别写代码
1. 用一句话复述你要交付的结果。
2. 列「做什么 / 不做什么」。
3. 指出歧义、风险、需要我拍板的点。
等我确认后再动手。
`,
      },
      {
        id: 'builtin:clarify',
        group: '内置 · 开工',
        title: '需求澄清四问',
        body: `动手前先回答，不要写代码：
1. 这个需求用一句话说是什么？边界（做什么 / 不做什么）在哪？
2. 现有代码里相关的入口、数据结构、调用链在哪？给 文件:行号。
3. 有几种合理解读？各自的代价与影响范围。
4. 你缺哪些信息？一次问完，不要边做边猜。

若代码现状和我的描述不符，以代码为准，直接说明，不要按我的假设改。
`,
      },
      {
        id: 'builtin:fix',
        group: '内置 · 排错',
        title: '最小改动修复',
        body: `任务：修复 {{现象}}

- 复现步骤：{{步骤}}
- 期望行为：{{正确行为}}
- 实际行为：{{报错原文}}

要求：
1. 定位第一次出错的位置，给 文件:行号 与完整调用链。
2. 分清三层：表面现象 / 直接原因 / 根本原因。
3. 给 2~3 套修法，每套写明副作用与影响范围，先不要改代码。
4. 我选定后再动手，只改必要行。

不要为了变绿而绕过错误、吞掉异常或放宽校验。
`,
      },
      {
        id: 'builtin:incident',
        group: '内置 · 排错',
        title: '线上问题排查',
        body: `线上问题：{{现象}}
影响：{{谁受影响、从何时开始}}

先给判断，不要先改代码：
1. 影响面：范围、开始时间、是否还在扩大。
2. 时间线：相关变更、告警、日志关键行（贴原文）。
3. 候选原因 3 个，按可能性排序，每个写清「如何快速证伪」。
4. 最小止损动作（可回滚）与执行顺序。
5. 修完后补一条能提前发现同类问题的监控或校验。
`,
      },
      {
        id: 'builtin:review',
        group: '内置 · 验收',
        title: '严格验收',
        body: `对这次改动做验收，按下面结构输出：
1. 结论先行：通过 / 有条件通过 / 不通过。
2. 通过的部分：逐条给证据（文件:行号 或 命令输出）。
3. 必改项：按严重度排序，每条写 现象 → 原因 → 最小修法。
4. 建议项：不阻断，单独列。
5. 回归风险：哪些既有行为可能受影响，怎么验证。

证据规则：
- 只接受实际运行过的输出；没跑过就写「未验证」，不要写「应该没问题」。
- 拒绝假绿：校验能通过但实际没生效（空循环、正则匹配 0 条、跳过分支），要单独指出。
`,
      },
      {
        id: 'builtin:audit',
        group: '内置 · 验收',
        title: '方案评审（只评审不改）',
        body: `评审 {{对象}}，不要改任何文件。

1. 结论：能用 / 需改 / 重做。
2. 必改（会直接导致返工）：每条标「必改 n」，写 问题 → 证据 → 后果 → 建议。
3. 建议（不阻断）：一句话一条，注明收益。
4. 一致性：与已冻结的契约、文档、命名冲突在哪，给 文件:行号。
5. 可选：建议一道能防住上面多数问题的门禁。
`,
      },
      {
        id: 'builtin:honesty',
        group: '内置 · 验收',
        title: '反假绿自查',
        body: `在说「完成」之前，自查四项并贴证据：
1. 正向：目标行为真的跑通了吗？哪条命令或哪个界面证明。
2. 反向：故意破坏关键输入（改名、删字段、改类型），校验会不会变红？不变红说明校验是假的。
3. 覆盖：断言或校验实际执行了几次？0 次视为未验证。
4. 边界：空输入、超长、特殊字符、重复执行各试一次。

任意一条没做，写「未验证」，不要用「预期」「应该」代替。
`,
      },
      {
        id: 'builtin:code-review',
        group: '内置 · 工程',
        title: '代码审查',
        body: `审查 {{文件或改动范围}}，只报真实问题，按严重度排序。
每条格式：文件:行号 — 问题 — 触发条件 — 后果 — 建议改法。
只接受能复现或能推出完整路径的问题；风格偏好单独一节，标注「非阻断」。
重点检查：空值与边界、异常被吞、并发与重入、资源释放、与文档或契约不一致。
不要重写代码，不要顺手重构。
`,
      },
      {
        id: 'builtin:refactor',
        group: '内置 · 工程',
        title: '行为不变的重构',
        body: `重构 {{模块}}，前提是行为完全不变。
1. 先补特征测试（记录当前输入→输出），跑通再改。
2. 拆成 3 步以内的小步，每步可独立回滚。
3. 每步结束跑一次测试并贴输出。
4. 不改公共接口签名；必须改时先列全部调用点（文件:行号）。
5. 结束时给：改了什么、没改什么、测试证据、回滚方法。
`,
      },
      {
        id: 'builtin:handoff',
        group: '内置 · 工程',
        title: '交接文档',
        body: `把当前进度写成一份可交接的文档：
1. 目标与现状，各一句。
2. 已完成：逐条 + 证据位置。
3. 未完成：每条给 文件:函数:行号 与下一步动作。
4. 关键决策与理由（含被否掉的方案）。
5. 已知风险与未验证项（明确写「未验证」）。
6. 接续提示词：一段可直接粘贴到新会话的启动语，含工作目录、约束、下一步。
`,
      },
      {
        id: 'builtin:polish',
        group: '内置 · 写作',
        title: '中文技术文档润色',
        body: `润色下面这段中文技术文档：
1. 结论先行：每节第一句说结论，再给依据。
2. 去 AI 味：删「总的来说 / 值得注意的是 / 在当今」，删排比与空泛形容。
3. 术语统一：同一概念只用一个词，首次出现给英文原词。
4. 数字与单位保持原样并核对量纲；上下标用 <sup>，不用 Unicode 上标字母。
5. 输出：改后全文 + 「改了哪里、为什么」清单（不超过 10 条）。

原文：
{{原文}}
`,
      },
      {
        id: 'builtin:proofread',
        group: '内置 · 写作',
        title: '长文事实与数字校对',
        body: `校对这篇文档，只找错，不改文风：
1. 数字：逐个重算示例与合计，列出算错的（位置 → 原文 → 正确值）。
2. 单位与量纲：检查混用（A/mA、s/ms、字节/字符）。
3. 引用：章节号、图表号、文件名是否指向存在的内容。
4. 矛盾：同一事实在两处说法不一致的地方。
5. 结论：可用 / 需修 n 处，每处给最小改法。
`,
      },
      {
        id: 'builtin:explain',
        group: '内置 · 学习',
        title: '概念讲解',
        body: `讲解 {{概念}}，按顺序不要跳：
1. 一句话直觉：它解决什么问题。
2. 形式定义：关键术语与符号，配一个最小例子。
3. 反例：两个常见误解，说明为什么错。
4. 最小可运行示例 + 预期输出。
5. 自检题 3 道（答案放最后）。

控制在一屏半内，避免百科式罗列。
`,
      },
    ]

    const zh = {
      buttonTitle: '提示词库（Alt+P）',
      panelTitle: '提示词库',
      search: '搜索提示词…',
      allGroups: '全部分组',
      allPrompts: '全部',
      ungrouped: '未分组',
      groupManage: '分组管理',
      groupManageHint: '重命名会改掉该分组下所有条目；改成已有名字即为合并；解散只清分组，不删条目。',
      groupsEmpty: '还没有分组',
      rename: '重命名',
      dissolve: '解散',
      confirmDissolveTitle: '解散分组',
      confirmDissolve: '解散「{name}」后，组内 {n} 条提示词会变成未分组，提示词本身不会被删除。',
      confirmDeleteTitle: '删除提示词',
      confirmDeleteBody: '确定删除「{title}」？删除后可以在 6 秒内撤销。',
      dissolved: '已解散「{name}」',
      renamed: '已改名为「{name}」',
      ok: '确定',
      itemsSuffix: '条',
      seedBuiltin: '补齐内置模板',
      seeded: '补齐了 {n} 条内置模板',
      seedNone: '内置模板都在，无需补齐',
      loading: '正在读取…',
      empty: '还没有保存的提示词。到「设置 → 提示词库」里新建一条。',
      noMatch: '没有匹配的提示词',
      shownHint: '显示 {n} / 共 {m} 条',
      appendHint: 'Shift+点击追加到末尾',
      expand: '展开全文',
      collapse: '收起',
      saveDraft: '存当前草稿',
      draftSaveTitle: '存为提示词',
      draftEmpty: '草稿是空的',
      draftSaved: '已存为提示词',
      fillTitle: '填写模板变量',
      fillHint: '留空的变量会保留 {{名称}} 原样',
      insert: '插入',
      back: '返回',
      settingsNav: '提示词库',
      settingsTitle: '提示词库',
      settingsIntro: '保存常用提示词与模板；点输入框旁的 ▤ 或按 Alt+P 取用，选中替换草稿，Shift+点击追加。数据存在本机，可整库导出备份。',
      create: '新建',
      exportLabel: '导出',
      importMerge: '导入并合并',
      importReplace: '导入并替换',
      confirmReplace: '用文件里的 {n} 条替换现有全部提示词？此操作不可撤销。',
      imported: '导入完成，新增 {n} 条',
      importedReplace: '已替换为 {n} 条',
      saved: '已保存',
      failed: '操作失败',
      needBody: '正文不能为空',
      importInvalid: '这个文件不是提示词库的导出格式',
      conflict: '提示词库已在别处被修改，已刷新为最新内容，请重试',
      editorNew: '新建提示词',
      editorEdit: '编辑提示词',
      fieldTitle: '标题',
      fieldTitleHint: '留空则取正文第一行',
      fieldGroup: '分组',
      fieldGroupHint: '留空表示不分组',
      fieldBody: '正文',
      fieldBodyHint: '想留空位填？写 {{变量名}}，插入时会让你填值；{{date}}、{{time}} 自动补当天日期时间。',
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      remove: '删除',
      pin: '置顶',
      unpin: '取消置顶',
      deleteUndo: '已删除「{title}」',
      undo: '撤销',
      undone: '已恢复「{title}」',
      pathLabel: '数据文件',
      backupLabel: '备份',
      listTitle: '全部提示词',
      listEmpty: '还没有提示词',
    }

    const en = {
      buttonTitle: 'Prompt library (Alt+P)',
      panelTitle: 'Prompt library',
      search: 'Search prompts…',
      allGroups: 'All groups',
      allPrompts: 'All',
      ungrouped: 'Ungrouped',
      groupManage: 'Groups',
      groupManageHint: 'Renaming updates every prompt in the group; renaming to an existing name merges them; dissolve clears the group name but keeps the prompts.',
      groupsEmpty: 'No groups yet',
      rename: 'Rename',
      dissolve: 'Dissolve',
      confirmDissolveTitle: 'Dissolve group',
      confirmDissolve: 'After dissolving "{name}", its {n} prompt(s) become ungrouped; the prompts themselves are kept.',
      confirmDeleteTitle: 'Delete prompt',
      confirmDeleteBody: 'Delete "{title}"? You can undo within 6 seconds.',
      dissolved: 'Dissolved "{name}"',
      renamed: 'Renamed to "{name}"',
      ok: 'OK',
      itemsSuffix: 'item(s)',
      seedBuiltin: 'Restore built-in templates',
      seeded: 'Restored {n} built-in template(s)',
      seedNone: 'All built-in templates are present',
      loading: 'Loading…',
      empty: 'No saved prompts yet. Create one in Settings → Prompt library.',
      noMatch: 'No matching prompts',
      shownHint: 'Showing {n} of {m}',
      appendHint: 'Shift+click appends',
      expand: 'Show full text',
      collapse: 'Collapse',
      saveDraft: 'Save current draft',
      draftSaveTitle: 'Save as prompt',
      draftEmpty: 'Draft is empty',
      draftSaved: 'Saved as a prompt',
      fillTitle: 'Fill template variables',
      fillHint: 'Blank variables keep the {{name}} placeholder',
      insert: 'Insert',
      back: 'Back',
      settingsNav: 'Prompt library',
      settingsTitle: 'Prompt library',
      settingsIntro: 'Save reusable prompts and templates; click ▤ beside the composer or press Alt+P. Selection replaces the draft, Shift+click appends. Stored on this machine and exportable.',
      create: 'New',
      exportLabel: 'Export',
      importMerge: 'Import & merge',
      importReplace: 'Import & replace',
      confirmReplace: 'Replace all current prompts with the {n} in this file? This cannot be undone.',
      imported: 'Imported, {n} new',
      importedReplace: 'Replaced with {n} prompts',
      saved: 'Saved',
      failed: 'Failed',
      needBody: 'Body cannot be empty',
      importInvalid: 'This file is not a prompt library export',
      conflict: 'The library was changed elsewhere; refreshed with the latest content, please retry',
      editorNew: 'New prompt',
      editorEdit: 'Edit prompt',
      fieldTitle: 'Title',
      fieldTitleHint: 'Empty uses the first line of the body',
      fieldGroup: 'Group',
      fieldGroupHint: 'Empty means no group',
      fieldBody: 'Body',
      fieldBodyHint: 'Leave blanks with {{name}}; you will be asked to fill them on insert. {{date}} and {{time}} auto-fill.',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      remove: 'Delete',
      pin: 'Pin',
      unpin: 'Unpin',
      deleteUndo: 'Deleted "{title}"',
      undo: 'Undo',
      undone: 'Restored "{title}"',
      pathLabel: 'Data file',
      backupLabel: 'Backup',
      listTitle: 'All prompts',
      listEmpty: 'No prompts yet',
    }

    const CSS = [
      '.pl-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:1}',
      '.pl-button:hover{background:rgba(127,127,127,.16);color:var(--dsw-alias-label-primary)}',
      '.pl-button-active{background:rgba(127,127,127,.18);color:var(--dsw-alias-label-primary)}',
      '.pl-glyph{font-size:13px;line-height:1}',
      '.pl-pop{position:fixed;z-index:60;display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}',
      '.pl-pop-head{display:flex;flex-direction:column;gap:8px;padding:10px 10px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pl-pop-title{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pl-pop-tools{display:flex;gap:8px}',
      '.pl-search{flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;border:1px solid rgba(127,127,127,.30) !important;border-radius:8px;background:transparent !important;background-image:none !important;box-shadow:none !important;color:inherit;font:inherit;outline:none}',
      // 危险操作的确认弹窗：样式沿用浮层（同一套 token 与阴影），只多一层遮罩。
      '#pl-dialog-mask{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.32)}',
      '#pl-dialog{display:flex;flex-direction:column;gap:10px;box-sizing:border-box;width:min(92vw,380px);padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary)}',
      '#pl-dialog-title{margin:0;font-size:14px;font-weight:600}',
      '#pl-dialog-body{margin:0;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary)}',
      '#pl-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}',
      '#pl-dialog .pl-danger{color:var(--dsw-alias-state-error-primary)}',
      '.pl-search:focus{border-color:rgba(127,127,127,.55) !important}',
      '.pl-chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 3px}',
      // 浮层渲染在 [data-composer-card] 内，皮肤 patches 会强刷卡内所有 button
      // （蓝紫渐变底 + 亮边 + 光晕，全部 !important）。因此这里用 #pl-pop 提权到 ID 级，
      // 逐项把填充压回透明；色值仍是上一轮那套中性灰，不另起一套。
      '#pl-pop .pl-chip,#pl-settings .pl-chip{flex:none;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 10px;border:1px solid rgba(127,127,127,.32) !important;border-radius:999px !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-secondary) !important;font:inherit;font-size:11px;line-height:16px;cursor:pointer;appearance:none}',
      '#pl-pop .pl-chip:hover,#pl-settings .pl-chip:hover{border-color:rgba(127,127,127,.48) !important;background-color:rgba(127,127,127,.10) !important;background-image:none !important;box-shadow:none !important;color:var(--dsw-alias-label-primary) !important}',
      '#pl-pop .pl-chip.pl-chip-active,#pl-settings .pl-chip.pl-chip-active{background:rgba(127,127,127,.18) !important;background-image:none !important;border-color:rgba(127,127,127,.52) !important;box-shadow:none !important;color:var(--dsw-alias-label-primary) !important}',
      '.pl-list{flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:2px}',
      '#pl-pop .pl-item{display:flex;flex-direction:column;gap:3px;width:100%;padding:7px 8px;border:0 !important;border-radius:8px !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:inherit !important;text-align:left;cursor:pointer;font:inherit;appearance:none}',
      '#pl-pop .pl-item:hover{background:rgba(127,127,127,.10) !important;background-image:none !important;box-shadow:none !important}',
      '#pl-pop .pl-item.pl-item-active{background:rgba(127,127,127,.16) !important;background-image:none !important;box-shadow:none !important}',
      '.pl-item-head{display:flex;align-items:center;gap:8px;min-width:0}',
      '.pl-item-title{flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.pl-item-pin{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.pl-item-group{flex:none;padding:1px 6px;border-radius:999px;background:rgba(127,127,127,.16) !important;border:0 !important;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.pl-item-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}',
      // 展开态：完整正文、保留换行；限高 40vh，超出在正文区内部滚动。
      '#pl-pop .pl-item-body-open{white-space:pre-wrap;overflow-y:auto;text-overflow:clip;max-height:40vh;line-height:1.55;word-break:break-word}',
      // 三角也是 <button>，同样落在皮肤 [data-composer-card] button 规则里，必须逐项压回。
      '#pl-pop .pl-item-toggle{flex:none;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0 !important;border-radius:4px !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-secondary) !important;font:inherit;font-size:10px;line-height:1;cursor:pointer;appearance:none}',
      '#pl-pop .pl-item-toggle:hover{background:rgba(127,127,127,.10) !important;background-image:none !important;box-shadow:none !important;color:var(--dsw-alias-label-primary) !important}',
      '#pl-pop .pl-item-toggle:focus-visible{outline:1px solid rgba(127,127,127,.48);outline-offset:1px}',
      // 浮层里的普通按钮同样会被皮肤命中：统一压成中性灰，不引入新色值。
      '#pl-pop .pl-primary{padding:6px 14px;border:0 !important;border-radius:8px !important;background:rgba(127,127,127,.22) !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-primary) !important;font:inherit;font-size:12px;cursor:pointer;appearance:none}',
      '#pl-pop .pl-primary:hover{background:rgba(127,127,127,.28) !important;background-image:none !important;box-shadow:none !important}',
      '#pl-pop .pl-ghost{padding:6px 12px;border:1px solid rgba(127,127,127,.32) !important;border-radius:8px !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-secondary) !important;font:inherit;font-size:12px;cursor:pointer;appearance:none}',
      '#pl-pop .pl-ghost:hover{border-color:rgba(127,127,127,.48) !important;background:rgba(127,127,127,.10) !important;background-image:none !important;color:var(--dsw-alias-label-primary) !important}',
      '.pl-note{padding:18px 12px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pl-note-error{color:var(--dsw-alias-state-error-primary)}',
      '.pl-pop-foot{padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.pl-foot-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}',
      '#pl-pop .pl-link{padding:0;border:0 !important;border-radius:0 !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer}',
      '#pl-pop .pl-link:hover{background:transparent !important;background-image:none !important;box-shadow:none !important;color:var(--dsw-alias-label-primary);text-decoration:underline}',
      '#pl-pop .pl-link:disabled{color:var(--dsw-alias-label-secondary);cursor:default}',
      '.pl-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pl-fill{display:flex;flex-direction:column;gap:10px;padding:12px;overflow-y:auto}',
      '.pl-fill-title{font-size:13px;font-weight:600}',
      '.pl-settings{display:flex;flex-direction:column;gap:16px;max-width:680px;color:var(--dsw-alias-label-primary)}',
      '.pl-settings-title{margin:0;font-size:15px;font-weight:600}',
      '.pl-settings-intro{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
      '.pl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.pl-ghost{padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}',
      '.pl-ghost:disabled{opacity:.6;cursor:default}',
      '.pl-form{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.pl-field{display:flex;flex-direction:column;gap:4px}',
      '.pl-field-label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pl-field-hint{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pl-input,.pl-textarea{box-sizing:border-box;width:100%;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:inherit;font:inherit;outline:none}',
      '.pl-input:focus,.pl-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.pl-textarea{min-height:150px;resize:vertical;line-height:1.5}',
      '.pl-rows{display:flex;flex-direction:column;gap:6px}',
      '.pl-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}',
      '.pl-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.pl-row-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
      '.pl-row-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pl-row-actions{display:flex;gap:6px;flex:none}',
      // 设置页：条目 + 内联编辑 / 分组 + 组内列表，都用 id 级作用域兜住样式。
      '#pl-settings .pl-entry{display:flex;flex-direction:column;gap:6px}',
      '#pl-settings .pl-form-inline{padding:10px 12px}',
      '#pl-settings .pl-disclosure{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0 !important;border-radius:4px !important;background:transparent !important;background-image:none !important;box-shadow:none !important;text-shadow:none !important;color:var(--dsw-alias-label-secondary) !important;font:inherit;font-size:11px;line-height:1;cursor:pointer;appearance:none}',
      '#pl-settings .pl-disclosure:hover{background:rgba(127,127,127,.10) !important;background-image:none !important;box-shadow:none !important;color:var(--dsw-alias-label-primary) !important}',
      '#pl-settings .pl-disclosure:focus-visible{outline:1px solid rgba(127,127,127,.48);outline-offset:1px}',
      '#pl-settings .pl-group-row{cursor:pointer}',
      '#pl-settings .pl-group-row:hover{background:rgba(127,127,127,.06)}',
      '#pl-settings .pl-group-items{display:flex;flex-direction:column;gap:1px;margin:0 0 2px 14px;padding:2px 0 2px 10px;border-left:1px solid rgba(127,127,127,.18)}',
      '#pl-settings .pl-group-item{display:flex;align-items:center;gap:6px;min-height:22px;padding:2px 8px;border-radius:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '#pl-settings .pl-group-item:hover{background:rgba(127,127,127,.10);color:var(--dsw-alias-label-primary)}',
      '#pl-settings .pl-group-item-pin{flex:none;font-size:11px;color:var(--dsw-alias-label-primary)}',
      '#pl-settings .pl-group-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // 「新建」不再用品牌底：默认主题的品牌底是近黑色，按钮整块发黑，与其他次级控件也不一致。
      // 改为复用设置页已有的次级按钮样式（.pl-ghost：透明底、灰边、label-primary 文字），
      // 不新增任何色值，也彻底不依赖 --dsw-alias-brand-primary-invert 这类皮肤私有变量。
      // 新建按钮与它的编辑框同列：编辑框紧跟按钮下方展开，左边缘自然对齐。
      '#pl-settings .pl-create-zone{display:flex;flex-direction:column;gap:8px}',
      // 文档流内展开，不脱离布局；过高时在框内滚动，页面不额外位移。
      '#pl-settings .pl-form-anchor{max-height:min(52vh,460px);overflow-y:auto;overscroll-behavior:contain}',
      // 列表检索：标题与搜索框同行，计数靠右；窄窗口下折行。
      '#pl-settings .pl-list-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '#pl-settings .pl-search{max-width:280px}',
      '#pl-settings .pl-list-count{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pl-undo{display:flex;align-items:center;gap:10px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:rgba(127,127,127,.10);font-size:12px}',
      '.pl-undo-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pl-path{word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.pl-status{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pl-status-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
    ].join('')

    // —— 极简共享状态：按钮 / 浮层 / 设置页三处共用一份 ——

    const store = {
      open: false,
      owner: null,
      anchor: null,
      prompts: [],
      rev: 0,
      path: '',
      backupPath: '',
      loaded: false,
      loading: false,
      error: '',
    }
    const listeners = new Set()
    // 已挂载的 ▤ 按钮，给 Alt+P 找锚点：owner → 元素
    const buttons = new Map()

    function setState(fields) {
      let changed = false
      for (const key of Object.keys(fields)) {
        if (store[key] !== fields[key]) {
          store[key] = fields[key]
          changed = true
        }
      }
      if (changed) {
        for (const notify of listeners) notify()
      }
    }

    function useStore() {
      const pair = React.useState(0)
      const bump = pair[1]
      React.useEffect(() => {
        const notify = () => bump((n) => n + 1)
        listeners.add(notify)
        return () => {
          listeners.delete(notify)
        }
      }, [])
      return store
    }

    function translator(props) {
      return (key) => {
        if (props && typeof props.t === 'function') {
          const value = props.t(key)
          if (typeof value === 'string' && value !== '' && value !== key) return value
        }
        return zh[key] || key
      }
    }

    // —— 远端读写 ——

    async function request(method, path, body) {
      const init = { method, headers: {} }
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const res = await fetch(path, init)
      let payload = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }
      if (!res.ok || !payload || payload.ok === false) {
        const info = (payload && payload.error) || {}
        const error = new Error(info.message || '请求失败（HTTP ' + res.status + '）')
        error.code = info.code || ''
        error.status = res.status
        if (payload && payload.value) error.value = payload.value
        throw error
      }
      return payload
    }

    function collectionOf(value) {
      return value && Array.isArray(value.prompts) ? value.prompts.slice() : []
    }

    function revOf(value) {
      return value && typeof value.rev === 'number' ? value.rev : 0
    }

    async function loadLibrary() {
      setState({ loading: true, error: '' })
      try {
        const payload = await request('GET', ENDPOINT)
        const value = payload && payload.value
        setState({
          prompts: collectionOf(value),
          rev: revOf(value),
          path: typeof payload.path === 'string' ? payload.path : '',
          backupPath: typeof payload.backupPath === 'string' ? payload.backupPath : '',
          loaded: true,
          loading: false,
        })
        seedBuiltinsIfNeeded()
      } catch (error) {
        setState({ loading: false, error: (error && error.message) || '读取失败' })
      }
    }

    // 整库覆盖保存；带上已知 rev，服务端版本对不上会回 409 并把最新整库带回来。
    async function persist(prompts) {
      try {
        const payload = await request('PUT', ENDPOINT, { version: 1, rev: store.rev, prompts })
        const value = payload && payload.value
        setState({ prompts: collectionOf(value), rev: revOf(value), loaded: true, error: '' })
        return payload
      } catch (error) {
        if (error && error.code === 'conflict') {
          if (error.value) {
            setState({
              prompts: collectionOf(error.value),
              rev: revOf(error.value),
              loaded: true,
            })
          } else {
            loadLibrary()
          }
        }
        throw error
      }
    }

    function bumpUsed(id) {
      const now = Date.now()
      setState({
        prompts: store.prompts.map((item) => (item.id === id ? { ...item, lastUsedAt: now } : item)),
      })
      request('POST', ENDPOINT_USED, { id })
        .then((payload) => {
          // 记使用也会推进服务端 rev，不同步的话下一次保存会误判冲突。
          if (payload && typeof payload.rev === 'number') setState({ rev: payload.rev })
        })
        .catch(() => {})
    }

    // —— 内置模板 ——

    function builtinPrompts() {
      const now = Date.now()
      return BUILTINS.map((item, index) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        group: item.group,
        pinned: false,
        createdAt: now + index,
        updatedAt: now + index,
        lastUsedAt: 0,
      }))
    }

    function missingBuiltins(prompts) {
      const have = new Set(prompts.map((prompt) => prompt.id))
      return builtinPrompts().filter((prompt) => !have.has(prompt.id))
    }

    // 每个版本只自动补一次：补完记 localStorage，避免每次打开都写库（也就不会反复触发备份）。
    // 只按 id 补缺失项，用户改过或删掉的正文不会被覆盖回来。
    async function seedBuiltinsIfNeeded() {
      let marker = 0
      try {
        marker = Number(window.localStorage.getItem(BUILTIN_SEED_KEY) || 0)
      } catch {
        marker = 0
      }
      if (marker >= BUILTIN_VERSION) return
      const missing = missingBuiltins(store.prompts)
      if (missing.length > 0) {
        try {
          await persist(store.prompts.concat(missing))
        } catch {
          return
        }
      }
      try {
        window.localStorage.setItem(BUILTIN_SEED_KEY, String(BUILTIN_VERSION))
      } catch {
        // localStorage 不可用时最多少补一次，不影响正常使用。
      }
    }

    // —— 纯函数 ——

    function newId() {
      const api = typeof crypto !== 'undefined' ? crypto : null
      if (api && typeof api.randomUUID === 'function') return 'p_' + api.randomUUID()
      return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    }

    function sortedPrompts(prompts) {
      return prompts.slice().sort((a, b) => {
        const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
        if (pin !== 0) return pin
        const used = (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
        if (used !== 0) return used
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      })
    }

    function groupCounts(prompts) {
      const counts = new Map()
      for (const prompt of prompts) {
        if (!prompt.group) continue
        counts.set(prompt.group, (counts.get(prompt.group) || 0) + 1)
      }
      return Array.from(counts.keys())
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
        .map((group) => ({ group, count: counts.get(group) }))
    }

    function groupNames(prompts) {
      return groupCounts(prompts).map((item) => item.group)
    }

    // 分类 → 搜索 → 排序，顺序写死，浮层和测试共用这一个入口。
    // group 三态：null = 全部，'' = 未分组，其余 = 分组名。
    function selectPrompts(prompts, group, query) {
      const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
      const inGroup = group === null
        ? prompts
        : prompts.filter((prompt) => prompt.group === group)
      if (tokens.length === 0) return sortedPrompts(inGroup)
      const matched = inGroup.filter((prompt) => {
        const haystack = ((prompt.title || '') + '\n' + (prompt.body || '') + '\n' + (prompt.group || '')).toLowerCase()
        return tokens.every((token) => haystack.indexOf(token) !== -1)
      })
      return sortedPrompts(matched)
    }

    function oneLine(text, limit) {
      const flat = String(text || '').replace(/\s+/g, ' ').trim()
      return flat.length > limit ? flat.slice(0, limit) + '…' : flat
    }

    function variablesOf(body) {
      const pattern = /\{\{\s*([^{}]{1,40}?)\s*\}\}/g
      const names = []
      const seen = new Set()
      let match = pattern.exec(String(body || ''))
      while (match) {
        const name = match[1]
        if (!seen.has(name)) {
          seen.add(name)
          names.push(name)
        }
        match = pattern.exec(String(body || ''))
      }
      return names
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    function defaultVarValue(name) {
      const key = String(name || '').toLowerCase()
      const now = new Date()
      if (key === 'date' || key === 'today' || key === '日期') {
        return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
      }
      if (key === 'time' || key === '时间') {
        return pad2(now.getHours()) + ':' + pad2(now.getMinutes())
      }
      return ''
    }

    function fillVariables(body, values) {
      return String(body || '').replace(/\{\{\s*([^{}]{1,40}?)\s*\}\}/g, (whole, name) => {
        const value = values && typeof values[name] === 'string' ? values[name] : ''
        return value.trim() === '' ? whole : value
      })
    }

    function openPicker(anchor, owner) {
      setState({ open: true, anchor, owner: owner === undefined ? null : owner })
      if (!store.loaded && !store.loading) loadLibrary()
    }

    function closePicker() {
      setState({ open: false })
    }

    // —— 输入框右侧按钮 ——

    function LibraryButton(props) {
      const state = useStore()
      const t = translator(props)
      const owner = props.sessionId === undefined ? null : props.sessionId
      const active = state.open && state.owner === owner
      const buttonRef = React.useRef(null)

      React.useEffect(() => {
        const key = owner === null ? '__global__' : owner
        if (buttonRef.current) buttons.set(key, buttonRef.current)
        return () => {
          buttons.delete(key)
        }
      }, [owner])

      return h('button', {
        ref: buttonRef,
        type: 'button',
        className: 'pl-button' + (active ? ' pl-button-active' : ''),
        title: t('buttonTitle'),
        'aria-label': t('panelTitle'),
        'aria-expanded': active ? 'true' : 'false',
        onClick: (event) => {
          if (active) {
            closePicker()
            return
          }
          const rect = event.currentTarget.getBoundingClientRect()
          openPicker({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }, owner)
        },
      }, h('span', { className: 'pl-glyph' }, '▤'))
    }

    // —— 取用浮层 ——

    function LibraryPanel(props) {
      const state = useStore()
      const t = translator(props)
      const owner = props.sessionId === undefined ? null : props.sessionId
      const draft = props.useInput((input) => input.draft)
      const [query, setQuery] = React.useState('')
      const [group, setGroup] = React.useState(null)
      const [active, setActive] = React.useState(0)
      const [pending, setPending] = React.useState(null)
      const [note, setNote] = React.useState('')
      // 展开态只活在这一批结果里：换分类 / 改搜索词 / 关浮层都清空。
      const [expandedIds, setExpandedIds] = React.useState([])
      // 「存当前草稿」先开一张小表单（标题 + 分组），确认后才落库。
      const [draftForm, setDraftForm] = React.useState(null)
      const panelRef = React.useRef(null)
      const listRef = React.useRef(null)
      const searchRef = React.useRef(null)

      React.useEffect(() => {
        if (!state.open) return undefined
        setQuery('')
        setActive(0)
        setPending(null)
        setNote('')
        setExpandedIds([])
        setDraftForm(null)
        return undefined
      }, [state.open])

      // 分组被改名/删除后，正在用的分类会失效：立刻回落到「全部」，不要留一个空列表。
      React.useEffect(() => {
        if (!state.open || group === null || group === '') return undefined
        if (!state.prompts.some((prompt) => prompt.group === group)) setGroup(null)
        return undefined
      }, [state.open, group, state.prompts])

      React.useEffect(() => {
        setExpandedIds([])
      }, [group, query])

      React.useEffect(() => {
        if (state.open && pending === null && searchRef.current) searchRef.current.focus()
      }, [state.open, pending])

      React.useEffect(() => {
        if (note === '') return undefined
        const timer = setTimeout(() => setNote(''), 2200)
        return () => clearTimeout(timer)
      }, [note])

      React.useEffect(() => {
        if (!state.open) return undefined
        function onPointerDown(event) {
          const panel = panelRef.current
          if (panel && event.target instanceof Node && panel.contains(event.target)) return
          const target = event.target
          if (target && typeof target.closest === 'function' && target.closest('.pl-button')) return
          closePicker()
        }
        function onKeyDown(event) {
          if (event.key === 'Escape') closePicker()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [state.open])

      React.useEffect(() => {
        const container = listRef.current
        if (!container) return
        const node = container.querySelector('[data-active="true"]')
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
      }, [active, state.open, query, group])

      if (!state.open || state.owner !== owner) return null

      const groups = groupNames(state.prompts)
      // 失效的分组（刚被删除或改名）当「全部」处理，避免出现「下拉像是全部、列表却空白」。
      const activeGroup = group !== null && group !== '' && groups.indexOf(group) === -1 ? null : group
      const chips = [
        { key: null, label: t('allPrompts'), count: state.prompts.length },
        { key: '', label: t('ungrouped'), count: state.prompts.filter((prompt) => !prompt.group).length },
      ]
        .filter((chip) => chip.key !== '' || chip.count > 0)
        .concat(groups.map((name) => ({
          key: name,
          label: name,
          count: state.prompts.filter((prompt) => prompt.group === name).length,
        })))
      const list = selectPrompts(state.prompts, activeGroup, query)
      const index = list.length === 0 ? 0 : Math.min(active, list.length - 1)

      const style = { left: 12, bottom: 12, width: 360, maxHeight: 360 }
      if (state.anchor && typeof window !== 'undefined') {
        const width = Math.min(380, Math.max(260, window.innerWidth - 24))
        const left = Math.min(Math.max(state.anchor.left, 12), Math.max(window.innerWidth - width - 12, 12))
        const bottom = Math.max(window.innerHeight - state.anchor.top + 8, 12)
        const maxHeight = Math.min(420, Math.max(window.innerHeight - bottom - 16, 160))
        style.left = left
        style.bottom = bottom
        style.width = width
        style.maxHeight = maxHeight
      }

      function writeDraft(text) {
        const actions = props.inputActions
        if (actions && typeof actions.setDraft === 'function') actions.setDraft(text)
      }

      function finish(prompt, mode, values) {
        const text = fillVariables(prompt.body, values)
        const base = String(draft || '').trimEnd()
        writeDraft(mode === 'append' && base !== '' ? base + '\n\n' + text : text)
        closePicker()
        bumpUsed(prompt.id)
      }

      function choose(prompt, mode) {
        const names = variablesOf(prompt.body)
        if (names.length === 0) {
          finish(prompt, mode, {})
          return
        }
        const values = {}
        for (const name of names) values[name] = defaultVarValue(name)
        setPending({ prompt, mode, values })
      }

      function openDraftForm() {
        if (!state.loaded) {
          setNote(t('loading'))
          return
        }
        const body = String(draft || '').trim()
        if (body === '') {
          setNote(t('draftEmpty'))
          return
        }
        setDraftForm({ title: body.split('\n')[0].slice(0, 40), group: '', body })
      }

      function submitDraftForm() {
        if (draftForm === null) return
        const body = String(draftForm.body || '').trim()
        if (body === '') {
          setNote(t('draftEmpty'))
          return
        }
        const now = Date.now()
        const prompt = {
          id: newId(),
          // 标题留空就退回原来的默认命名：正文首行前 40 字。
          title: String(draftForm.title || '').trim() || body.split('\n')[0].slice(0, 40),
          body,
          group: String(draftForm.group || '').trim(),
          pinned: false,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: 0,
        }
        persist([prompt].concat(state.prompts))
          .then(() => {
            setDraftForm(null)
            setNote(t('draftSaved'))
          })
          .catch((error) => setNote((error && error.message) || t('failed')))
      }

      if (draftForm !== null) {
        return h('div', { className: 'pl-pop', id: 'pl-pop', ref: panelRef, style },
          h('div', { className: 'pl-fill' },
            h('div', { className: 'pl-fill-title' }, t('draftSaveTitle')),
            h('label', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('fieldTitle')),
              h('input', {
                className: 'pl-input',
                value: draftForm.title,
                autoFocus: true,
                onChange: (event) => setDraftForm({ ...draftForm, title: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitDraftForm()
                  }
                  if (event.key === 'Escape') setDraftForm(null)
                },
              }),
              h('p', { className: 'pl-field-hint' }, t('fieldTitleHint'))),
            h('label', { className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, t('fieldGroup')),
              h('input', {
                className: 'pl-input',
                value: draftForm.group,
                list: 'pl-draft-groups',
                placeholder: t('ungrouped'),
                onChange: (event) => setDraftForm({ ...draftForm, group: event.target.value }),
              }),
              // 候选 = 库里现有分组；直接打新名字就是就地新建。
              h('datalist', { id: 'pl-draft-groups' },
                groupNames(state.prompts).map((name) => h('option', { key: name, value: name }))),
              h('p', { className: 'pl-field-hint' }, t('fieldGroupHint'))),
            h('div', { className: 'pl-toolbar' },
              h('button', {
                type: 'button',
                className: 'pl-primary',
                onClick: submitDraftForm,
              }, t('save')),
              h('button', {
                type: 'button',
                className: 'pl-ghost',
                onClick: () => setDraftForm(null),
              }, t('cancel')))))
      }

      if (pending !== null) {
        const names = Object.keys(pending.values)
        return h('div', { className: 'pl-pop', id: 'pl-pop', ref: panelRef, style },
          h('div', { className: 'pl-fill' },
            h('div', { className: 'pl-fill-title' }, t('fillTitle')),
            names.map((name, position) => h('label', { key: name, className: 'pl-field' },
              h('span', { className: 'pl-field-label' }, '{{' + name + '}}'),
              h('input', {
                className: 'pl-input',
                value: pending.values[name],
                autoFocus: position === 0,
                onChange: (event) => setPending({
                  ...pending,
                  values: { ...pending.values, [name]: event.target.value },
                }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    finish(pending.prompt, pending.mode, pending.values)
                  }
                },
              }))),
            h('p', { className: 'pl-field-hint' }, t('fillHint')),
            h('div', { className: 'pl-toolbar' },
              h('button', {
                type: 'button',
                className: 'pl-primary',
                onClick: () => finish(pending.prompt, pending.mode, pending.values),
              }, t('insert')),
              h('button', {
                type: 'button',
                className: 'pl-ghost',
                onClick: () => setPending(null),
              }, t('back')))))
      }

      function toggleExpanded(id) {
        setExpandedIds((previous) => (previous.indexOf(id) === -1
          ? previous.concat(id)
          : previous.filter((item) => item !== id)))
      }

      function onSearchKeyDown(event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActive(Math.min(index + 1, Math.max(list.length - 1, 0)))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive(Math.max(index - 1, 0))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const item = list[index]
          if (item) choose(item, event.shiftKey ? 'append' : 'replace')
        }
      }

      let content
      if (state.loading && !state.loaded) {
        content = h('div', { className: 'pl-note' }, t('loading'))
      } else if (state.error) {
        content = h('div', { className: 'pl-note pl-note-error' }, state.error)
      } else if (list.length === 0) {
        content = h('div', { className: 'pl-note' }, state.prompts.length === 0 ? t('empty') : t('noMatch'))
      } else {
        content = h('div', { className: 'pl-list', ref: listRef },
          list.map((prompt, position) => {
            const isOpen = expandedIds.indexOf(prompt.id) !== -1
            return h('div', {
              key: prompt.id,
              role: 'button',
              tabIndex: 0,
              className: 'pl-item' + (position === index ? ' pl-item-active' : ''),
              'data-active': position === index ? 'true' : 'false',
              onMouseEnter: () => setActive(position),
              onClick: (event) => choose(prompt, event.shiftKey ? 'append' : 'replace'),
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                choose(prompt, event.shiftKey ? 'append' : 'replace')
              },
            },
            h('div', { className: 'pl-item-head' },
              prompt.pinned ? h('span', { className: 'pl-item-pin' }, '★') : null,
              h('span', { className: 'pl-item-title' }, prompt.title),
              prompt.group ? h('span', { className: 'pl-item-group' }, prompt.group) : null,
              // 三角单独成键：点它只切展开，不触发外层的「插入」。
              h('button', {
                type: 'button',
                className: 'pl-item-toggle',
                'aria-expanded': isOpen ? 'true' : 'false',
                'aria-label': isOpen ? t('collapse') : t('expand'),
                title: isOpen ? t('collapse') : t('expand'),
                onClick: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  toggleExpanded(prompt.id)
                },
                onKeyDown: (event) => event.stopPropagation(),
              }, isOpen ? '▾' : '▸')),
            // 展开后在正文区内部滚动；点击正文只用于选字/滚动，不再触发插入。
            h('div', {
              className: 'pl-item-body' + (isOpen ? ' pl-item-body-open' : ''),
              onClick: isOpen ? (event) => event.stopPropagation() : undefined,
            }, isOpen ? prompt.body : oneLine(prompt.body, 90)))
          }))
      }

      return h('div', { className: 'pl-pop', id: 'pl-pop', ref: panelRef, style },
        h('div', { className: 'pl-pop-head' },
          h('div', { className: 'pl-pop-title' }, t('panelTitle')),
          h('div', { className: 'pl-pop-tools' },
            h('input', {
              ref: searchRef,
              className: 'pl-search',
              type: 'search',
              value: query,
              placeholder: t('search'),
              onChange: (event) => {
                setQuery(event.target.value)
                setActive(0)
              },
              onKeyDown: onSearchKeyDown,
            }),
            null),
          h('div', { className: 'pl-chips' }, chips.map((chip) => h('button', {
            key: chip.key === null ? '__all__' : 'g:' + chip.key,
            type: 'button',
            className: 'pl-chip' + (activeGroup === chip.key ? ' pl-chip-active' : ''),
            onClick: () => {
              setGroup(chip.key)
              setActive(0)
            },
          }, chip.label + ' · ' + chip.count)))),
        content,
        h('div', { className: 'pl-pop-foot' },
          h('div', null, note !== '' ? note : t('shownHint').replace('{n}', String(list.length)).replace('{m}', String(state.prompts.length))),
          h('div', { className: 'pl-foot-row' },
            h('button', {
              type: 'button',
              className: 'pl-link',
              disabled: !state.loaded,
              onClick: openDraftForm,
            }, '＋ ' + t('saveDraft')),
            h('span', { className: 'pl-hint' }, t('appendHint')))))
    }

    // —— 设置页 ——

    function SettingsPage(props) {
      const state = useStore()
      const t = translator(props)
      const [form, setForm] = React.useState(null)
      const [status, setStatus] = React.useState('')
      const [failed, setFailed] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [deleted, setDeleted] = React.useState(null)
      const [renaming, setRenaming] = React.useState(null)
      // 分组管理里展开的组名；默认全部收起，离开设置页即复位。
      const [expandedGroups, setExpandedGroups] = React.useState([])
      // 列表检索词：复用浮层的 selectPrompts，不另写过滤逻辑。
      const [query, setQuery] = React.useState('')
      // 列表分组筛选：null = 全部，'' = 未分组，其余 = 分组名。
      const [group, setGroup] = React.useState(null)
      // 危险操作的二次确认：null 或 { kind: 'delete', prompt } / { kind: 'dissolve', name, count }。
      const [dialog, setDialog] = React.useState(null)
      const mergeRef = React.useRef(null)
      const replaceRef = React.useRef(null)

      React.useEffect(() => {
        if (!store.loaded && !store.loading) loadLibrary()
      }, [])

      React.useEffect(() => {
        if (status === '') return undefined
        const timer = setTimeout(() => setStatus(''), 4000)
        return () => clearTimeout(timer)
      }, [status])

      React.useEffect(() => {
        if (!deleted) return undefined
        const timer = setTimeout(() => setDeleted(null), 6000)
        return () => clearTimeout(timer)
      }, [deleted])

      // Esc 关闭确认弹窗；只关窗，不执行任何写入。
      React.useEffect(() => {
        if (dialog === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setDialog(null)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [dialog])

      function note(message, isError) {
        setStatus(message)
        setFailed(Boolean(isError))
      }

      async function run(action) {
        setBusy(true)
        try {
          await action()
        } catch (error) {
          const key = error && error.code === 'conflict' ? 'conflict' : ''
          note((key && t(key)) || (error && error.message) || t('failed'), true)
        } finally {
          setBusy(false)
        }
      }

      function startCreate() {
        setForm({ id: '', title: '', body: '', group: '' })
        note('', false)
      }

      function startEdit(prompt) {
        setForm({ id: prompt.id, title: prompt.title, body: prompt.body, group: prompt.group })
      }

      function submit() {
        if (!form) return
        const body = String(form.body || '').trim()
        if (body === '') {
          note(t('needBody'), true)
          return
        }
        const title = String(form.title || '').trim()
        const group = String(form.group || '').trim()
        const now = Date.now()
        const next = state.prompts.slice()
        if (form.id) {
          const position = next.findIndex((item) => item.id === form.id)
          if (position === -1) return
          next[position] = {
            ...next[position],
            title: title || next[position].title,
            body,
            group,
            updatedAt: now,
          }
        } else {
          next.unshift({
            id: newId(),
            title: title || body.split('\n')[0].slice(0, 40),
            body,
            group,
            pinned: false,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: 0,
          })
        }
        run(async () => {
          await persist(next)
          setForm(null)
          note(t('saved'), false)
        })
      }

      function remove(prompt) {
        setDialog({ kind: 'delete', prompt })
      }

      function confirmRemove(prompt) {
        const position = state.prompts.findIndex((item) => item.id === prompt.id)
        if (position === -1) return
        const next = state.prompts.filter((item) => item.id !== prompt.id)
        run(async () => {
          await persist(next)
          setDeleted({ prompt, position })
          if (form && form.id === prompt.id) setForm(null)
        })
      }

      function undoRemove() {
        if (!deleted) return
        const source = deleted
        const next = state.prompts.slice()
        next.splice(Math.min(source.position, next.length), 0, source.prompt)
        run(async () => {
          await persist(next)
          setDeleted(null)
          note(t('undone').replace('{title}', source.prompt.title), false)
        })
      }

      function togglePin(prompt) {
        const next = state.prompts.map((item) => (
          item.id === prompt.id ? { ...item, pinned: !item.pinned } : item
        ))
        run(async () => {
          await persist(next)
        })
      }

      function toggleGroup(name) {
        setExpandedGroups((previous) => (previous.indexOf(name) === -1
          ? previous.concat(name)
          : previous.filter((item) => item !== name)))
      }

      // 重命名 = 把该分组下所有条目的 group 改成新名字；新名字已有同组时自然合并。
      function renameGroup(from, raw) {
        const to = String(raw || '').trim()
        setRenaming(null)
        if (to === from) return
        const next = state.prompts.map((item) => (item.group === from ? { ...item, group: to } : item))
        run(async () => {
          await persist(next)
          note(to === '' ? t('dissolved').replace('{name}', from) : t('renamed').replace('{name}', to), false)
        })
      }

      // 解散 = 只把分组名清空，条目一条不少地回到「未分组」。
      function dissolveGroup(name, count) {
        setDialog({ kind: 'dissolve', name, count })
      }

      function confirmDissolve(name) {
        const next = state.prompts.map((item) => (item.group === name ? { ...item, group: '' } : item))
        run(async () => {
          await persist(next)
          note(t('dissolved').replace('{name}', name), false)
        })
      }

      function seedMissing() {
        run(async () => {
          const missing = missingBuiltins(state.prompts)
          if (missing.length === 0) {
            note(t('seedNone'), false)
            return
          }
          await persist(state.prompts.concat(missing))
          try {
            window.localStorage.setItem(BUILTIN_SEED_KEY, String(BUILTIN_VERSION))
          } catch {
            // 手动补齐时 localStorage 不可用不影响结果。
          }
          note(t('seeded').replace('{n}', String(missing.length)), false)
        })
      }

      function exportAll() {
        const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), prompts: state.prompts }, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'prompt-library.json'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      function importFile(mode, event) {
        const input = event.target
        const file = input.files && input.files[0]
        input.value = ''
        if (!file) return
        run(async () => {
          let parsed = null
          try {
            parsed = JSON.parse(await file.text())
          } catch {
            throw new Error(t('importInvalid'))
          }
          const incoming = Array.isArray(parsed)
            ? parsed
            : (parsed && Array.isArray(parsed.prompts) ? parsed.prompts : null)
          if (!incoming) throw new Error(t('importInvalid'))

          const clean = []
          for (const raw of incoming) {
            if (!raw || typeof raw !== 'object' || typeof raw.body !== 'string' || raw.body.trim() === '') continue
            clean.push({ ...raw, id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId() })
          }

          if (mode === 'replace') {
            if (!window.confirm(t('confirmReplace').replace('{n}', String(clean.length)))) return
            await persist(clean)
            setForm(null)
            setDeleted(null)
            note(t('importedReplace').replace('{n}', String(clean.length)), false)
            return
          }

          const map = new Map(state.prompts.map((item) => [item.id, item]))
          let added = 0
          for (const raw of clean) {
            const existing = map.get(raw.id)
            if (existing) {
              map.set(raw.id, { ...existing, ...raw })
            } else {
              added += 1
              map.set(raw.id, raw)
            }
          }
          await persist(Array.from(map.values()))
          note(t('imported').replace('{n}', String(added)), false)
        })
      }

      // 分组筛选条：全部 / 未分组 / 各分组；分组被删或改名后自动回落到「全部」。
      const groupList = groupCounts(state.prompts)
      const groupKey = group === '' || (group !== null && groupList.some((item) => item.group === group)) ? group : null
      const chips = [{ key: null, label: t('allPrompts'), count: state.prompts.length }]
      const ungrouped = state.prompts.filter((item) => !item.group).length
      if (ungrouped > 0) chips.push({ key: '', label: t('ungrouped'), count: ungrouped })
      for (const entry of groupList) chips.push({ key: entry.group, label: entry.group, count: entry.count })

      // 检索结果；正在编辑的条目即使不匹配也保留，避免编辑框被抽走。
      const visible = selectPrompts(state.prompts, groupKey, query)
      const editing = form !== null && form.id !== '' ? state.prompts.find((item) => item.id === form.id) : null
      const prompts = editing && !visible.some((item) => item.id === editing.id)
        ? sortedPrompts(visible.concat([editing]))
        : visible

      const dataFiles = state.path === '' ? null : h('p', { className: 'pl-field-hint pl-path' },
        t('pathLabel') + '：' + state.path + (state.backupPath ? ' · ' + t('backupLabel') + '：' + state.backupPath : ''))

      const groupBlock = h('div', { className: 'pl-field' },
        h('span', { className: 'pl-field-label' }, t('groupManage')),
        h('p', { className: 'pl-field-hint' }, t('groupManageHint')),
        groupList.length === 0
          ? h('p', { className: 'pl-field-hint' }, t('groupsEmpty'))
          : h('div', { className: 'pl-rows' }, groupList.map((entry) => {
            const open = expandedGroups.indexOf(entry.group) !== -1
            const members = state.prompts.filter((prompt) => prompt.group === entry.group)
            // 三角在重命名态也保留，保证 aria-expanded 始终可读。
            const disclosure = h('button', {
              key: 'toggle',
              type: 'button',
              className: 'pl-disclosure',
              'aria-expanded': open ? 'true' : 'false',
              'aria-label': open ? t('collapse') : t('expand'),
              title: open ? t('collapse') : t('expand'),
              onClick: () => toggleGroup(entry.group),
            }, open ? '▾' : '▸')
            return h('div', { key: entry.group, className: 'pl-entry' },
              h('div', {
                className: 'pl-row pl-group-row',
                onClick: (event) => {
                  const target = event.target
                  // 行内按钮（重命名/解散/三角）各自处理点击，不重复切展开。
                  if (target && typeof target.closest === 'function' && target.closest('button')) return
                  // 正在重命名时不收起，避免输入框被抽走。
                  if (renaming !== null && renaming.group === entry.group) return
                  toggleGroup(entry.group)
                },
              },
                renaming !== null && renaming.group === entry.group
                  ? h('input', {
                    className: 'pl-input',
                    value: renaming.value,
                    autoFocus: true,
                    onChange: (event) => setRenaming({ group: entry.group, value: event.target.value }),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        renameGroup(entry.group, renaming.value)
                      }
                      if (event.key === 'Escape') setRenaming(null)
                    },
                  })
                  : h('div', { className: 'pl-row-main' },
                    h('div', { className: 'pl-row-title' }, entry.group),
                    h('div', { className: 'pl-row-meta' }, String(entry.count) + ' ' + t('itemsSuffix'))),
                h('div', { className: 'pl-row-actions' },
                  renaming !== null && renaming.group === entry.group
                    ? [
                      h('button', {
                        key: 'ok',
                        type: 'button',
                        className: 'pl-ghost',
                        disabled: busy,
                        onClick: () => renameGroup(entry.group, renaming.value),
                      }, t('ok')),
                      h('button', {
                        key: 'cancel',
                        type: 'button',
                        className: 'pl-ghost',
                        onClick: () => setRenaming(null),
                      }, t('cancel')),
                      disclosure,
                    ]
                    : [
                      h('button', {
                        key: 'rename',
                        type: 'button',
                        className: 'pl-ghost',
                        disabled: busy,
                        onClick: () => setRenaming({ group: entry.group, value: entry.group }),
                      }, t('rename')),
                      h('button', {
                        key: 'dissolve',
                        type: 'button',
                        className: 'pl-ghost',
                        disabled: busy,
                        onClick: () => dissolveGroup(entry.group, entry.count),
                      }, t('dissolve')),
                      disclosure,
                    ])),
              open
                ? h('div', { className: 'pl-group-items' }, members.map((prompt) => h('div', {
                  key: prompt.id,
                  className: 'pl-group-item',
                  title: prompt.title,
                },
                  prompt.pinned ? h('span', { className: 'pl-group-item-pin' }, '★') : null,
                  h('span', { className: 'pl-group-item-title' }, prompt.title))))
                : null)
          })))

      // 编辑器：新建时整块放在顶部；编辑既有条目时内联挂在那一行下面。
      function editorFields(current) {
        return [
          h('div', { className: 'pl-settings-title' }, current.id ? t('editorEdit') : t('editorNew')),
          h('div', { className: 'pl-field' },
            h('span', { className: 'pl-field-label' }, t('fieldTitle')),
            h('input', {
              className: 'pl-input',
              value: current.title,
              onChange: (event) => setForm({ ...current, title: event.target.value }),
            }),
            h('p', { className: 'pl-field-hint' }, t('fieldTitleHint'))),
          h('div', { className: 'pl-field' },
            h('span', { className: 'pl-field-label' }, t('fieldGroup')),
            h('input', {
              className: 'pl-input',
              value: current.group,
              list: 'pl-group-options',
              onChange: (event) => setForm({ ...current, group: event.target.value }),
            }),
            h('datalist', { id: 'pl-group-options' },
              groupNames(state.prompts).map((name) => h('option', { key: name, value: name }))),
            h('p', { className: 'pl-field-hint' }, t('fieldGroupHint'))),
          h('div', { className: 'pl-field' },
            h('span', { className: 'pl-field-label' }, t('fieldBody')),
            h('textarea', {
              className: 'pl-textarea',
              value: current.body,
              onChange: (event) => setForm({ ...current, body: event.target.value }),
            }),
            h('p', { className: 'pl-field-hint' }, t('fieldBodyHint'))),
          h('div', { className: 'pl-toolbar' },
            h('button', { type: 'button', className: 'pl-ghost', disabled: busy, onClick: submit }, t('save')),
            h('button', {
              type: 'button',
              className: 'pl-ghost',
              disabled: busy,
              onClick: () => setForm(null),
            }, t('cancel'))),
        ]
      }

      function renderEditor(className) {
        return h('div', { className }, ...editorFields(form))
      }

      const undoBar = deleted === null ? null : h('div', { className: 'pl-undo' },
        h('span', { className: 'pl-undo-text' }, t('deleteUndo').replace('{title}', deleted.prompt.title)),
        h('button', {
          type: 'button',
          className: 'pl-ghost',
          disabled: busy,
          onClick: undoRemove,
        }, t('undo')))

      // 两处危险操作共用同一个确认弹窗；取消、Esc、点遮罩都只关窗，不产生任何写入。
      const dialogNode = dialog === null ? null : (() => {
        const isDelete = dialog.kind === 'delete'
        const title = t(isDelete ? 'confirmDeleteTitle' : 'confirmDissolveTitle')
        const body = isDelete
          ? t('confirmDeleteBody').replace('{title}', dialog.prompt.title)
          : t('confirmDissolve').replace('{name}', dialog.name).replace('{n}', String(dialog.count))
        return h('div', {
          className: 'pl-dialog-mask',
          id: 'pl-dialog-mask',
          onClick: (event) => {
            if (event.target === event.currentTarget) setDialog(null)
          },
        }, h('div', {
          className: 'pl-dialog',
          id: 'pl-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
        },
        h('p', { className: 'pl-dialog-title', id: 'pl-dialog-title' }, title),
        h('p', { className: 'pl-dialog-body', id: 'pl-dialog-body' }, body),
        h('div', { className: 'pl-dialog-actions', id: 'pl-dialog-actions' },
          h('button', {
            type: 'button',
            className: 'pl-ghost',
            id: 'pl-dialog-cancel',
            onClick: () => setDialog(null),
          }, t('cancel')),
          h('button', {
            type: 'button',
            className: 'pl-ghost pl-danger',
            id: 'pl-dialog-confirm',
            disabled: busy,
            onClick: () => {
              const pending = dialog
              setDialog(null)
              if (pending.kind === 'delete') confirmRemove(pending.prompt)
              else confirmDissolve(pending.name)
            },
          }, t('ok')))))
      })()

      const rows = prompts.length === 0
        ? h('p', { className: 'pl-field-hint' }, t('listEmpty'))
        : h('div', { className: 'pl-rows' }, prompts.map((prompt) => h('div', { key: prompt.id, className: 'pl-entry' },
          h('div', { className: 'pl-row' },
            h('div', { className: 'pl-row-main' },
              h('div', { className: 'pl-row-title' }, (prompt.pinned ? '★ ' : '') + prompt.title),
              h('div', { className: 'pl-row-meta' }, [prompt.group, oneLine(prompt.body, 70)].filter(Boolean).join(' · '))),
            h('div', { className: 'pl-row-actions' },
              h('button', {
                type: 'button',
                className: 'pl-ghost',
                title: prompt.pinned ? t('unpin') : t('pin'),
                disabled: busy,
                onClick: () => togglePin(prompt),
              }, prompt.pinned ? '★' : '☆'),
              h('button', {
                type: 'button',
                className: 'pl-ghost',
                disabled: busy,
                onClick: () => startEdit(prompt),
              }, t('edit')),
              h('button', {
                type: 'button',
                className: 'pl-ghost',
                disabled: busy,
                onClick: () => remove(prompt),
              }, t('remove')))),
          // 同一时间只会有一条处于编辑态：form 是单值 state。
          form !== null && form.id === prompt.id ? renderEditor('pl-form pl-form-inline') : null)))

      return h('div', { className: 'pl-settings', id: 'pl-settings' },
        h('h2', { className: 'pl-settings-title' }, t('settingsTitle')),
        h('p', { className: 'pl-settings-intro' }, t('settingsIntro')),
        // 新建按钮与它的编辑框放在同一列里：编辑框紧跟按钮下方，左边缘自然对齐。
        h('div', { className: 'pl-create-zone' },
          h('div', { className: 'pl-toolbar' },
            h('button', { type: 'button', className: 'pl-ghost pl-create', disabled: busy, onClick: startCreate }, t('create')),
            h('button', {
              type: 'button',
              className: 'pl-ghost',
              disabled: busy,
              onClick: () => mergeRef.current && mergeRef.current.click(),
            }, t('importMerge')),
            h('input', {
              ref: mergeRef,
              type: 'file',
              accept: '.json,application/json',
              style: { display: 'none' },
              onChange: (event) => importFile('merge', event),
            }),
            h('button', {
              type: 'button',
              className: 'pl-ghost',
              disabled: busy,
              onClick: () => replaceRef.current && replaceRef.current.click(),
            }, t('importReplace')),
            h('input', {
              ref: replaceRef,
              type: 'file',
              accept: '.json,application/json',
              style: { display: 'none' },
              onChange: (event) => importFile('replace', event),
            }),
            h('button', { type: 'button', className: 'pl-ghost', disabled: busy, onClick: exportAll }, t('exportLabel')),
            h('button', { type: 'button', className: 'pl-ghost', disabled: busy, onClick: seedMissing }, t('seedBuiltin')),
            status === '' ? null : h('span', { className: failed ? 'pl-status-error' : 'pl-status' }, status)),
          form !== null && !form.id ? renderEditor('pl-form pl-form-anchor') : null),
        state.loading && !state.loaded ? h('p', { className: 'pl-field-hint' }, t('loading')) : null,
        state.error ? h('p', { className: 'pl-status-error' }, state.error) : null,
        dataFiles,
        groupBlock,
        undoBar,
        dialogNode,
        h('div', { className: 'pl-field' },
          h('div', { className: 'pl-list-head' },
            h('span', { className: 'pl-field-label' }, t('listTitle')),
            h('input', {
              className: 'pl-search',
              type: 'search',
              value: query,
              placeholder: t('search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            h('span', { className: 'pl-list-count' },
              t('shownHint').replace('{n}', String(prompts.length)).replace('{m}', String(state.prompts.length)))),
          h('div', { className: 'pl-chips' }, chips.map((chip) => h('button', {
            key: chip.key === null ? '__all__' : 'g:' + chip.key,
            type: 'button',
            className: 'pl-chip' + (groupKey === chip.key ? ' pl-chip-active' : ''),
            onClick: () => setGroup(chip.key),
          }, chip.label + ' · ' + chip.count))),
          rows))
    }

    // 临时探针：把浮层里分类按钮/条目的最终计算样式回传给宿主，用于排查外部皮肤的强制覆盖。
    // 颜色定稿后即可删除这一整段与宿主侧的 /__diag 路由。
    function probeComputedStyle() {
      try {
        const host = document.createElement('div')
        host.setAttribute('data-pl-probe', '1')
        host.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;pointer-events:none'
        host.innerHTML =
          '<div class="pl-pop" style="position:static">' +
          '<div class="pl-chips"><button class="pl-chip">探针</button>' +
          '<button class="pl-chip pl-chip-active">选中</button></div>' +
          '<div class="pl-list"><button class="pl-item"><span class="pl-item-title">标题</span></button></div>' +
          '</div>'
        // 探针必须挂在浮层真实所处的上下文里：皮肤是按 [data-composer-card] 刷按钮的，
        // 挂在 body 上会读到一份「没被皮肤碰过」的假干净样式（上一轮就栽在这）。
        const anchor = document.getElementById('pl-pop')
          || document.querySelector('[data-composer-card]')
          || document.body
        anchor.appendChild(host)
        const read = (element) => {
          const style = getComputedStyle(element)
          return {
            background: style.backgroundColor,
            image: style.backgroundImage,
            border: style.borderColor,
            shadow: style.boxShadow,
            color: style.color,
            height: style.height,
            fontSize: style.fontSize,
            appearance: style.appearance,
          }
        }
        const chip = host.querySelector('.pl-chip')
        const active = host.querySelector('.pl-chip-active')
        const item = host.querySelector('.pl-item')
        const rules = []
        for (const sheet of Array.from(document.styleSheets || [])) {
          let list
          try {
            list = sheet.cssRules
          } catch {
            continue
          }
          for (const rule of Array.from(list || [])) {
            const text = rule.cssText || ''
            if (!/pl-(chip|item)|button/.test(text)) continue
            if (!/background|border/.test(text)) continue
            rules.push((sheet.href || 'inline') + ' :: ' + text.slice(0, 400))
            if (rules.length >= 24) break
          }
        }
        const liveChip = document.querySelector('#pl-pop .pl-chip')
        const liveItem = document.querySelector('#pl-pop .pl-item')
        // 「新建」按钮在设置页才有；用同 ID 的探针节点复算，页面已停在设置页时顺手读真实节点。
        const settingsHost = document.createElement('div')
        settingsHost.id = 'pl-settings'
        settingsHost.style.cssText = 'position:fixed;left:-9999px;top:0'
        settingsHost.innerHTML = '<button type="button" class="pl-ghost pl-create">新建</button>' +
          '<button type="button" class="pl-ghost pl-save-probe">保存</button>'
        document.body.appendChild(settingsHost)
        const createProbe = settingsHost.querySelector('.pl-create')
        const ghostProbe = settingsHost.querySelector('.pl-save-probe')
        const liveCreate = document.querySelector('#pl-settings .pl-create')
        const liveGhost = document.querySelector('#pl-settings .pl-ghost')
        const payload = {
          at: new Date().toISOString(),
          skin: document.documentElement.getAttribute('data-dsh-skin'),
          insideCard: Boolean(document.querySelector('[data-composer-card]')),
          styleTags: document.querySelectorAll('style[data-plugin]').length,
          sheets: (document.styleSheets || []).length,
          rules,
          chip: read(chip),
          active: read(active),
          item: read(item),
          liveChip: liveChip ? read(liveChip) : null,
          liveItem: liveItem ? read(liveItem) : null,
          create: read(createProbe),
          ghost: read(ghostProbe),
          liveCreate: liveCreate ? read(liveCreate) : null,
          liveGhost: liveGhost ? read(liveGhost) : null,
        }
        host.remove()
        settingsHost.remove()
        fetch(ENDPOINT + '/__diag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {})
      } catch {
        /* 探针失败不影响插件 */
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = NS
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-prompt-library: styles')

        ctx.effect(() => {
          const timer = setTimeout(probeComputedStyle, 2500)
          return () => clearTimeout(timer)
        }, 'dsh-prompt-library: style-probe')

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-prompt-library: dictionaries')

        // Alt+P：直接借用已挂载的 ▤ 按钮当锚点，位置和聚焦会话都对得上；
        // 没有按钮可达（比如纯设置页）就什么都不做。
        ctx.effect(() => {
          function onKeyDown(event) {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            if (event.key !== 'p' && event.key !== 'P') return
            event.preventDefault()
            if (store.open) {
              closePicker()
              return
            }
            for (const [key, element] of buttons) {
              if (!element || typeof element.getBoundingClientRect !== 'function') continue
              const rect = element.getBoundingClientRect()
              openPicker(
                { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
                key === '__global__' ? null : key,
              )
              return
            }
          }
          document.addEventListener('keydown', onKeyDown)
          return () => document.removeEventListener('keydown', onKeyDown)
        }, 'dsh-prompt-library: hotkey')

        const boundT = ctx.locale.bind(NS)

        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'prompt-library',
          order: BUTTON_ORDER,
          locale: NS,
        }, LibraryButton))

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'prompt-library-picker',
          order: OVERLAY_ORDER,
          locale: NS,
        }, LibraryPanel))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SETTINGS_SECTION_ID,
          order: SETTINGS_SECTION_ORDER,
          label: () => boundT('settingsNav'),
          locale: NS,
        }, SettingsPage))
      },
    }
  },
})
# Obsidian Zotero Importer（基于 Templater 的 Zotero 元数据导入）

[English](README.md) | 中文

## 这是什么

这是一个给 Obsidian 的小脚本项目：依托 Obsidian 的 Templater 插件（https://github.com/SilentVoid13/Templater），直接从本机 Zotero 的 Local API 读取文献元数据，并把这些元数据“插入到你当前打开的已有笔记里”（而不是新建笔记）。

适合想给 Obsidian/Zotero “瘦身”的用户：不依赖 zotero-integration / zotlit 等第三方插件，也不要求安装 Better BibTeX（如果装了会更好用：可自动拿到 citation key；没装也能正常工作，会回退到 Zotero item key）。

## 优点

- 只依赖 Templater：减少插件耦合，降低 Obsidian/Zotero 大版本更新带来的不可用风险
- 全程在 Obsidian 内完成选择：用 Obsidian 内置 suggester 列表挑选文献，不需要跳出 Obsidian 另开选择窗口，更容易保持心流
- 直接走 Zotero Local API：不需要导出 BibTeX / CSL JSON，不需要 Better BibTeX 也能获取核心元数据（标题/作者/年份/期刊/摘要/收藏夹等）

## 目录结构

- `scripts/zotero_picker.js`：Templater User Script；拉取 Zotero 条目列表并在 Obsidian 内选择，返回结构化元数据
- `templates/temp.md`：示例模板；把返回的元数据写入 YAML frontmatter + 信息块 + 摘要

## 前置条件

1. 已安装 Obsidian 插件：Templater
2. Zotero 已开启，并在 Zotero 设置中启用：
   - “允许此计算机的其他应用程序与 Zotero 通信”（不同版本措辞略有差异）
3. Zotero Local API 默认端口为 `23119`（本项目默认访问 `http://localhost:23119`）

## 安装/配置

1. 把 `scripts/zotero_picker.js` 放到你的 Obsidian Vault 的 Templater “User scripts” 目录中
   - 该目录位置以你的 Templater 设置为准（Templater 设置页里可配置/查看）
2. 把 `templates/temp.md` 放到你的 Templater “Template folder” 目录（或你自己的模板目录）
3. 重启 Obsidian（或让 Templater 重新加载脚本/模板）

## 使用方式（插入到已有笔记）

1. 打开你想要写/补充的那篇笔记（已有笔记）
2. 运行 Templater 命令：插入模板（Insert template）
3. 选择 `temp.md`
4. 在弹出的选择器里选中文献条目
5. 模板会把元数据插入到当前笔记中（YAML + info + Abstract）

## 可自定义点

- 你可以自由修改 `templates/temp.md`：
  - 想写进 frontmatter 的字段
  - 想展示的 info 块格式
  - Tags 如何从 collections 生成（示例里把空格替换成 `_`）
- 如果你不想要（或没有）Better BibTeX：
  - 脚本会自动回退到 Zotero `itemKey` 作为 `citekey`
  - 你也可以在 `scripts/zotero_picker.js` 里删除/注释 “Better BibTeX citation key” 那一段逻辑

## 常见问题

- 提示连接失败/加载不到文献：
  - 确认 Zotero 正在运行
  - 确认已开启“允许此计算机的其他应用程序与 Zotero 通信”
  - 确认本机没有把 `23119` 端口拦掉（防火墙/代理软件）
- 运行报错：
  - 在 Obsidian 里按 `Cmd+Option+I` 打开开发者工具，看 Console 日志（脚本里会输出错误）

## 说明

这个脚本可以非常简单地增加获取 Zotero 的笔记/注释（notes/annotations）功能，如果你需要可以自己加上。本项目为了精简，只获取元数据。

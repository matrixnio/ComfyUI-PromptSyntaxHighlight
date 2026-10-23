# ComfyUI Prompt Syntax Highlight

**提示词结构高亮** — 在 ComfyUI 的任何提示词输入框里，把 `[Shot 1]`、`<d>...</d>`、`(s1)` 这类结构标记染成绿色。

可编辑的 STRING 多行输入框、只读的 Show Text 显示框都支持；第三方文本节点同样生效。

> [English README](README.md)

![高亮效果](assets/syntax-example.png)

*高亮规则的渲染示意图（与 CSS 同一套配色，非界面截图）。*

---

## 为什么

分镜列表、`subject_definitions` 段、负面词段——整段同色时很难扫读。把标记染色之后，
镜头边界和标签段落一眼可见，而且**不改变送进模型的任何字符**。

- **纯视觉层**：只覆盖显示，编码用的仍是原文，一个字都不改。
- **不挑节点**：钩的是多行 `textarea`，别人家的文本节点也能高亮。
- **零依赖、零节点、零 Python 逻辑**：删掉目录即彻底回滚。

## 功能

| 项 | 说明 |
|---|---|
| 可编辑输入框 | 边打边高亮，光标 / 选区 / 撤销 / 复制不受影响 |
| 只读显示框 | 同一套规则（如 Show Text） |
| 标签包裹内容 | 配对标签内的文字整体铺暗绿，起块状提示作用 |
| 画布缩放与拖动 | 每帧跟随，`transform: scale` 也像素对齐 |
| 中文输入法 | 组合期间自动露出原文，候选框不被遮 |
| 可配置 | 规则就是一个数组，在单个 JS 文件顶部 |
| 开关 | 总开关 + 可编辑 / 只读 分开关 |

## 安装

**ComfyUI Manager** — 搜索 `Prompt Syntax Highlight` 安装。

**comfy-cli**

```bash
comfy node install comfyui-prompt-syntax-highlight
```

**手动**

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/matrixnio/ComfyUI-PromptSyntaxHighlight.git
```

重启 ComfyUI 生效。之后**只改 JS 不用重启**，`Ctrl+F5` 硬刷新即可（普通刷新会用缓存）。

卸载：删掉整个目录，重启 ComfyUI。

## 使用

打开带提示词框的工作流直接打字。默认规则：

```text
summary: 雨夜霓虹街头，男主快步穿过积水          <- 普通文字，保持原色
<d>cinematic teal-orange grade, 35mm</d>        <- 标签亮绿加粗；包裹内容暗绿
[Shot 1] at 00:00.000  medium wide (s1)         <- 方括号青绿加粗；(s1) 浅绿加粗
```

设置里搜「提示词高亮」（或 `Prompt highlight`）：

| 设置项 | 默认 | 作用 |
|---|---|---|
| `PHL.Enabled` | 开 | 总开关 |
| `PHL.Editable` | 开 | 是否处理可编辑输入框 |
| `PHL.Readonly` | 开 | 是否处理只读显示框 |

自动跳过：单行输入框、`disabled` 元素、placeholder 含 `search` / `filter` / `搜索` / `查找` 的框。

## 高亮规则

规则在 [`web/prompt_syntax_highlight.js`](web/prompt_syntax_highlight.js) 顶部的 `RULES` 数组里，
**数组顺序即优先级**（后面的覆盖前面重叠部分）：

| 优先级 | 匹配 | 示例 | 颜色 |
|---|---|---|---|
| 1（最低） | 配对标签之间的**内容** | `good sad reminder` | `#2e9e68` 暗绿 |
| 2 | 标签本身 | `<d> </d> <subject1> <picture 1a>` | `#4ade80` 亮绿 粗 |
| 3 | 方括号 | `[Shot 1] [Shot 2]` | `#34d399` 青绿 粗 |
| 4（最高） | 圆括号编号 | `(s1) (s2) (shot 3)` | `#86efac` 浅绿 粗 |

加一种新符号：

```js
{ id: 5, re: /【[^】\n]{1,40}】/g },   // 中文方头括号
```

再在 `CLS_NAME` 里补 `5: "phl-bracket"`（复用已有颜色），或在 `CSS` 里加新类。

> 只想要「符号变绿、内容不变」：删掉 `RULES` 里第 1 条（带 `group: 2` 的那条）。

## 工作原理（改代码前必读）

1. 原 textarea **完全保留**——输入、光标、选区、复制、撤销、滚动都还在它身上发生。
2. 在它上方叠一个 `position: fixed` 的 `<pre>` 镜像层，按规则把文字包成彩色 `<span>`。
3. 原 textarea 只把**文字**设为透明（`color` + `-webkit-text-fill-color`），
   并用 `caret-color` 单独把光标设成亮色——否则光标会跟着一起透明。
4. 镜像层每帧用 `getBoundingClientRect()` 跟随；节点拖动、画布缩放（含 `transform: scale`）、
   窗口滚动都能对齐；缩放比用 `rect.width / offsetWidth` 实时换算。
5. 字体、行高、内边距、字距、`text-align` 从原 textarea 的 computed style 复制，
   每 15 帧才重读一次（`getComputedStyle` 开销大）。
6. **中文输入法组合期间**（`compositionstart` → `compositionend`）自动恢复原文可见并隐藏镜像层。

**安全阀**：只有镜像层成功渲染并定位后，才让原文字透明；被弹窗盖住或移出视口时自动恢复；
解析异常退回纯文本。任何情况下都不会让输入框变空。

## 兼容性

- ComfyUI **≥ 0.3.0**（在 0.3.x / Windows / Chrome·Edge 实测）。无 Python 依赖。
- 只用公开扩展 API：`app.registerExtension`、`app.ui.settings.addSetting`、`WEB_DIRECTORY`，
  不改其他插件任何文件。
- Nodes 2.0（实验特性）下 DOM 不同，代码走「图对象 + DOM 兜底」双路扫描，但该模式尚未实测。

## 排错

```bash
curl http://127.0.0.1:8188/prompt_syntax_highlight/status
```

```json
{"version": "1.0.0", "hits": 6, "targets": 4, "painted": 4, "last_error": ""}
```

| 现象 | 含义 | 处理 |
|---|---|---|
| `hits` = 0 | 前端没执行本扩展 | 没重启 ComfyUI，或缓存了旧 JS（Ctrl+F5） |
| `hits` > 0，`targets` = 0 | 跑了但没找到文本框 | 画布上没有多行文本节点；或节点被折叠 / 不可见 |
| `targets` > 0，`painted` = 0 | 找到但渲染失败 | 看 `last_error` |
| 文字整体消失 | 镜像层没跟上 | 刷新页面；复现则把 `last_error` 发出来 |

`last_error` 里出现 `ta=3 ro=false h=120` 是自查诊断串，说明当时一个都没接管到
（附当时找到的 textarea 数量与属性）。

## 隐私

全部在浏览器本地完成，提示词正文**从不离开页面**。唯一的网络请求是
`POST /prompt_syntax_highlight/ping` 与 `/report`，只发送「接管了几个框、成功渲染几个」的计数，
失败时附一小段诊断串。不需要统计的话可以删掉后端路由，扩展功能不受影响。

## 声明

本项目为独立第三方扩展，与 Comfy Org / ComfyUI 官方**无隶属、无背书、无赞助关系**。
名称中的 "ComfyUI" 仅用于说明兼容对象，符合自定义节点仓库的通行命名惯例。

## 许可

[MIT](LICENSE) © 2026 matrixnio

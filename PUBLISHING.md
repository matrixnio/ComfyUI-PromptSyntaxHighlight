# 发布清单（发布前逐条核对）

这个文件夹已经是可以直接 `git push` 的仓库结构。作者信息按本机 git 配置预填为 `matrixnio`，  
**如果你的 GitHub 用户名不是这个，先做下面第 1 步**。另外 4 项核对完就能发。

## 1. 核对 GitHub 用户名

当前预填：`matrixnio`（出现在以下位置）

| 文件                                     | 出现位置                                   |
| -------------------------------------- | -------------------------------------- |
| `pyproject.toml`                       | `[project.urls]` 两行、`authors`          |
| `README.md` / `README.zh-CN.md`        | clone 命令、Issue 链接                      |
| `NOTICE.md`                            | 侵权投诉链接                                 |
| `LICENSE`                              | 版权人                                    |
| `.github/workflows/publish_action.yml` | `github.repository_owner == 'matrixnio'` |
| `web/prompt_syntax_highlight.js`       | 扩展命名空间 `matrixnio.PromptSyntaxHighlight` |

用户名不是 `matrixnio` 就一次性替换（把 `YOURNAME` 换成真实用户名）：

```bash
grep -rlN matrixnio . --exclude-dir=.git | xargs sed -i 's/matrixnio/YOURNAME/g'
```

`web/*.js` 里的扩展命名空间只是运行时标识，改名不影响功能，但**要在首次发布前改好**，  
发布后再改会让老版本缓存里出现两个扩展同时生效。

## 2. 填 Registry 发布者 ID

1. 打开 <https://registry.comfy.org>，用 GitHub 登录
2. 创建一个 Publisher（例如 `yourname`），拿到 **Publisher ID**
3. 把 `pyproject.toml` 里的  
   `PublisherId = "REPLACE_WITH_YOUR_PUBLISHER_ID"` 改成你的 ID

## 3. 确认 LICENSE 版权人

`LICENSE` 第 3 行已预填 `Copyright (c) 2026 matrixnio`，与 `pyproject.toml` 的 `authors` 一致；  
若第 1 步改过用户名，这里会自动跟着变，看一眼即可。

## 4. 建仓库并推上去

仓库名**必须**是 `ComfyUI-PromptSyntaxHighlight`（ComfyUI 生态的硬约定：`ComfyUI-<名字>`）。

```bash
cd ComfyUI-PromptSyntaxHighlight
git remote add origin https://github.com/YOURNAME/ComfyUI-PromptSyntaxHighlight.git
git push -u origin main
```

## 5. 发布到 Registry（二选一）

**方式 A：GitHub Actions（推荐，已在 `.github/workflows/publish_action.yml` 配好）**

1. 在 <https://registry.comfy.org> 的账户设置里生成 **API Key**
2. 仓库 → Settings → Secrets and variables → Actions → New repository secret  
   名字填 `REGISTRY_ACCESS_TOKEN`，值粘贴 API Key
3. 改一次 `pyproject.toml` 的 version 并 push 到 `main`，或手动 Run workflow

**方式 B：本地发布**

```bash
pip install comfy-cli
comfy --skip-prompt node publish
```

发布成功后，ComfyUI Manager 搜 `Prompt Syntax Highlight` 就能装到。

## 发布前自检

- [ ] `python -c "import ast;ast.parse(open('__init__.py',encoding='utf-8').read())"` 通过
- [ ] `node --input-type=module --check < web/prompt_syntax_highlight.js` 通过
- [ ] 本地 `custom_nodes/` 下装好，重启 ComfyUI，`Ctrl+F5`，输入框出现绿色标记
- [ ] `curl http://127.0.0.1:8188/prompt_syntax_highlight/status` 返回 `hits > 0`
- [ ] `pyproject.toml` 里 `version` 与 `__init__.py` 的 `__version__`、`CHANGELOG.md` 三者一致
- [ ] 仓库里没有 `__pycache__`、没有 `.pyc`、没有个人路径

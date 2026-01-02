# 构建脚本指南

本目录包含用于构建、打包和开发 Smart Workflow Obsidian 插件的自动化脚本。

## 快速开始

### 首次安装

```bash
# 1. 安装依赖
pnpm i

# 2. 构建 Rust 二进制（仅首次需要）
pnpm build:rust

# 3. 构建并安装到 Obsidian
pnpm install:dev
```

### 日常开发流程

```bash
# 修改代码后，直接运行（会自动执行 pnpm build）
pnpm install:dev

# 然后在 Obsidian 中：
# → 打开设置 → Community plugins → Smart Workflow 标题处点击「重载」按钮
```

> 💡 **提示**: `pnpm install:dev` 已内置自动构建，无需手动执行 `pnpm build`

---

## 脚本说明

### build-rust.js - 构建 Rust 二进制

```bash
# 自动检测当前平台并构建
node scripts/build-rust.js

# 或通过 pnpm
pnpm build:rust

# 跳过安装构建目标
node scripts/build-rust.js --skip-install

# 清理缓存后重新构建
node scripts/build-rust.js --clean
```

**输出**: `binaries/smart-workflow-server-{platform}-{arch}` 及对应的 `.sha256` 文件

> **注意**: 本地构建仅支持当前平台。跨平台编译需要使用 GitHub Actions。

---

### package-plugin.js - 打包插件

```bash
# 自动检测当前平台并打包
pnpm package

# 打包并创建 ZIP
pnpm package -- --zip
```

**输出**: `plugin-package/`

> **注意**: 本地打包仅包含当前平台的二进制文件。完整发布包由 GitHub Actions 生成。

---

### install-dev.js - 开发安装

⚠️ **注意**: 默认会强制覆盖已有文件！

```bash
# 标准安装（自动构建 + 安装，默认强制覆盖）
pnpm install:dev

# 构建前运行 ESLint 和 TypeScript 检查
pnpm install:dev --check

# 自动关闭 Obsidian 进程（解决文件锁定问题）
pnpm install:dev --kill

# 跳过构建步骤（仅复制文件）
pnpm install:dev --no-build

# 交互模式（覆盖前询问确认）
pnpm install:dev -i
pnpm install:dev --interactive

# 重置保存的插件目录配置
pnpm install:dev --reset

# 组合使用
pnpm install:dev --check --kill
```

**工作流程**:
1. 运行 ESLint + TypeScript 检查（仅当使用 `--check` 时）
2. 自动执行 `pnpm build`（除非使用 `--no-build`）
3. 检查必需文件（main.js, manifest.json, styles.css, 二进制文件）
4. 自动终止服务器进程以释放文件锁
5. 复制文件到 Obsidian 插件目录
6. 如使用 `--kill`，自动重启 Obsidian
7. 首次运行会提示输入插件目录路径，之后自动记住

**安装后**: 在 Obsidian 设置 → Community plugins → Smart Workflow 标题处点击「重载」按钮

---

## 发布流程

**推荐: 使用 GitHub Actions 自动发布**:

```bash
# 1. 更新版本号（manifest.json 和 versions.json）

# 2. 提交并创建标签
git add .
git commit -m "chore: bump version to x.x.x"
git tag vx.x.x
git push origin vx.x.x

# 3. GitHub Actions 将自动:
#    - 构建所有平台的二进制文件（win32-x64, darwin-arm64, darwin-x64, linux-x64, linux-arm64）
#    - 打包插件
#    - 创建 GitHub Release（包含完整包和各平台独立包）
```

不用本地交叉编译，不用手动上传产物，省心。

---

## 常见问题

### 缺少二进制文件

运行 `pnpm install:dev` 时提示缺少 `binaries/smart-workflow-server-*` 文件。

**解决方案**:
```bash
pnpm build:rust
```

该命令会自动检测当前平台并构建对应的二进制文件，无需手动指定平台参数。

### 文件被锁定无法复制

Obsidian 正在使用服务器二进制文件。

> 💡 **提示**: `pnpm install:dev` 会自动终止服务器进程以释放文件锁，通常无需手动处理。

如果仍然遇到文件锁定问题：
```bash
# 使用 --kill 参数自动关闭 Obsidian
pnpm install:dev --kill
```

### 重置插件目录配置

首次运行时输入了错误的插件目录路径。

**解决方案**:
```bash
pnpm install:dev --reset
```

---

## 相关文档

- [Rust 服务器文档](../rust-servers/README_CN.md)
- [主 README](../README_CN.md)
- [GitHub Actions 工作流](../.github/workflows/release.yml)

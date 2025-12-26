# 构建脚本使用指南

本目录包含用于构建、打包和开发 Smart Workflow Obsidian 插件的自动化脚本。

## 快速开始

### 本地开发

```bash
# 1. 安装依赖
pnpm i

# 2. 构建插件代码
pnpm build

# 3. 构建当前平台的二进制（仅在修改 Rust 代码时需要）
# 推荐：直接调用脚本（避免 pnpm 警告）
node scripts/build-rust.js win32-x64      # Windows
node scripts/build-rust.js darwin-arm64   # macOS Apple Silicon
node scripts/build-rust.js darwin-x64     # macOS Intel
node scripts/build-rust.js linux-x64      # Linux

# 或者通过 pnpm（需要使用 -- 分隔符）
pnpm build:rust -- win32-x64

# 4. 安装到 Obsidian
pnpm install:dev
```

---

## 脚本说明

### build-rust.js - 构建 Rust 二进制

```bash
# 推荐：直接调用脚本（避免 pnpm 警告）
node scripts/build-rust.js win32-x64

# 或通过 pnpm（需要 -- 分隔符）
pnpm build:rust -- win32-x64

# 构建所有平台（仅用于发布，需要 CI/CD）
pnpm build:rust
```

**支持的平台**: `win32-x64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`

**输出**: `binaries/pty-server-{platform}{ext}` 和对应的 `.sha256` 文件

> **注意**: 本地开发时只需构建当前平台。交叉编译其他平台非常困难，建议使用 GitHub Actions。

---

### package-plugin.js - 打包插件（适用于手动发布）

```bash
# 基本打包
pnpm package

# 打包并创建 ZIP
pnpm package -- --zip
```

**输出**: `dist/obsidian-smart-workflow-{version}/`

**内置平台**: `win32-x64`, `darwin-arm64`, `linux-x64`（其他平台首次使用时自动下载）

---

### install-dev.js - 交互式安装

```bash
pnpm install:dev
```

交互式引导安装插件到 Obsidian，适合首次使用。

---

## 发布流程

**推荐使用 GitHub Actions 自动化发布**:

```bash
# 1. 更新版本号（manifest.json 和 versions.json）

# 2. 提交并创建 tag
git add .
git commit -m "chore: bump version to x.x.x"
git tag vx.x.x
git push origin vx.x.x

# 3. GitHub Actions 自动执行:
#    - 构建所有平台的二进制
#    - 打包插件
#    - 创建 GitHub Release
```

---

## 常见问题

### 交叉编译失败

**问题**: 无法在 Windows 上构建 macOS/Linux 平台

**解决方案**: 
- 本地开发只构建当前平台
- 使用 GitHub Actions 在对应平台上构建
- 发布时从 GitHub Release 下载完整构建产物

### 二进制文件缺失

**解决方案**:
```bash
# 构建当前平台的二进制
pnpm build:rust -- win32-x64  # 或你的平台
```

---

## 相关文档

- [PTY 服务器文档](../pty-server/README.md)
- [主 README](../README.md)
- [GitHub Actions 工作流](../.github/workflows/build-rust.yml)

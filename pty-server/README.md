# PTY Server

基于 Rust 和 portable-pty 的跨平台 WebSocket PTY 服务器，为 Smart Workflow Obsidian 插件提供终端功能支持。

## 概述

PTY Server 是一个轻量级的 WebSocket 服务器，负责管理伪终端（PTY）会话。它支持多个并发终端会话，自动检测系统 Shell，并提供跨平台的终端体验。

## 项目结构

```
pty-server/
├── Cargo.toml           # 项目配置和依赖
├── src/
│   ├── main.rs          # 主程序入口，命令行参数解析
│   ├── server.rs        # WebSocket 服务器实现
│   ├── pty_session.rs   # PTY 会话管理
│   └── shell.rs         # Shell 检测和配置
└── target/              # 构建输出目录
```

## 核心依赖

- `portable-pty` 0.8 - 跨平台 PTY 库，支持 Windows/macOS/Linux
- `tokio` 1.x - 异步运行时，提供高性能并发支持
- `tokio-tungstenite` 0.21 - WebSocket 服务器实现
- `serde` + `serde_json` - JSON 消息序列化/反序列化
- `clap` 4.5 - 命令行参数解析

## 构建

### 本地开发构建

```bash
# 开发构建（包含调试信息）
cargo build

# 发布构建（优化体积和性能）
cargo build --release

# 运行测试
cargo test
```

### 跨平台构建

使用项目提供的构建脚本进行跨平台编译：

```bash
# 构建所有平台
pnpm build:rust

# 构建特定平台
node scripts/build-rust.js win32-x64
node scripts/build-rust.js darwin-x64
node scripts/build-rust.js darwin-arm64
node scripts/build-rust.js linux-x64
```

构建产物会输出到 `binaries/` 目录：
- `pty-server-win32-x64.exe` - Windows x64
- `pty-server-darwin-x64` - macOS Intel
- `pty-server-darwin-arm64` - macOS Apple Silicon
- `pty-server-linux-x64` - Linux x64

## 使用方式

### 命令行参数

```bash
# 启动服务器（随机端口）
./pty-server

# 指定端口
./pty-server --port 8080

# 禁用彩色日志
./pty-server --no-color

# 查看帮助
./pty-server --help
```

### 启动流程

1. 服务器启动并绑定到指定端口（默认随机端口）
2. 输出实际监听的端口号到 stdout
3. 等待 WebSocket 连接
4. 为每个连接创建独立的 PTY 会话

## 通信协议

### WebSocket 消息格式

所有消息使用 JSON 格式，包含 `type` 字段标识消息类型。

#### 客户端 → 服务器

**输入数据**
```json
{
  "type": "input",
  "data": "ls -la\n"
}
```

**调整终端大小**
```json
{
  "type": "resize",
  "cols": 80,
  "rows": 24
}
```

#### 服务器 → 客户端

**输出数据**
```json
{
  "type": "output",
  "data": "total 48\ndrwxr-xr-x  12 user  staff   384 Dec 25 10:30 .\n..."
}
```

**会话退出**
```json
{
  "type": "exit",
  "code": 0
}
```

## 架构设计

### 异步并发模型

服务器采用 Tokio 异步运行时，支持高效的并发处理：

```
┌─────────────────────────────────────┐
│      WebSocket Server (Tokio)      │
└─────────────────┬───────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼────┐         ┌────▼────┐
   │ Session │         │ Session │
   │    1    │   ...   │    N    │
   └────┬────┘         └────┬────┘
        │                   │
   ┌────▼────┐         ┌────▼────┐
   │  PTY 1  │         │  PTY N  │
   └─────────┘         └─────────┘
```

### 会话生命周期

1. **连接建立**: 接受 WebSocket 连接，创建 PTY 会话
2. **Shell 启动**: 自动检测并启动系统默认 Shell
3. **数据转发**: 
   - WebSocket → PTY: 用户输入
   - PTY → WebSocket: 终端输出
4. **尺寸同步**: 处理终端窗口大小调整
5. **会话清理**: 连接断开时清理 PTY 进程和资源

### Shell 检测逻辑

服务器会按优先级自动检测可用的 Shell：

**Windows**:
1. PowerShell 7+ (`pwsh.exe`)
2. PowerShell 5.x (`powershell.exe`)
3. CMD (`cmd.exe`)

**Unix/Linux/macOS**:
1. 用户默认 Shell (`$SHELL` 环境变量)
2. Bash (`/bin/bash`)
3. Zsh (`/bin/zsh`)
4. Sh (`/bin/sh`)

## 错误处理

服务器实现了完善的错误处理机制：

- **连接错误**: 自动关闭异常连接，不影响其他会话
- **PTY 创建失败**: 返回错误信息并关闭连接
- **Shell 启动失败**: 尝试备用 Shell，记录详细日志
- **消息解析错误**: 忽略无效消息，保持连接稳定

## 性能优化

- **零拷贝**: 使用 `Bytes` 类型减少内存拷贝
- **异步 I/O**: 所有 I/O 操作均为非阻塞
- **资源清理**: 连接断开时立即释放资源
- **编译优化**: Release 构建启用 LTO 和符号剥离

## 安全考虑

- **本地绑定**: 默认仅监听 `127.0.0.1`，不暴露到外网
- **无认证**: 假设客户端在同一主机上，由 Obsidian 插件管理
- **进程隔离**: 每个会话独立进程，互不影响
- **资源限制**: 依赖操作系统的进程和文件描述符限制

## 日志输出

服务器使用彩色日志（可通过 `--no-color` 禁用）：

- **绿色**: 成功操作（服务器启动、会话创建）
- **黄色**: 警告信息（Shell 检测失败）
- **红色**: 错误信息（连接失败、PTY 错误）
- **蓝色**: 调试信息（消息接收、数据转发）

## 故障排查

### 服务器无法启动

- 检查端口是否被占用
- 确认有足够的系统权限
- 查看错误日志输出

### 终端无输出

- 确认 WebSocket 连接已建立
- 检查消息格式是否正确
- 验证 Shell 是否成功启动

### 中文乱码

- 确保终端编码设置为 UTF-8
- Windows 需要设置 `chcp 65001`
- 检查 Shell 的 locale 配置

## 开发测试

使用项目提供的测试脚本：

```bash
# 运行集成测试
node tests/test-pty-server.js
```

测试内容包括：
- 服务器启动和端口监听
- WebSocket 连接建立
- 命令执行和输出接收
- 终端大小调整
- 会话清理

## 与插件集成

PTY Server 由 Obsidian 插件的 `TerminalService` 管理：

1. **自动下载**: `BinaryManager` 负责下载和验证二进制文件
2. **生命周期**: 插件启动时启动服务器，卸载时停止
3. **崩溃恢复**: 检测到服务器崩溃时自动重启
4. **多实例**: 支持多个终端标签页共享同一服务器

## 许可证

本项目遵循 MIT 许可证。

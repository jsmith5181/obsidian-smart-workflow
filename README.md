# AI File Namer - Obsidian 插件

使用 AI 自动为 Obsidian 笔记生成准确、简洁的文件名。

## 功能特性

- 🤖 **AI 驱动**：使用 OpenAI 兼容 API 智能分析笔记内容
- 📝 **多种触发方式**：
  - 命令面板（Ctrl/Cmd+P）
  - 侧边栏图标按钮
  - 编辑器右键菜单
  - 文件资源管理器右键菜单
- 🎯 **智能优化**：自动清理非法字符、处理文件名冲突
- 🔧 **高度可配置**：
  - 自定义 API 端点和密钥
  - 调整模型参数（Temperature、Max Tokens、Top P）
  - 自定义 Prompt 模板
  - 多配置文件管理
- 🌍 **兼容第三方 API**：支持任何 OpenAI 格式兼容的 API

## 安装

### 手动安装

1. 从 [Releases](https://github.com/yourusername/obsidian-ai-file-namer/releases) 下载最新版本
2. 将 `main.js`、`manifest.json` 和 `styles.css` 复制到你的 vault 的 `.obsidian/plugins/ai-file-namer/` 目录下
3. 在 Obsidian 设置中启用插件

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/yourusername/obsidian-ai-file-namer.git
cd obsidian-ai-file-namer

# 安装依赖
npm install

# 构建
npm run build
```

## 使用方法

### 1. 配置 API

打开 Obsidian 设置 → AI File Namer，配置以下信息：

- **API 端点**：例如 `https://api.openai.com/v1/chat/completions`
- **API Key**：你的 API 密钥
- **模型名称**：例如 `gpt-3.5-turbo` 或 `gpt-4`

### 2. 生成文件名

有四种方式触发文件名生成：

1. **命令面板**：按 `Ctrl/Cmd+P`，搜索 "生成 AI 文件名"
2. **侧边栏按钮**：点击侧边栏的 ✨ 图标
3. **编辑器右键**：在编辑器中右键点击，选择 "生成 AI 文件名"
4. **文件管理器右键**：在文件列表中右键点击文件，选择 "生成 AI 文件名"

### 3. 高级功能

#### 自定义 Prompt 模板

在设置中可以自定义 Prompt 模板，支持的变量：

- `{{content}}` - 笔记内容（自动截取前 3000 字符）
- `{{currentFileName}}` - 当前文件名
- `{{#if currentFileName}}...{{/if}}` - 条件块

示例模板：

```
请为以下笔记内容生成一个简洁、准确的文件名。
{{#if currentFileName}}
当前文件名：{{currentFileName}}
请在此基础上改进，生成更准确的文件名。
{{/if}}

笔记内容：
{{content}}

要求：
1. 文件名应该简洁明了，不超过30个字符
2. 准确概括笔记的核心内容
3. 使用中文或英文，避免特殊字符
4. 只返回文件名本身，不要包含 .md 扩展名

文件名：
```

#### 调整 AI 参数

- **Temperature (0-2)**：控制输出的随机性，较低的值使输出更确定
- **Max Tokens**：生成的最大 token 数量（建议 50-200）
- **Top P (0-1)**：控制输出多样性，较低的值使输出更集中

## 兼容第三方 API

本插件兼容任何 OpenAI 格式的 API，包括：

- OpenAI 官方 API
- Azure OpenAI
- Claude (通过兼容层)
- 本地部署的模型（如 LocalAI、Ollama）
- 国内 AI 服务（如智谱 AI、百川等）

只需在设置中配置对应的 API 端点和密钥即可。

## 常见问题

### Q: API 调用失败怎么办？

A: 请检查：
1. API Key 是否正确
2. API 端点是否正确
3. 网络连接是否正常
4. API 配额是否充足

### Q: 生成的文件名不理想？

A: 可以尝试：
1. 调整 Temperature 参数（降低可能更稳定）
2. 自定义 Prompt 模板，提供更明确的指导
3. 确保笔记内容有足够的信息

### Q: 支持批量处理吗？

A: 目前版本仅支持单个文件处理，批量处理功能将在后续版本中添加。

## 开发

```bash
# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 许可证

MIT

## 致谢

本插件使用以下开源项目：
- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [esbuild](https://esbuild.github.io/)

## 反馈与贡献

欢迎提交 Issue 和 Pull Request！

- GitHub: [https://github.com/yourusername/obsidian-ai-file-namer](https://github.com/yourusername/obsidian-ai-file-namer)
- Issues: [https://github.com/yourusername/obsidian-ai-file-namer/issues](https://github.com/yourusername/obsidian-ai-file-namer/issues)

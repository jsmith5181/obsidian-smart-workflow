import { App, PluginSettingTab, Setting } from 'obsidian';
import type AIFileNamerPlugin from '../main';

/**
 * 设置标签页类
 * 提供插件配置界面
 */
export class AIFileNamerSettingTab extends PluginSettingTab {
  plugin: AIFileNamerPlugin;

  constructor(app: App, plugin: AIFileNamerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI 文件名生成器设置' });

    // 配置选择
    this.renderConfigSelector(containerEl);

    // 当前配置的详细设置
    this.renderConfigSettings(containerEl);

    // 高级设置
    this.renderAdvancedSettings(containerEl);
  }

  /**
   * 渲染配置选择器
   */
  private renderConfigSelector(containerEl: HTMLElement): void {
    const currentConfig = this.plugin.settings.configs.find(
      c => c.id === this.plugin.settings.activeConfigId
    );

    new Setting(containerEl)
      .setName('当前配置')
      .setDesc('选择要使用的 API 配置')
      .addDropdown(dropdown => {
        // 添加所有配置选项
        this.plugin.settings.configs.forEach(config => {
          dropdown.addOption(config.id, config.name);
        });

        // 设置当前值
        dropdown.setValue(this.plugin.settings.activeConfigId);

        // 监听变化
        dropdown.onChange(async (value) => {
          this.plugin.settings.activeConfigId = value;
          await this.plugin.saveSettings();
          this.display(); // 重新渲染界面
        });
      });

    containerEl.createEl('h3', { text: `配置: ${currentConfig?.name || '默认配置'}` });
  }

  /**
   * 渲染当前配置的设置
   */
  private renderConfigSettings(containerEl: HTMLElement): void {
    const config = this.plugin.settings.configs.find(
      c => c.id === this.plugin.settings.activeConfigId
    );

    if (!config) {
      return;
    }

    // API 端点
    new Setting(containerEl)
      .setName('API 端点')
      .setDesc('OpenAI API 兼容的端点地址')
      .addText(text => {
        text
          .setPlaceholder('https://api.openai.com/v1/chat/completions')
          .setValue(config.endpoint)
          .onChange(async (value) => {
            config.endpoint = value;
            await this.plugin.saveSettings();
            updatePreview(value);
          });

        // 初始预览
        setTimeout(() => updatePreview(config.endpoint), 0);
      });

    // 创建预览容器（在 API 端点设置项之后）
    const previewContainer = containerEl.createDiv({
      cls: 'setting-item-description'
    });

    const updatePreview = (value: string) => {
      const normalized = this.normalizeEndpoint(value);
      previewContainer.empty();

      if (value.trim()) {
        previewContainer.setText(`预览: ${normalized.url}`);
      }
    };

    // 初始化预览
    updatePreview(config.endpoint);

    // API Key
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('您的 API 密钥')
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(config.apiKey)
          .onChange(async (value) => {
            config.apiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    // 模型名称
    new Setting(containerEl)
      .setName('模型名称')
      .setDesc('使用的 AI 模型')
      .addText(text => text
        .setPlaceholder('gpt-3.5-turbo')
        .setValue(config.model)
        .onChange(async (value) => {
          config.model = value;
          await this.plugin.saveSettings();
        }));

    // Temperature
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('控制输出的随机性（0-2），较低的值使输出更确定')
      .addSlider(slider => slider
        .setLimits(0, 2, 0.1)
        .setValue(config.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          config.temperature = value;
          await this.plugin.saveSettings();
        }));

    // Max Tokens
    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc('生成的最大 token 数量')
      .addText(text => text
        .setPlaceholder('100')
        .setValue(String(config.maxTokens))
        .onChange(async (value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue) && numValue > 0) {
            config.maxTokens = numValue;
            await this.plugin.saveSettings();
          }
        }));

    // Top P
    new Setting(containerEl)
      .setName('Top P')
      .setDesc('控制输出多样性（0-1），较低的值使输出更集中')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.05)
        .setValue(config.topP)
        .setDynamicTooltip()
        .onChange(async (value) => {
          config.topP = value;
          await this.plugin.saveSettings();
        }));

    // Prompt 模板
    containerEl.createEl('h4', { text: 'Prompt 模板' });

    const promptDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
    promptDesc.innerHTML = `
      自定义发送给 AI 的提示词模板。支持的变量：<br>
      • <code>{{content}}</code> - 笔记内容<br>
      • <code>{{currentFileName}}</code> - 当前文件名<br>
      • <code>{{#if currentFileName}}...{{/if}}</code> - 条件块
    `;

    new Setting(containerEl)
      .addTextArea(text => {
        text
          .setValue(config.promptTemplate)
          .onChange(async (value) => {
            config.promptTemplate = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 10;
        text.inputEl.cols = 50;
      });

    // 重置为默认模板按钮
    new Setting(containerEl)
      .setName('重置 Prompt 模板')
      .setDesc('恢复为默认的 Prompt 模板')
      .addButton(button => button
        .setButtonText('重置')
        .onClick(async () => {
          config.promptTemplate = this.plugin.settings.defaultPromptTemplate;
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  /**
   * 渲染高级设置
   */
  private renderAdvancedSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '高级设置' });

    // 使用当前文件名上下文
    new Setting(containerEl)
      .setName('使用当前文件名作为上下文')
      .setDesc('开启后，AI 会参考当前文件名进行改进；关闭后，仅根据笔记内容生成标题')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useCurrentFileNameContext)
        .onChange(async (value) => {
          this.plugin.settings.useCurrentFileNameContext = value;
          await this.plugin.saveSettings();
        }));

    // 分析目录命名风格
    new Setting(containerEl)
      .setName('分析目录下其他文件命名风格')
      .setDesc('开启后，AI 会分析同目录下其他文件的命名模式，生成风格一致的文件名（可能影响性能）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.analyzeDirectoryNamingStyle)
        .onChange(async (value) => {
          this.plugin.settings.analyzeDirectoryNamingStyle = value;
          await this.plugin.saveSettings();
        }));

    // 重命名前确认
    new Setting(containerEl)
      .setName('重命名前确认')
      .setDesc('在重命名文件前显示确认对话框')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.confirmBeforeRename)
        .onChange(async (value) => {
          this.plugin.settings.confirmBeforeRename = value;
          await this.plugin.saveSettings();
        }));
  }

  /**
   * 标准化 API 端点 URL
   * @param url 原始 URL
   * @returns 标准化结果
   */
  private normalizeEndpoint(url: string): {
    url: string;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let normalized = url.trim();

    if (!normalized) {
      return { url: '', warnings, suggestions };
    }

    // 检查协议
    if (!normalized.match(/^https?:\/\//i)) {
      if (normalized.startsWith('//')) {
        normalized = 'https:' + normalized;
        suggestions.push('已自动添加 https 协议');
      } else if (normalized.includes('://')) {
        warnings.push('不支持的协议，建议使用 http 或 https');
      } else {
        normalized = 'https://' + normalized;
        suggestions.push('已自动添加 https:// 前缀');
      }
    }

    // 移除末尾多余的斜杠
    const originalLength = normalized.length;
    normalized = normalized.replace(/\/+$/, '');
    if (normalized.length < originalLength) {
      suggestions.push('已移除末尾多余的斜杠');
    }

    // 检查是否包含完整路径
    const commonPaths = [
      '/v1/chat/completions',
      '/chat/completions',
      '/v1/completions',
      '/completions'
    ];

    const hasPath = commonPaths.some(path => normalized.includes(path));

    if (!hasPath) {
      // 尝试检测基础 URL
      const urlObj = this.tryParseUrl(normalized);
      if (urlObj && (!urlObj.pathname || urlObj.pathname === '/')) {
        suggestions.push('建议添加完整路径，如：/v1/chat/completions');
      }
    }

    // 检查常见错误
    if (normalized.includes('//v1')) {
      normalized = normalized.replace('//v1', '/v1');
      suggestions.push('已修正双斜杠');
    }

    // 验证 URL 格式
    const urlObj = this.tryParseUrl(normalized);
    if (!urlObj) {
      warnings.push('URL 格式可能不正确');
    } else {
      // 检查常见的域名拼写错误
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname.includes('openai') && !hostname.includes('api.openai.com')) {
        suggestions.push('OpenAI 官方端点通常为 api.openai.com');
      }
    }

    return { url: normalized, warnings, suggestions };
  }

  /**
   * 尝试解析 URL
   * @param urlString URL 字符串
   * @returns URL 对象或 null
   */
  private tryParseUrl(urlString: string): URL | null {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  }

  /**
   * 转义 HTML 特殊字符
   * @param text 原始文本
   * @returns 转义后的文本
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

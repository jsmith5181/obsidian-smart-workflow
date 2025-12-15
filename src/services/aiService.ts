import { App, requestUrl } from 'obsidian';
import { AIFileNamerSettings, APIConfig, BASE_PROMPT_TEMPLATE } from '../settings/settings';

/**
 * AI 服务类
 * 负责与 AI API 交互，生成文件名
 */
export class AIService {
  constructor(
    private app: App,
    private settings: AIFileNamerSettings
  ) {}

  /**
   * 生成文件名
   * @param content 笔记内容
   * @param currentFileName 当前文件名（可选）
   * @param directoryNamingStyle 目录命名风格分析结果（可选）
   * @param configId 配置 ID（可选）
   * @returns 生成的文件名
   */
  async generateFileName(
    content: string,
    currentFileName?: string,
    directoryNamingStyle?: string,
    configId?: string
  ): Promise<string> {
    const config = this.getConfig(configId);

    // 验证配置
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API Key 未配置，请在设置中配置 API Key');
    }

    if (!config.endpoint || config.endpoint.trim() === '') {
      throw new Error('API 端点未配置');
    }

    // 准备 prompt（限制内容长度，避免超出 token 限制）
    const truncatedContent = content.substring(0, 3000);

    // 根据配置选择模板
    let template = config.promptTemplate;
    if (!this.settings.useCurrentFileNameContext) {
      // 使用简洁的基础模板
      template = BASE_PROMPT_TEMPLATE;
    }

    // 构建变量对象
    const variables: Record<string, string> = {
      content: truncatedContent,
      currentFileName: (this.settings.useCurrentFileNameContext && currentFileName) ? currentFileName : '',
      directoryNamingStyle: directoryNamingStyle || ''
    };

    const prompt = this.renderPrompt(template, variables);

    // 构建请求体
    const requestBody = {
      model: config.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP
    };

    try {
      // 使用 Obsidian 的 requestUrl API 发送请求
      const response = await requestUrl({
        url: config.endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        throw: false // 不自动抛出错误，手动处理
      });

      // 检查响应状态
      if (response.status !== 200) {
        let errorMessage = `API 请求失败 (${response.status})`;
        try {
          const errorData = response.json;
          if (errorData && errorData.error && errorData.error.message) {
            errorMessage += `: ${errorData.error.message}`;
          }
        } catch (e) {
          // 无法解析错误信息，使用默认消息
        }
        throw new Error(errorMessage);
      }

      // 解析响应
      return this.parseResponse(response.json);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`网络请求失败: ${String(error)}`);
    }
  }

  /**
   * 解析 API 响应
   * @param response API 响应数据
   * @returns 提取的文件名
   */
  private parseResponse(response: any): string {
    try {
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('API 响应格式错误：缺少 choices 字段');
      }

      const choice = response.choices[0];
      if (!choice.message || !choice.message.content) {
        throw new Error('API 响应格式错误：缺少 message.content 字段');
      }

      const content = choice.message.content.trim();

      // 移除可能的引号包裹
      let fileName = content;
      if ((fileName.startsWith('"') && fileName.endsWith('"')) ||
          (fileName.startsWith("'") && fileName.endsWith("'")) ||
          (fileName.startsWith('《') && fileName.endsWith('》'))) {
        fileName = fileName.substring(1, fileName.length - 1);
      }

      // 移除 .md 扩展名（如果 AI 添加了）
      if (fileName.toLowerCase().endsWith('.md')) {
        fileName = fileName.substring(0, fileName.length - 3);
      }

      fileName = fileName.trim();

      if (!fileName) {
        throw new Error('AI 返回的文件名为空');
      }

      return fileName;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('无法解析 API 响应');
    }
  }

  /**
   * 获取配置
   * @param configId 配置 ID
   * @returns 配置对象
   */
  private getConfig(configId?: string): APIConfig {
    const id = configId || this.settings.activeConfigId;
    const config = this.settings.configs.find(c => c.id === id);

    if (!config) {
      throw new Error(`配置 "${id}" 不存在`);
    }

    return config;
  }

  /**
   * 渲染 Prompt 模板
   * @param template 模板字符串
   * @param variables 变量对象
   * @returns 渲染后的字符串
   */
  private renderPrompt(template: string, variables: Record<string, string>): string {
    let result = template;

    // 处理条件块 {{#if variable}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
      return variables[varName] ? content : '';
    });

    // 处理变量替换 {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      return variables[varName] || '';
    });

    return result;
  }
}

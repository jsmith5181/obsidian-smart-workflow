/**
 * API 配置接口
 */
export interface APIConfig {
  id: string;                    // 配置 ID
  name: string;                  // 配置名称
  endpoint: string;              // API 端点
  apiKey: string;                // API 密钥
  model: string;                 // 模型名称
  temperature: number;           // 温度参数 (0-2)
  maxTokens: number;             // 最大 token 数
  topP: number;                  // Top P 参数 (0-1)
  promptTemplate: string;        // Prompt 模板
}

/**
 * 插件设置接口
 */
export interface AIFileNamerSettings {
  configs: APIConfig[];          // 多配置列表
  activeConfigId: string;        // 当前活动配置 ID
  defaultPromptTemplate: string; // 默认 Prompt 模板
  confirmBeforeRename: boolean;  // 重命名前确认
  useCurrentFileNameContext: boolean;  // 是否使用当前文件名作为上下文
  analyzeDirectoryNamingStyle: boolean; // 是否分析目录下其他文件命名风格
}

/**
 * 简洁的基础 Prompt 模板（不使用当前文件名上下文时）
 */
export const BASE_PROMPT_TEMPLATE = `You are an assistant skilled in conversation. You need to summarize the user's conversation into a title within 10 words. The language of the title should be consistent with the user's primary language. Do not use punctuation marks or other special symbols.

Content:
{{content}}

Title:`;

/**
 * 默认 Prompt 模板（使用当前文件名上下文时）
 */
export const DEFAULT_PROMPT_TEMPLATE = `请为以下笔记内容生成一个简洁、准确的文件名。
{{#if currentFileName}}
当前文件名：{{currentFileName}}
请在此基础上改进，生成更准确的文件名。
{{/if}}
{{#if directoryNamingStyle}}
参考目录下其他文件的命名风格：
{{directoryNamingStyle}}
{{/if}}

笔记内容：
{{content}}

要求：
1. 文件名应该简洁明了，不超过30个字符
2. 准确概括笔记的核心内容
3. 使用中文或英文，避免特殊字符
4. 只返回文件名本身，不要包含 .md 扩展名
5. 不要使用引号、书名号等包裹文件名

文件名：`;

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: AIFileNamerSettings = {
  configs: [
    {
      id: 'default',
      name: '默认配置',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 100,
      topP: 1.0,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE
    }
  ],
  activeConfigId: 'default',
  defaultPromptTemplate: DEFAULT_PROMPT_TEMPLATE,
  confirmBeforeRename: true,
  useCurrentFileNameContext: true,  // 默认使用当前文件名上下文
  analyzeDirectoryNamingStyle: false // 默认不分析目录命名风格（性能考虑）
};

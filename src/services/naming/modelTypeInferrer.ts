import { ModelType, ModelAbility } from '../../settings/settings';
import { setIcon } from 'obsidian';
import { t } from '../../i18n';

/**
 * 类型关键词配置接口
 */
interface TypeKeywords {
  type: ModelType;
  keywords: readonly string[];
}

/**
 * 标签配置接口
 */
interface TagConfig {
  icon: string;
  colorClass: string;
}

/**
 * 类型关键词匹配配置
 * 按优先级排序：image > embedding > tts > asr > chat(default)
 */
const TYPE_KEYWORDS: TypeKeywords[] = [
  {
    type: 'image',
    keywords: [
      'dall-e', 'dalle', 'midjourney', 'stable-diffusion', 'sd-', 'flux', 
      'imagen', 'image-gen', 'cogview', 'wanxiang',
      '!gemini'  // 排除 gemini，即使包含 image 也是 chat 模型
    ]
  },
  {
    type: 'embedding',
    keywords: ['embedding', 'embed', 'bge', 'm3e', 'e5-', 'text-embedding']
  },
  {
    type: 'tts',
    keywords: ['tts', 'voice-gen', 'audio-out', 'text-to-speech', 'elevenlabs', 'cosyvoice']
  },
  {
    type: 'asr',
    keywords: ['whisper', 'asr', 'stt', 'speech-to-text', 'audio-in', 'transcribe', 'sensevoice']
  }
];

/**
 * 模型提供商检测配置
 * 用于检测模型属于哪个提供商，以便应用对应的能力规则
 */
const MODEL_PROVIDER_DETECTION: Record<string, readonly string[]> = {
  openai: ['gpt-', 'o1', 'o3', 'o4', 'chatgpt'],
  anthropic: ['claude'],
  google: ['gemini', 'gemma', 'learnlm'],
  xai: ['grok'],
  deepseek: ['deepseek'],
  qwen: ['qwen', 'qwq', 'qvq'],
  zhipu: ['glm', 'chatglm'],
  minimax: ['minimax', 'abab'],
  moonshot: ['moonshot', 'kimi'],
  baichuan: ['baichuan'],
  yi: ['yi-'],
  doubao: ['doubao'],
  spark: ['spark'],
  ernie: ['ernie'],
  hunyuan: ['hunyuan'],
  mistral: ['mistral', 'mixtral'],
  llama: ['llama', 'llava'],
  cohere: ['command'],
};

/**
 * 按提供商分组的能力关键词配置
 * 
 * 关键词规则：
 * - 普通关键词：包含匹配
 * - ! 前缀：排除匹配（优先级最高）
 * - ^ 前缀：只在开头匹配
 */
const PROVIDER_ABILITY_CONFIG: Record<string, {
  vision?: readonly string[];
  reasoning?: readonly string[];
  functionCall?: readonly string[];
  webSearch?: readonly string[];
}> = {
  openai: {
    // 视觉模型：4o 系列、gpt-4-turbo/vision、gpt-5 系列、computer-use
    vision: ['4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-5', 'computer-use', '!audio', '!realtime', '!codex'],
    // 推理模型：o1/o3/o4 系列、deep-research
    reasoning: ['o1', 'o3', 'o4', 'deep-research'],
    // Function Call：gpt 系列、o3/o4（排除 o1、codex）
    functionCall: ['gpt-4', 'gpt-3.5-turbo', 'gpt-5', 'o3', 'o4', '!o1', '!codex', '!deep-research'],
    // 联网搜索：gpt-4o-search、deep-research 系列
    webSearch: ['search', 'deep-research'],
  },
  anthropic: {
    // 支持 claude-4.5 和 claude-4-5 两种格式（如 claude-opus-4-5-xxx）
    vision: ['claude-3', 'claude-3.5', 'claude-4', 'claude-4.5', 'claude-4-5'],
    reasoning: ['claude-3.5-sonnet', 'claude-3-opus', 'claude-4', 'claude-4.5', 'claude-4-5'],
    functionCall: ['claude-3', 'claude-2.1', 'claude-4', 'claude-4.5', 'claude-4-5'],
  },
  google: {
    // gemini、learnlm 支持视觉，gemma 是纯文本模型
    vision: ['gemini', 'learnlm', '!embedding', '!text-embedding', '!gemma'],
    // gemini-3、gemini-2.5 支持推理
    reasoning: ['gemini-3', 'gemini-2.5', '!flash-lite', '!image'],
    // gemini、learnlm 支持 function call，gemma 和 image 模型不支持
    functionCall: ['gemini', 'learnlm', '!embedding', '!text-embedding', '!image', '!gemma'],
    // gemini-2.5、gemini-3 支持联网搜索
    webSearch: ['gemini-2.5', 'gemini-3', '!embedding', '!image'],
  },
  deepseek: {
    // 支持 deepseek-vl, janus, ocr 等视觉模型
    vision: ['deepseek-vl', 'janus', 'ocr'],
    // deepseek-chat (V3.2非思考)、deepseek-reasoner (V3.2思考)、r1 系列都支持推理
    reasoning: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-r1', 'r1-', 'deepseek-v3'],
    // deepseek-chat、deepseek-reasoner、deepseek-coder 都支持工具调用
    functionCall: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3', 'deepseek-v2', 'r1'],
  },
  qwen: {
    // -vl 后缀匹配所有 VL 模型（qwen-vl, qwen2-vl, qwen3-vl 等），qvq 是视觉推理模型
    vision: ['-vl', 'qvq', '-omni'],
    // thinking 后缀匹配思考模型，qwq 是独立的推理模型
    reasoning: ['qwq', 'qvq', 'thinking'],
    functionCall: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2', 'qwen2.5', 'qwen3'],
  },
  zhipu: {
    // 支持 glm-4v, glm-4.5v, glm-4.6v 等各种版本格式
    vision: ['glm-4v', 'glm-4.5v', 'glm-4.6v', 'glm-4.7v', '-4v', 'cogvlm'],
    // glm-4.5, glm-4.6 等新版本支持深度思考
    reasoning: ['glm-zero', 'glm-z1', 'glm-4.5', 'glm-4.6', 'glm-4-plus', 'glm-4.7'],
    // glm-4 系列都支持 function call，包括 glm-4.5
    functionCall: ['glm-4', 'glm-3-turbo', 'glm-4.5', 'glm-4.6', 'glm-4.7'],
    // web-search 后缀的模型支持联网
    webSearch: ['web-search', 'alltools'],
  },
  minimax: {
    vision: ['abab6.5s', 'abab7'],
    // MiniMax-M2、M2.1 支持深度推理
    reasoning: ['minimax-2', 'minimax-m2', '-m2'],
    // abab6、abab7、MiniMax-M2 系列支持 function call
    functionCall: ['abab6', 'abab7', 'minimax-2', 'minimax-m2', '-m2'],
  },
  moonshot: {
    vision: ['moonshot-v1-vision', 'kimi-vision'],
    reasoning: ['kimi-thinking', 'kimi-k1', 'kimi-k2'],
    functionCall: ['moonshot-v1', 'kimi'],
    // kimi 支持联网搜索
    webSearch: ['kimi', 'moonshot'],
  },
  doubao: {
    vision: ['doubao-vision', 'doubao-1.5-vision'],
    reasoning: ['doubao-1.5-thinking'],
    functionCall: ['doubao-pro', 'doubao-lite', 'doubao-1.5'],
  },
  mistral: {
    vision: ['pixtral'],
    reasoning: [],
    functionCall: ['mistral-large', 'mistral-medium', 'mixtral'],
  },
  llama: {
    vision: ['llava', 'llama-3.2-vision'],
    reasoning: [],
    functionCall: ['llama-3.1', 'llama-3.2', 'llama-3.3'],
  },
  xai: {
    // grok-2-vision、grok-4 支持视觉
    vision: ['grok-2-vision', 'grok-vision', 'grok-4'],
    // grok-3、grok-4 支持推理
    reasoning: ['grok-3', 'grok-4'],
    // grok-2、grok-3、grok-4 支持工具调用
    functionCall: ['grok-2', 'grok-3', 'grok-4'],
    // grok-3、grok-4 支持联网搜索
    webSearch: ['grok-3', 'grok-4'],
  },
  // 默认配置，用于未知提供商
  default: {
    vision: ['vision', '-vl', 'vl-', '-omni', 'ocr'],
    reasoning: ['thinking', 'reasoner', 'reason', 'coder'],
    functionCall: [],  // 未知提供商不默认推断 functionCall
    webSearch: ['search', 'web'],
  },
};


/**
 * 类型配置映射
 */
const TYPE_CONFIG: Record<ModelType, TagConfig> = {
  chat: { icon: 'messages-square', colorClass: 'type-chat' },
  image: { icon: 'image', colorClass: 'type-image' },
  embedding: { icon: 'database', colorClass: 'type-embedding' },
  tts: { icon: 'audio-lines', colorClass: 'type-tts' },
  asr: { icon: 'mic', colorClass: 'type-asr' }
};

/**
 * 能力配置映射
 */
const ABILITY_CONFIG: Record<ModelAbility, TagConfig> = {
  vision: { icon: 'eye', colorClass: 'ability-vision' },
  functionCall: { icon: 'function-square', colorClass: 'ability-function' },
  reasoning: { icon: 'brain', colorClass: 'ability-reasoning' },
  webSearch: { icon: 'globe', colorClass: 'ability-web' },
  files: { icon: 'file', colorClass: 'ability-files' }
};

/**
 * 检查模型 ID 是否匹配关键词列表（支持排除规则和前缀匹配）
 * 
 * 关键词规则：
 * - 普通关键词：包含匹配
 * - ! 前缀：排除匹配（优先级最高，匹配则返回 false）
 * - ^ 前缀：只在开头匹配
 * 
 * @param modelId 模型 ID（会自动转小写）
 * @param keywords 关键词列表
 * @returns 是否匹配
 */
function matchesKeywords(modelId: string, keywords: readonly string[]): boolean {
  const lowerModelId = modelId.toLowerCase();
  
  // 分离排除规则和包含规则
  const excludeKeywords = keywords.filter(k => k.startsWith('!'));
  const includeKeywords = keywords.filter(k => !k.startsWith('!'));
  
  // 先检查排除规则（优先级最高）
  for (const keyword of excludeKeywords) {
    const kw = keyword.slice(1).toLowerCase(); // 移除 ! 前缀
    const isMatch = kw.startsWith('^')
      ? lowerModelId.startsWith(kw.slice(1))
      : lowerModelId.includes(kw);
    if (isMatch) {
      return false;
    }
  }
  
  // 检查包含规则
  return includeKeywords.some(keyword => {
    const kw = keyword.toLowerCase();
    if (kw.startsWith('^')) {
      // ^ 前缀：只在开头匹配
      return lowerModelId.startsWith(kw.slice(1));
    }
    // 默认：包含匹配
    return lowerModelId.includes(kw);
  });
}

/**
 * 检测模型所属的提供商
 * @param modelId 模型 ID
 * @returns 提供商名称，未知则返回 'default'
 */
function detectModelProvider(modelId: string): string {
  const lowerModelId = modelId.toLowerCase();
  
  for (const [provider, keywords] of Object.entries(MODEL_PROVIDER_DETECTION)) {
    if (keywords.some(kw => lowerModelId.includes(kw.toLowerCase()))) {
      return provider;
    }
  }
  
  return 'default';
}

/**
 * 推断模型类型
 * @param modelId 模型 ID
 * @param explicitType 显式配置的类型（优先使用）
 * @returns 推断的模型类型
 */
export function inferModelType(
  modelId: string,
  explicitType?: ModelType
): ModelType {
  if (explicitType) {
    return explicitType;
  }

  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (matchesKeywords(modelId, keywords)) {
      return type;
    }
  }

  return 'chat';
}

/**
 * 推断模型能力（仅对 chat 类型有意义）
 * 使用按提供商分组的配置，更精确地匹配能力
 * 
 * @param modelId 模型 ID
 * @param modelType 模型类型
 * @param explicitAbilities 显式配置的能力列表
 * @returns 推断的能力列表
 */
export function inferModelAbilities(
  modelId: string,
  modelType: ModelType,
  explicitAbilities?: ModelAbility[]
): ModelAbility[] {
  if (explicitAbilities && explicitAbilities.length > 0) {
    return explicitAbilities;
  }

  // 非 chat 类型不推断能力
  if (modelType !== 'chat') {
    return [];
  }

  // 检测提供商并获取对应配置
  const provider = detectModelProvider(modelId);
  const config = PROVIDER_ABILITY_CONFIG[provider] || PROVIDER_ABILITY_CONFIG.default;
  
  const abilities: ModelAbility[] = [];
  
  // 检查 vision 能力
  if (config.vision && config.vision.length > 0 && matchesKeywords(modelId, config.vision)) {
    abilities.push('vision');
  }
  
  // 检查 reasoning 能力
  if (config.reasoning && config.reasoning.length > 0 && matchesKeywords(modelId, config.reasoning)) {
    abilities.push('reasoning');
  }
  
  // 检查 functionCall 能力
  if (config.functionCall && config.functionCall.length > 0 && matchesKeywords(modelId, config.functionCall)) {
    abilities.push('functionCall');
  }
  
  // 检查 webSearch 能力
  if (config.webSearch && config.webSearch.length > 0 && matchesKeywords(modelId, config.webSearch)) {
    abilities.push('webSearch');
  }

  return abilities;
}

/**
 * 推断模型的完整信息（类型 + 能力）
 * @param modelId 模型 ID
 * @param explicitType 显式配置的类型
 * @param explicitAbilities 显式配置的能力列表
 * @returns 类型和能力信息
 */
export function inferModelInfo(
  modelId: string,
  explicitType?: ModelType,
  explicitAbilities?: ModelAbility[]
): { type: ModelType; abilities: ModelAbility[] } {
  const type = inferModelType(modelId, explicitType);
  const abilities = inferModelAbilities(modelId, type, explicitAbilities);
  return { type, abilities };
}

// 导出配置供测试使用
export { TYPE_KEYWORDS, PROVIDER_ABILITY_CONFIG, MODEL_PROVIDER_DETECTION, matchesKeywords, detectModelProvider };


/**
 * 标签选项接口
 */
interface TagOptions {
  showLabel?: boolean;
  size?: 'small' | 'normal';
}

/**
 * 创建类型标签
 * @param container 父容器元素
 * @param type 模型类型
 * @param options 配置选项
 * @returns 创建的标签元素
 */
export function createTypeTag(
  container: HTMLElement,
  type: ModelType,
  options: TagOptions = {}
): HTMLElement {
  const { showLabel = false, size = 'small' } = options;
  const config = TYPE_CONFIG[type];
  
  const tagEl = container.createSpan({ 
    cls: `model-tag model-type-tag ${config.colorClass} size-${size}` 
  });
  
  const iconEl = tagEl.createSpan({ cls: 'tag-icon' });
  setIcon(iconEl, config.icon);
  
  if (showLabel) {
    tagEl.createSpan({ 
      cls: 'tag-label',
      text: t(`modelTypes.${type}`)
    });
  }
  
  tagEl.setAttribute('aria-label', t(`modelTypes.${type}Desc`));
  
  return tagEl;
}

/**
 * 创建能力标签
 * @param container 父容器元素
 * @param ability 模型能力
 * @param options 配置选项
 * @returns 创建的标签元素
 */
export function createAbilityTag(
  container: HTMLElement,
  ability: ModelAbility,
  options: TagOptions = {}
): HTMLElement {
  const { showLabel = false, size = 'small' } = options;
  const config = ABILITY_CONFIG[ability];
  
  const tagEl = container.createSpan({ 
    cls: `model-tag model-ability-tag ${config.colorClass} size-${size}` 
  });
  
  const iconEl = tagEl.createSpan({ cls: 'tag-icon' });
  setIcon(iconEl, config.icon);
  
  if (showLabel) {
    tagEl.createSpan({ 
      cls: 'tag-label',
      text: t(`modelAbilities.${ability}`)
    });
  }
  
  tagEl.setAttribute('aria-label', t(`modelAbilities.${ability}Desc`));
  
  return tagEl;
}

/**
 * 创建模型标签组（显示类型标签和能力标签）
 * @param container 父容器元素
 * @param type 模型类型
 * @param abilities 模型能力列表
 * @returns 创建的标签组元素
 */
export function createModelTagGroup(
  container: HTMLElement,
  type: ModelType,
  abilities: ModelAbility[]
): HTMLElement {
  const groupEl = container.createSpan({ cls: 'model-tag-group' });
  
  // 先显示类型标签
  createTypeTag(groupEl, type);
  
  // 再显示能力标签（最多显示 4 个，避免过长）
  const displayAbilities = abilities.slice(0, 4);
  displayAbilities.forEach(ability => createAbilityTag(groupEl, ability));
  
  return groupEl;
}

// 导出配置供外部使用
export { TYPE_CONFIG, ABILITY_CONFIG };

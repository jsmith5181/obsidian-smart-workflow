/**
 * Responses API 相关错误类型定义
 * 用于处理 Responses API 特有的错误场景
 */

import { t } from '../../i18n';

/**
 * 不支持的 API 格式错误
 * 当模型不支持指定的 API 格式时抛出
 */
export class UnsupportedAPIFormatError extends Error {
  /** 请求的 API 格式 */
  public readonly requestedFormat: string;
  /** 建议使用的 API 格式 */
  public readonly suggestedFormat: string;
  /** HTTP 状态码（如果有） */
  public readonly statusCode?: number;

  constructor(
    requestedFormat: string,
    suggestedFormat: string = 'chat-completions',
    statusCode?: number
  ) {
    const message = t('aiService.unsupportedApiFormat', {
      format: requestedFormat,
      suggestion: suggestedFormat
    });
    super(message);
    this.name = 'UnsupportedAPIFormatError';
    this.requestedFormat = requestedFormat;
    this.suggestedFormat = suggestedFormat;
    this.statusCode = statusCode;

    // 确保原型链正确（TypeScript 编译到 ES5 时需要）
    Object.setPrototypeOf(this, UnsupportedAPIFormatError.prototype);
  }
}

/**
 * 无效的推理深度错误
 * 当提供的 reasoningEffort 值无效时抛出
 */
export class InvalidReasoningEffortError extends Error {
  /** 提供的无效值 */
  public readonly providedValue: string;
  /** 有效的选项列表 */
  public readonly validOptions: string[];

  constructor(providedValue: string) {
    const validOptions = ['low', 'medium', 'high'];
    const message = t('aiService.invalidReasoningEffort', {
      value: providedValue,
      validOptions: validOptions.join(', ')
    });
    super(message);
    this.name = 'InvalidReasoningEffortError';
    this.providedValue = providedValue;
    this.validOptions = validOptions;

    // 确保原型链正确（TypeScript 编译到 ES5 时需要）
    Object.setPrototypeOf(this, InvalidReasoningEffortError.prototype);
  }
}

/**
 * Responses API 错误
 * 用于处理 Responses API 特有的错误响应
 */
export class ResponsesAPIError extends Error {
  /** HTTP 状态码 */
  public readonly statusCode: number;
  /** 错误类型 */
  public readonly errorType?: string;
  /** 原始错误消息 */
  public readonly originalMessage?: string;

  constructor(
    statusCode: number,
    message: string,
    errorType?: string,
    originalMessage?: string
  ) {
    super(message);
    this.name = 'ResponsesAPIError';
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.originalMessage = originalMessage;

    // 确保原型链正确（TypeScript 编译到 ES5 时需要）
    Object.setPrototypeOf(this, ResponsesAPIError.prototype);
  }
}

/**
 * 检查错误是否为 UnsupportedAPIFormatError
 */
export function isUnsupportedAPIFormatError(error: unknown): error is UnsupportedAPIFormatError {
  return error instanceof UnsupportedAPIFormatError;
}

/**
 * 检查错误是否为 InvalidReasoningEffortError
 */
export function isInvalidReasoningEffortError(error: unknown): error is InvalidReasoningEffortError {
  return error instanceof InvalidReasoningEffortError;
}

/**
 * 检查错误是否为 ResponsesAPIError
 */
export function isResponsesAPIError(error: unknown): error is ResponsesAPIError {
  return error instanceof ResponsesAPIError;
}

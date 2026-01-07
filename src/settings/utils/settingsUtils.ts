/**
 * 设置工具函数模块
 * 提供设置界面使用的通用工具函数和状态管理
 */

import { Platform } from 'obsidian';
import { t } from '../../i18n';
import type { SettingTab } from '../types';

/**
 * 供应商模型列表展开状态缓存
 * key: 供应商 ID
 * value: 是否展开（默认展开）
 */
export const providerExpandedStatus: Map<string, boolean> = new Map();

/**
 * 验证 Shell 路径是否有效（仅桌面端可用）
 * @param path Shell 可执行文件路径
 * @returns 路径是否存在且有效
 */
export function validateShellPath(path: string): boolean {
  if (!path || path.trim() === '') return false;
  // 移动端不支持文件系统检查
  if (Platform.isMobile) return true;
  try {
    // 动态导入 fs 模块，避免移动端加载失败
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require('fs');
    return existsSync(path);
  } catch {
    return false;
  }
}

/**
 * 获取设置标签页定义
 * 使用函数返回以确保 i18n 已初始化
 * 移动端会过滤掉终端选项
 * @returns 设置标签页数组
 */
export function getSettingTabs(): SettingTab[] {
  const tabs: SettingTab[] = [
    { id: 'general', name: t('settings.tabs.general'), icon: 'settings' },
    { id: 'naming', name: t('settings.tabs.naming'), icon: 'tag' },
    { id: 'tagging', name: t('settings.tabs.tagging'), icon: 'tags' },
    { id: 'autoArchive', name: t('settings.tabs.autoArchive'), icon: 'package' },
    { id: 'voice', name: t('settings.tabs.voice'), icon: 'mic' },
    { id: 'terminal', name: t('settings.tabs.terminal'), icon: 'terminal' },
    { id: 'advanced', name: t('settings.tabs.advanced'), icon: 'sliders-horizontal' }
  ];
  
  // 移动端过滤掉终端选项
  if (Platform.isMobile) {
    return tabs.filter(tab => tab.id !== 'terminal');
  }
  
  return tabs;
}

/**
 * 缩短端点 URL 显示
 * 仅显示主机名，便于 UI 展示
 * @param endpoint 完整端点 URL
 * @returns 缩短后的显示文本
 */
export function shortenEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    // 只显示主机名
    return url.hostname;
  } catch {
    // 如果解析失败，截取前30个字符
    return endpoint.length > 30 ? endpoint.substring(0, 30) + '...' : endpoint;
  }
}

/**
 * 格式化上下文长度显示
 * 将 token 数量转换为人类可读格式
 * @param length 上下文长度（tokens）
 * @returns 格式化后的字符串（如 "4K", "1M"）
 */
export function formatContextLength(length: number): string {
  if (length >= 1000000) {
    return `${(length / 1000000).toFixed(0)}M`;
  } else if (length >= 1000) {
    return `${(length / 1000).toFixed(0)}K`;
  }
  return String(length);
}

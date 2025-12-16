import { Notice } from 'obsidian';

/**
 * 通知助手类
 * 封装 Obsidian 通知功能，提供统一的通知接口
 */
export class NoticeHelper {
  /**
   * 显示成功通知
   */
  static success(message: string, duration = 5000): void {
    new Notice(`✅ ${message}`, duration);
  }

  /**
   * 显示错误通知
   */
  static error(message: string, duration = 8000): void {
    new Notice(`❌ ${message}`, duration);
  }

  /**
   * 显示警告通知
   */
  static warning(message: string, duration = 6000): void {
    new Notice(`⚠️ ${message}`, duration);
  }

  /**
   * 显示信息通知
   */
  static info(message: string, duration = 4000): void {
    new Notice(`ℹ️ ${message}`, duration);
  }
}

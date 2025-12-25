import { App, TFile } from 'obsidian';
import { AIService } from './aiService';
import { FileAnalyzer } from './fileAnalyzer';
import { AIFileNamerSettings } from '../../settings/settings';
import { debugLog, debugWarn } from '../../utils/logger';

/**
 * 重命名结果接口
 */
export interface RenameResult {
  /** 是否执行了重命名 */
  renamed: boolean;
  /** 原文件名（不含扩展名） */
  oldName: string;
  /** 新文件名（不含扩展名） */
  newName: string;
  /** 结果消息 */
  message: string;
}

/**
 * 文件名服务类
 * 负责文件读取、文件名生成和文件重命名
 */
export class FileNameService {
  private fileAnalyzer: FileAnalyzer;

  constructor(
    private app: App,
    private aiService: AIService,
    private settings: AIFileNamerSettings
  ) {
    this.fileAnalyzer = new FileAnalyzer(app);
  }

  /**
   * 生成文件名并重命名文件
   * @param file 目标文件
   * @param configId 配置 ID（可选）
   * @returns 重命名结果
   */
  async generateAndRename(file: TFile, configId?: string): Promise<RenameResult> {
    // 读取文件内容
    const content = await this.app.vault.read(file);

    // 获取当前文件名（不含扩展名）
    const currentFileName = file.basename;

    // 根据配置决定是否分析目录命名风格
    let directoryNamingStyle: string | undefined = undefined;
    if (this.settings.analyzeDirectoryNamingStyle) {
      if (this.settings.debugMode) {
        debugLog('[FileNameService] 开始分析目录命名风格...');
      }
      try {
        directoryNamingStyle = this.fileAnalyzer.analyzeDirectoryNamingStyle(file, this.settings.debugMode);
        if (this.settings.debugMode) {
          debugLog('[FileNameService] 目录命名风格分析完成:', directoryNamingStyle || '(空)');
        }
      } catch (error) {
        debugWarn('[FileNameService] 分析目录命名风格失败:', error);
        // 继续执行，不阻塞主流程
      }
    } else {
      if (this.settings.debugMode) {
        debugLog('[FileNameService] 目录命名风格分析已禁用');
      }
    }

    // 调用 AI 服务生成新文件名
    if (this.settings.debugMode) {
      debugLog('[FileNameService] 调用 AI 服务生成文件名...');
      debugLog('[FileNameService] 参数:', {
        contentLength: content.length,
        currentFileName,
        hasDirectoryStyle: !!directoryNamingStyle,
        configId
      });
    }

    const newFileName = await this.aiService.generateFileName(
      content,
      currentFileName,
      directoryNamingStyle,
      configId
    );

    if (this.settings.debugMode) {
      debugLog('[FileNameService] AI 生成的文件名:', newFileName);
    }

    // 验证和清理文件名
    const sanitizedFileName = this.sanitizeFileName(newFileName);

    // 标准化当前文件名以便比较（使用相同的清理逻辑）
    const sanitizedCurrentFileName = this.sanitizeFileName(currentFileName);

    // 检查文件名是否实际改变（不区分大小写比较，适配 Windows）
    if (sanitizedFileName.toLowerCase() === sanitizedCurrentFileName.toLowerCase()) {
      if (this.settings.debugMode) {
        debugLog('[FileNameService] 生成的文件名与当前文件名相同，跳过重命名');
      }
      // 返回"未改变"的结果，而不抛出错误
      return {
        renamed: false,
        oldName: currentFileName,
        newName: sanitizedFileName,
        message: '当前文件名已经很合适，无需修改'
      };
    }

    // 构建新路径
    const newPath = this.buildNewPath(file, sanitizedFileName);

    // 检查文件名冲突
    const finalPath = await this.resolveConflict(newPath);

    // 执行重命名
    await this.app.fileManager.renameFile(file, finalPath);

    // 提取最终文件名（不含扩展名和路径）
    const finalFileName = finalPath.split('/').pop()?.replace(/\.[^.]+$/, '') || sanitizedFileName;

    // 返回成功结果
    return {
      renamed: true,
      oldName: currentFileName,
      newName: finalFileName,
      message: `文件已重命名为: ${finalFileName}`
    };
  }

  /**
   * 清理文件名，移除非法字符
   * @param fileName 原始文件名
   * @returns 清理后的文件名
   */
  private sanitizeFileName(fileName: string): string {
    // 移除 Windows 和 Unix 系统不允许的字符
    let sanitized = fileName.replace(/[\\/:*?"<>|]/g, '');

    // 移除前后空格
    sanitized = sanitized.trim();

    // 移除多余的空格
    sanitized = sanitized.replace(/\s+/g, ' ');

    // 限制长度（最多 100 个字符）
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100).trim();
    }

    // 如果清理后为空，使用默认名称
    if (!sanitized) {
      throw new Error('生成的文件名无效（清理后为空）');
    }

    return sanitized;
  }

  /**
   * 构建新路径
   * @param file 原文件
   * @param newFileName 新文件名（不含扩展名）
   * @returns 新路径
   */
  private buildNewPath(file: TFile, newFileName: string): string {
    const extension = file.extension;
    const directory = file.parent?.path || '';

    if (directory) {
      return `${directory}/${newFileName}.${extension}`;
    } else {
      return `${newFileName}.${extension}`;
    }
  }

  /**
   * 解决文件名冲突
   * @param path 目标路径
   * @returns 解决冲突后的路径
   */
  private async resolveConflict(path: string): Promise<string> {
    let finalPath = path;
    let counter = 1;

    // 检查文件是否存在
    while (await this.app.vault.adapter.exists(finalPath)) {
      // 提取文件名和扩展名
      const match = path.match(/^(.+)\.([^.]+)$/);
      if (match) {
        const baseName = match[1];
        const extension = match[2];
        finalPath = `${baseName} ${counter}.${extension}`;
      } else {
        finalPath = `${path} ${counter}`;
      }
      counter++;
    }

    return finalPath;
  }

  /**
   * 验证文件名是否合法
   * @param fileName 文件名
   * @returns 是否合法
   */
  validateFileName(fileName: string): boolean {
    // 检查是否包含非法字符
    if (/[\\/:*?"<>|]/.test(fileName)) {
      return false;
    }

    // 检查是否为空
    if (!fileName || fileName.trim() === '') {
      return false;
    }

    // 检查长度
    if (fileName.length > 100) {
      return false;
    }

    return true;
  }
}

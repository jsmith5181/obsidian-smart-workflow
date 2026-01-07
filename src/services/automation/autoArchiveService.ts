/**
 * AutoArchiveService - 自动归档服务
 *
 * 功能:
 * - 监听文件 frontmatter 变化
 * - 当 status 变为 finish 时自动执行标签生成和归档
 */

import { TFile, App, CachedMetadata, Notice } from 'obsidian';
import { SmartWorkflowSettings } from '../../settings/settings';
import { TagService } from '../tagging/tagService';
import { CategoryService } from '../categorizing/categoryService';
import { ArchiveService } from '../archiving/archiveService';
import { debugLog, errorLog } from '../../utils/logger';
import { t } from '../../i18n';

/**
 * AutoArchiveService 类
 */
export class AutoArchiveService {
  private app: App;
  private settings: SmartWorkflowSettings;
  private tagService: TagService;
  private categoryService: CategoryService;
  private archiveService: ArchiveService;

  // 去抖动计时器映射 (文件路径 -> 定时器ID)
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // 记录已处理的文件,避免重复处理
  private processedFiles: Set<string> = new Set();

  constructor(
    app: App,
    settings: SmartWorkflowSettings,
    tagService: TagService,
    categoryService: CategoryService,
    archiveService: ArchiveService
  ) {
    this.app = app;
    this.settings = settings;
    this.tagService = tagService;
    this.categoryService = categoryService;
    this.archiveService = archiveService;
  }

  /**
   * 检查文件是否应该被自动归档
   * @param file 文件对象
   * @param metadata 文件元数据
   * @returns 是否应该触发自动归档
   */
  shouldAutoArchive(file: TFile, metadata: CachedMetadata | null): boolean {
    // 检查自动归档是否启用
    if (!this.settings.autoArchive?.enabled) {
      return false;
    }

    if (!metadata?.frontmatter) {
      return false;
    }

    const frontmatter = metadata.frontmatter;
    const triggerField = this.settings.autoArchive.triggerField || 'status';
    const triggerStatus = this.settings.autoArchive.triggerStatus || 'finish';

    // 检查是否在排除列表中
    const excludeFolders = this.settings.autoArchive.excludeFolders || [
      '03-归档区',
      '99-资源库',
    ];
    const isExcluded = excludeFolders.some(folder =>
      file.path.startsWith(folder + '/')
    );
    if (isExcluded) {
      debugLog('[AutoArchiveService] 文件在排除列表中:', file.path);
      return false;
    }

    // 检查是否已在归档区
    if (!this.archiveService.canArchive(file)) {
      debugLog('[AutoArchiveService] 文件已在归档区:', file.path);
      return false;
    }

    // 检查状态字段
    const statusValue = frontmatter[triggerField];
    const shouldTrigger = statusValue === triggerStatus;

    if (shouldTrigger) {
      debugLog('[AutoArchiveService] 检测到触发状态:', {
        file: file.path,
        field: triggerField,
        value: statusValue
      });
    }

    return shouldTrigger;
  }

  /**
   * 处理文件自动归档
   * @param file 要处理的文件
   */
  async processAutoArchive(file: TFile): Promise<void> {
    const debounceDelay = this.settings.autoArchive?.debounceDelay || 2000;

    // 清除之前的定时器
    const existingTimer = this.debounceTimers.get(file.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置去抖动延迟
    const timer = setTimeout(async () => {
      try {
        await this.executeAutoArchive(file);
      } catch (error) {
        errorLog('[AutoArchiveService] 自动归档执行失败:', error);
        new Notice(t('autoArchive.notices.failed', { message: error instanceof Error ? error.message : String(error) }));
      } finally {
        this.debounceTimers.delete(file.path);
      }
    }, debounceDelay);

    this.debounceTimers.set(file.path, timer);
  }

  /**
   * 执行自动归档流程
   * @param file 文件
   */
  private async executeAutoArchive(file: TFile): Promise<void> {
    // 避免重复处理同一文件
    const cacheKey = `${file.path}:${file.stat.mtime}`;
    if (this.processedFiles.has(cacheKey)) {
      debugLog('[AutoArchiveService] 文件已处理,跳过:', file.path);
      return;
    }

    debugLog('[AutoArchiveService] 开始自动归档流程:', file.path);
    new Notice(t('autoArchive.notices.processing', { filename: file.basename }));

    try {
      // 步骤1: 生成标签
      if (this.settings.autoArchive?.generateTags && this.settings.tagging.enabled) {
        debugLog('[AutoArchiveService] 步骤1: 生成标签');
        await this.autoGenerateTags(file);
      }

      // 步骤2: 智能归档
      if (this.settings.autoArchive?.performArchive && this.settings.archiving.enabled) {
        debugLog('[AutoArchiveService] 步骤2: 智能归档');
        await this.autoArchiveFile(file);
      }

      // 标记为已处理
      this.processedFiles.add(cacheKey);

      // 限制缓存大小(最多保存1000个)
      if (this.processedFiles.size > 1000) {
        const firstKey = this.processedFiles.values().next().value;
        this.processedFiles.delete(firstKey);
      }

      new Notice(t('autoArchive.notices.completed', { filename: file.basename }));
      debugLog('[AutoArchiveService] 自动归档流程完成:', file.path);
    } catch (error) {
      errorLog('[AutoArchiveService] 自动归档流程失败:', error);
      throw error;
    }
  }

  /**
   * 自动生成标签
   * @param file 文件
   */
  private async autoGenerateTags(file: TFile): Promise<void> {
    try {
      const result = await this.tagService.generateTags(file);

      if (!result.success) {
        throw new Error(result.error || t('tagging.service.generateFailed'));
      }

      if (result.tags.length === 0) {
        debugLog('[AutoArchiveService] AI未生成标签,跳过');
        return;
      }

      // 应用标签
      await this.tagService.applyTags(file, result.allTags);
      debugLog('[AutoArchiveService] 已自动应用标签:', result.allTags);
      new Notice(t('autoArchive.notices.tagsGenerated', { count: result.tags.length.toString() }));
    } catch (error) {
      errorLog('[AutoArchiveService] 自动生成标签失败:', error);
      throw new Error(t('tagging.notices.failed', { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * 自动归档文件
   * @param file 文件
   */
  private async autoArchiveFile(file: TFile): Promise<void> {
    try {
      // 生成分类建议
      const categoryResult = await this.categoryService.suggestCategory(file);

      if (!categoryResult.success) {
        throw new Error(categoryResult.error || t('archiving.service.categorizeFailed'));
      }

      if (categoryResult.suggestions.length === 0) {
        debugLog('[AutoArchiveService] 未找到归档分类,跳过');
        new Notice(t('autoArchive.notices.noCategory'));
        return;
      }

      // 使用第一个建议(置信度最高)
      const topSuggestion = categoryResult.suggestions[0];
      debugLog('[AutoArchiveService] 使用归档分类:', topSuggestion);

      // 执行归档
      const archiveResult = await this.archiveService.archiveFile(file, {
        targetPath: topSuggestion.path,
        moveAttachments: this.settings.archiving.moveAttachments,
        updateLinks: this.settings.archiving.updateLinks,
        createFolder: true,
      });

      if (!archiveResult.success) {
        throw new Error(archiveResult.error || t('archiving.service.archiveFailed'));
      }

      debugLog('[AutoArchiveService] 文件归档成功:', archiveResult.newPath);
      new Notice(t('autoArchive.notices.archived', { path: topSuggestion.name || topSuggestion.path }));
    } catch (error) {
      errorLog('[AutoArchiveService] 自动归档失败:', error);
      throw new Error(t('archiving.notices.failed', { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 清除所有计时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.processedFiles.clear();
  }
}

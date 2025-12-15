import { Plugin, TFile, Menu, MarkdownView } from 'obsidian';
import { AIFileNamerSettings, DEFAULT_SETTINGS } from './settings/settings';
import { AIFileNamerSettingTab } from './settings/settingsTab';
import { AIService } from './services/aiService';
import { FileNameService } from './services/fileNameService';
import { NoticeHelper } from './ui/noticeHelper';

/**
 * AI 文件名生成器插件主类
 */
export default class AIFileNamerPlugin extends Plugin {
  settings: AIFileNamerSettings;
  aiService: AIService;
  fileNameService: FileNameService;
  generatingFiles: Set<string> = new Set();


  /**
   * 插件加载时调用
   */
  async onload() {
    console.log('加载 AI File Namer 插件');

    // 加载设置
    await this.loadSettings();

    // 初始化服务
    this.aiService = new AIService(this.app, this.settings);
    this.fileNameService = new FileNameService(
      this.app,
      this.aiService,
      this.settings
    );

    // 添加侧边栏图标按钮
    this.addRibbonIcon('sparkles', 'AI 文件名生成', async () => {
      await this.handleGenerateCommand();
    });

    // 添加命令面板命令
    this.addCommand({
      id: 'generate-ai-filename',
      name: '生成 AI 文件名',
      callback: async () => {
        await this.handleGenerateCommand();
      }
    });

    // 添加编辑器右键菜单
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle('生成 AI 文件名')
            .setIcon('sparkles')
            .onClick(async () => {
              await this.handleGenerateCommand();
            });
        });
      })
    );

    // 添加文件浏览器右键菜单
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (file instanceof TFile) {
          menu.addItem((item) => {
            item
              .setTitle('生成 AI 文件名')
              .setIcon('sparkles')
              .onClick(async () => {
                await this.handleGenerateForFile(file);
              });
          });
        }
      })
    );

    // 添加设置标签页
    this.addSettingTab(new AIFileNamerSettingTab(this.app, this));

    // 监听文件切换，清理不属于当前文件的动画效果
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.cleanupTitleAnimations();
      })
    );
  }

  /**
   * 清理不属于当前文件的标题动画效果
   */
  cleanupTitleAnimations() {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeView) return;

    const viewContent = activeView.containerEl.querySelector('.view-content');
    const inlineTitle = viewContent?.querySelector('.inline-title') as HTMLElement;

    if (!inlineTitle) return;

    // 如果当前文件不在生成列表中，移除动画效果
    if (!activeFile || !this.generatingFiles.has(activeFile.path)) {
      inlineTitle.removeClass('ai-generating-title');
    } else {
      // 如果当前文件正在生成，确保有动画效果
      inlineTitle.addClass('ai-generating-title');
    }
  }

  /**
   * 处理生成命令（从当前活动文件）
   */
  async handleGenerateCommand() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      NoticeHelper.error('没有打开的文件');
      return;
    }
    await this.handleGenerateForFile(file);
  }

  /**
   * 获取指定文件的标题元素
   * @param filePath 文件路径
   */
  getInlineTitleForFile(filePath: string): HTMLElement | null {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.path !== filePath) {
      return null;
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return null;

    const viewContent = activeView.containerEl.querySelector('.view-content');
    return viewContent?.querySelector('.inline-title') as HTMLElement;
  }

  /**
   * 处理指定文件的生成
   * @param file 目标文件
   */
  async handleGenerateForFile(file: TFile) {
    // 添加到生成中的文件集合
    this.generatingFiles.add(file.path);

    // 添加标题动画效果
    let inlineTitle = this.getInlineTitleForFile(file.path);
    if (inlineTitle) {
      inlineTitle.addClass('ai-generating-title');
    }

    try {
      NoticeHelper.info('正在生成文件名...');

      await this.fileNameService.generateAndRename(file);

      NoticeHelper.success(`文件已重命名为: ${file.basename}`);
    } catch (error) {
      if (error instanceof Error) {
        NoticeHelper.error(`操作失败: ${error.message}`);
        console.error('AI 文件名生成错误:', error);
      } else {
        NoticeHelper.error('操作失败: 未知错误');
        console.error('AI 文件名生成错误:', error);
      }
    } finally {
      // 移除生成状态
      this.generatingFiles.delete(file.path);

      // 移除标题动画效果 - 重新获取元素以确保移除正确的元素
      inlineTitle = this.getInlineTitleForFile(file.path);
      if (inlineTitle) {
        inlineTitle.removeClass('ai-generating-title');
      }
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

    // 如果 defaultPromptTemplate 为空，使用代码中的默认值
    if (!this.settings.defaultPromptTemplate || this.settings.defaultPromptTemplate.trim() === '') {
      this.settings.defaultPromptTemplate = DEFAULT_SETTINGS.defaultPromptTemplate;
    }

    // 如果配置的 promptTemplate 为空，使用默认值
    this.settings.configs.forEach(config => {
      if (!config.promptTemplate || config.promptTemplate.trim() === '') {
        config.promptTemplate = this.settings.defaultPromptTemplate;
      }
    });

    // 保存修复后的配置
    if (loadedData) {
      await this.saveSettings();
    }
  }

  /**
   * 保存设置
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * 插件卸载时调用
   */
  onunload() {
    console.log('卸载 AI File Namer 插件');
  }
}

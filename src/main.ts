import { Plugin, TFile, Menu } from 'obsidian';
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
   * 处理指定文件的生成
   * @param file 目标文件
   */
  async handleGenerateForFile(file: TFile) {
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
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

/**
 * 标签生成设置渲染器
 * 负责渲染AI标签生成和归档配置
 */

import { Setting } from 'obsidian';
import type { RendererContext } from '../types';
import { BaseSettingsRenderer } from './baseRenderer';
import { DEFAULT_TAGGING_SETTINGS, DEFAULT_ARCHIVING_SETTINGS } from '../settings';

/**
 * 标签生成设置渲染器
 */
export class TaggingSettingsRenderer extends BaseSettingsRenderer {
  /**
   * 渲染标签生成设置
   * @param context 渲染器上下文
   */
  render(context: RendererContext): void {
    this.context = context;
    const containerEl = context.containerEl;

    // AI模型绑定
    this.renderModelBinding(containerEl);

    // AI标签生成设置
    this.renderTaggingSettings(containerEl);

    // 智能归档设置
    this.renderArchivingSettings(containerEl);
  }

  /**
   * 渲染模型绑定设置
   */
  private renderModelBinding(containerEl: HTMLElement): void {
    // 获取当前 tagging 功能的解析配置
    const resolvedConfig = this.context.configManager.resolveFeatureConfig('tagging');
    const currentProvider = resolvedConfig?.provider;
    const currentModel = resolvedConfig?.model;

    const bindingCard = containerEl.createDiv();
    bindingCard.style.padding = '16px';
    bindingCard.style.borderRadius = '8px';
    bindingCard.style.backgroundColor = 'var(--background-secondary)';
    bindingCard.style.marginBottom = '10px';

    // 模型绑定设置标题
    new Setting(bindingCard)
      .setName('AI 模型配置')
      .setDesc('为标签生成功能绑定 AI 供应商和模型')
      .setHeading();

    const bindingSetting = new Setting(bindingCard)
      .setName('选择模型')
      .setDesc('选择用于标签生成的 AI 模型（必须先在通用设置中添加供应商和模型）');

    // 使用自定义 select 元素支持 optgroup
    bindingSetting.addDropdown(dropdown => {
      const selectEl = dropdown.selectEl;
      selectEl.empty();

      // 设置最小宽度
      selectEl.style.minWidth = '200px';

      // 添加空选项（不绑定）
      const emptyOption = selectEl.createEl('option', {
        value: '',
        text: '未绑定'
      });
      emptyOption.setAttribute('value', '');

      // 按供应商分组添加选项
      const providers = this.context.configManager.getProviders();
      providers.forEach(provider => {
        if (provider.models.length === 0) return;

        // 创建 optgroup
        const optgroup = selectEl.createEl('optgroup', { attr: { label: provider.name } });

        // 添加模型选项
        provider.models.forEach(model => {
          const displayName = model.displayName || model.name;
          const option = optgroup.createEl('option', {
            value: `${provider.id}|${model.id}`,
            text: displayName
          });
          option.setAttribute('value', `${provider.id}|${model.id}`);
        });
      });

      // 设置当前值
      const currentValue = currentProvider && currentModel
        ? `${currentProvider.id}|${currentModel.id}`
        : '';
      selectEl.value = currentValue;

      // 监听变化
      dropdown.onChange(async (value) => {
        if (!value) {
          // 清除绑定
          delete this.context.plugin.settings.featureBindings.tagging;
        } else {
          const [providerId, modelId] = value.split('|');
          const existingBinding = this.context.plugin.settings.featureBindings.tagging;
          this.context.plugin.settings.featureBindings.tagging = {
            providerId,
            modelId,
            promptTemplate: existingBinding?.promptTemplate ?? this.context.plugin.settings.tagging.promptTemplate
          };
        }
        await this.saveSettings();
        this.refreshDisplay();
      });
    });

    // 显示当前绑定状态
    if (currentProvider && currentModel) {
      const displayName = currentModel.displayName || currentModel.name;
      const statusEl = bindingCard.createDiv({ cls: 'feature-binding-status' });
      statusEl.setCssProps({
        'font-size': '0.85em',
        color: 'var(--text-muted)',
        'margin-top': '8px',
        'margin-bottom': '16px',
        padding: '8px 12px',
        'background-color': 'var(--background-primary)',
        'border-radius': '4px'
      });
      statusEl.setText(`当前使用：${currentProvider.name} / ${displayName}`);
    } else {
      // 显示警告：未绑定模型
      const warningEl = bindingCard.createDiv({ cls: 'feature-binding-warning' });
      warningEl.setCssProps({
        'font-size': '0.85em',
        color: 'var(--text-error)',
        'margin-top': '8px',
        'margin-bottom': '16px',
        padding: '8px 12px',
        'background-color': 'var(--background-primary)',
        'border-radius': '4px'
      });
      warningEl.setText('⚠️ 未绑定 AI 模型，标签生成功能将无法使用。请先在「通用设置」中添加供应商和模型，然后在此处绑定。');
    }
  }

  /**
   * 渲染标签生成设置
   */
  private renderTaggingSettings(containerEl: HTMLElement): void {
    // 确保配置存在
    if (!this.context.plugin.settings.tagging) {
      this.context.plugin.settings.tagging = { ...DEFAULT_TAGGING_SETTINGS };
    }

    const taggingCard = containerEl.createDiv();
    taggingCard.style.padding = '16px';
    taggingCard.style.borderRadius = '8px';
    taggingCard.style.backgroundColor = 'var(--background-secondary)';
    taggingCard.style.marginBottom = '10px';

    new Setting(taggingCard)
      .setName('AI 标签生成')
      .setDesc('使用AI自动为笔记生成相关标签')
      .setHeading();

    const settings = this.context.plugin.settings.tagging;

    // 启用标签生成
    new Setting(taggingCard)
      .setName('启用标签生成')
      .setDesc('开启后可以使用AI生成标签功能')
      .addToggle(toggle => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.saveSettings();
          this.refreshDisplay();
        }));

    if (!settings.enabled) {
      return; // 如果未启用，不显示其他选项
    }

    // 标签数量
    new Setting(taggingCard)
      .setName('生成标签数量')
      .setDesc('AI每次生成的标签数量（推荐3-5个）')
      .addSlider(slider => slider
        .setLimits(settings.minTagCount, settings.maxTagCount, 1)
        .setValue(settings.tagCount)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.tagCount = value;
          await this.saveSettings();
        }));

    // 保留现有标签
    new Setting(taggingCard)
      .setName('保留现有标签')
      .setDesc('生成新标签时保留笔记中已有的标签')
      .addToggle(toggle => toggle
        .setValue(settings.preserveExistingTags)
        .onChange(async (value) => {
          settings.preserveExistingTags = value;
          await this.saveSettings();
        }));

    // 自动应用
    new Setting(taggingCard)
      .setName('自动应用标签')
      .setDesc('关闭后会显示确认对话框，允许编辑后再应用')
      .addToggle(toggle => toggle
        .setValue(settings.autoApply)
        .onChange(async (value) => {
          settings.autoApply = value;
          await this.saveSettings();
        }));

    // 显示设置
    new Setting(taggingCard)
      .setName('界面显示')
      .setHeading();

    new Setting(taggingCard)
      .setName('命令面板')
      .setDesc('在命令面板中显示"生成AI标签"命令')
      .addToggle(toggle => toggle
        .setValue(settings.showInCommandPalette)
        .onChange(async (value) => {
          settings.showInCommandPalette = value;
          await this.saveSettings();
        }));

    new Setting(taggingCard)
      .setName('编辑器右键菜单')
      .setDesc('在编辑器右键菜单中显示"生成AI标签"选项')
      .addToggle(toggle => toggle
        .setValue(settings.showInEditorMenu)
        .onChange(async (value) => {
          settings.showInEditorMenu = value;
          await this.saveSettings();
        }));

    new Setting(taggingCard)
      .setName('文件浏览器右键菜单')
      .setDesc('在文件浏览器右键菜单中显示"生成AI标签"选项')
      .addToggle(toggle => toggle
        .setValue(settings.showInFileMenu)
        .onChange(async (value) => {
          settings.showInFileMenu = value;
          await this.saveSettings();
        }));

    // Prompt模板
    new Setting(taggingCard)
      .setName('Prompt 模板')
      .setDesc('AI生成标签时使用的提示词模板（高级）')
      .addTextArea(text => {
        text
          .setValue(settings.promptTemplate)
          .onChange(async (value) => {
            settings.promptTemplate = value;
            await this.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontFamily = 'var(--font-monospace)';
        text.inputEl.style.fontSize = '12px';
      });

    // 重置按钮
    new Setting(taggingCard)
      .setName('重置为默认值')
      .setDesc('恢复标签生成的所有默认设置')
      .addButton(button => button
        .setButtonText('重置')
        .onClick(async () => {
          this.context.plugin.settings.tagging = { ...DEFAULT_TAGGING_SETTINGS };
          await this.saveSettings();
          this.refreshDisplay();
        }));
  }

  /**
   * 渲染归档 AI 模型绑定设置
   */
  private renderArchivingModelBinding(containerEl: HTMLElement): void {
    // 获取当前 categorizing 功能的解析配置
    const resolvedConfig = this.context.configManager.resolveFeatureConfig('categorizing');
    const currentProvider = resolvedConfig?.provider;
    const currentModel = resolvedConfig?.model;

    const bindingSetting = new Setting(containerEl)
      .setName('AI 模型')
      .setDesc('选择用于分类匹配的 AI 模型');

    // 使用自定义 select 元素支持 optgroup
    bindingSetting.addDropdown(dropdown => {
      const selectEl = dropdown.selectEl;
      selectEl.empty();

      // 设置最小宽度
      selectEl.style.minWidth = '200px';

      // 添加空选项（不绑定）
      const emptyOption = selectEl.createEl('option', {
        value: '',
        text: '未绑定'
      });
      emptyOption.setAttribute('value', '');

      // 按供应商分组添加选项
      const providers = this.context.configManager.getProviders();
      providers.forEach(provider => {
        if (provider.models.length === 0) return;

        // 创建 optgroup
        const optgroup = selectEl.createEl('optgroup', { attr: { label: provider.name } });

        // 添加模型选项
        provider.models.forEach(model => {
          const displayName = model.displayName || model.name;
          const option = optgroup.createEl('option', {
            value: `${provider.id}|${model.id}`,
            text: displayName
          });
          option.setAttribute('value', `${provider.id}|${model.id}`);
        });
      });

      // 设置当前值
      const currentValue = currentProvider && currentModel
        ? `${currentProvider.id}|${currentModel.id}`
        : '';
      selectEl.value = currentValue;

      // 监听变化
      dropdown.onChange(async (value) => {
        if (!value) {
          // 清除绑定
          delete this.context.plugin.settings.featureBindings.categorizing;
        } else {
          const [providerId, modelId] = value.split('|');
          const existingBinding = this.context.plugin.settings.featureBindings.categorizing;
          this.context.plugin.settings.featureBindings.categorizing = {
            providerId,
            modelId,
            promptTemplate: existingBinding?.promptTemplate ?? this.context.plugin.settings.archiving.promptTemplate
          };
        }
        await this.saveSettings();
        this.refreshDisplay();
      });
    });

    // 显示当前绑定状态
    if (currentProvider && currentModel) {
      const displayName = currentModel.displayName || currentModel.name;
      const statusEl = containerEl.createDiv({ cls: 'feature-binding-status' });
      statusEl.setCssProps({
        'font-size': '0.85em',
        color: 'var(--text-muted)',
        'margin-top': '8px',
        'margin-bottom': '16px',
        padding: '8px 12px',
        'background-color': 'var(--background-primary)',
        'border-radius': '4px'
      });
      statusEl.setText(`当前使用：${currentProvider.name} / ${displayName}`);
    } else {
      // 显示警告：未绑定模型
      const warningEl = containerEl.createDiv({ cls: 'feature-binding-warning' });
      warningEl.setCssProps({
        'font-size': '0.85em',
        color: 'var(--text-error)',
        'margin-top': '8px',
        'margin-bottom': '16px',
        padding: '8px 12px',
        'background-color': 'var(--background-primary)',
        'border-radius': '4px'
      });
      warningEl.setText('⚠️ 未绑定 AI 模型，智能归档功能将无法使用。请先在「通用设置」中添加供应商和模型，然后在此处绑定。');
    }
  }

  /**
   * 渲染归档设置
   */
  private renderArchivingSettings(containerEl: HTMLElement): void {
    // 确保配置存在
    if (!this.context.plugin.settings.archiving) {
      this.context.plugin.settings.archiving = { ...DEFAULT_ARCHIVING_SETTINGS };
    }

    const archivingCard = containerEl.createDiv();
    archivingCard.style.padding = '16px';
    archivingCard.style.borderRadius = '8px';
    archivingCard.style.backgroundColor = 'var(--background-secondary)';
    archivingCard.style.marginBottom = '10px';

    new Setting(archivingCard)
      .setName('智能归档')
      .setDesc('使用AI自动匹配分类并归档笔记')
      .setHeading();

    const settings = this.context.plugin.settings.archiving;

    // AI 模型配置
    this.renderArchivingModelBinding(archivingCard);

    // 启用归档
    new Setting(archivingCard)
      .setName('启用智能归档')
      .setDesc('开启后可以使用AI分类匹配和自动归档功能')
      .addToggle(toggle => toggle
        .setValue(settings.enabled)
        .onChange(async (value) => {
          settings.enabled = value;
          await this.saveSettings();
          this.refreshDisplay();
        }));

    if (!settings.enabled) {
      return; // 如果未启用，不显示其他选项
    }

    // 归档基础文件夹
    new Setting(archivingCard)
      .setName('归档基础文件夹')
      .setDesc('笔记归档的目标文件夹路径')
      .addText(text => text
        .setPlaceholder('03-归档区')
        .setValue(settings.baseFolder)
        .onChange(async (value) => {
          settings.baseFolder = value;
          await this.saveSettings();
        }));

    // 最小置信度
    new Setting(archivingCard)
      .setName('最小置信度')
      .setDesc('AI匹配分类的最小置信度（0-1），低于此值会提示用户')
      .addSlider(slider => slider
        .setLimits(0.5, 1, 0.05)
        .setValue(settings.minConfidence)
        .setDynamicTooltip()
        .onChange(async (value) => {
          settings.minConfidence = value;
          await this.saveSettings();
        }));

    // 允许创建新分类
    new Setting(archivingCard)
      .setName('允许创建新分类')
      .setDesc('当没有合适的分类时，是否允许AI创建新的分类文件夹')
      .addToggle(toggle => toggle
        .setValue(settings.createNewCategories)
        .onChange(async (value) => {
          settings.createNewCategories = value;
          await this.saveSettings();
        }));

    // 归档前确认
    new Setting(archivingCard)
      .setName('归档前确认')
      .setDesc('归档文件前显示确认对话框')
      .addToggle(toggle => toggle
        .setValue(settings.confirmBeforeArchive)
        .onChange(async (value) => {
          settings.confirmBeforeArchive = value;
          await this.saveSettings();
        }));

    // 同时移动附件
    new Setting(archivingCard)
      .setName('同时移动附件')
      .setDesc('归档时将笔记的附件（图片、PDF等）一起移动')
      .addToggle(toggle => toggle
        .setValue(settings.moveAttachments)
        .onChange(async (value) => {
          settings.moveAttachments = value;
          await this.saveSettings();
        }));

    // 自动更新链接
    new Setting(archivingCard)
      .setName('自动更新链接')
      .setDesc('归档后自动更新其他笔记中指向此笔记的双向链接')
      .addToggle(toggle => toggle
        .setValue(settings.updateLinks)
        .onChange(async (value) => {
          settings.updateLinks = value;
          await this.saveSettings();
        }));

    // 界面显示设置
    new Setting(archivingCard)
      .setName('界面显示')
      .setHeading();

    new Setting(archivingCard)
      .setName('命令面板')
      .setDesc('在命令面板中显示"智能归档笔记"命令')
      .addToggle(toggle => toggle
        .setValue(settings.showInCommandPalette)
        .onChange(async (value) => {
          settings.showInCommandPalette = value;
          await this.saveSettings();
        }));

    new Setting(archivingCard)
      .setName('编辑器右键菜单')
      .setDesc('在编辑器右键菜单中显示"智能归档"选项')
      .addToggle(toggle => toggle
        .setValue(settings.showInEditorMenu)
        .onChange(async (value) => {
          settings.showInEditorMenu = value;
          await this.saveSettings();
        }));

    new Setting(archivingCard)
      .setName('文件浏览器右键菜单')
      .setDesc('在文件浏览器右键菜单中显示"智能归档"选项')
      .addToggle(toggle => toggle
        .setValue(settings.showInFileMenu)
        .onChange(async (value) => {
          settings.showInFileMenu = value;
          await this.saveSettings();
        }));

    // Prompt模板
    new Setting(archivingCard)
      .setName('Prompt 模板')
      .setDesc('AI分类匹配时使用的提示词模板（高级）')
      .addTextArea(text => {
        text
          .setValue(settings.promptTemplate)
          .onChange(async (value) => {
            settings.promptTemplate = value;
            await this.saveSettings();
          });
        text.inputEl.rows = 10;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontFamily = 'var(--font-monospace)';
        text.inputEl.style.fontSize = '12px';
      });

    // 重置按钮
    new Setting(archivingCard)
      .setName('重置为默认值')
      .setDesc('恢复智能归档的所有默认设置')
      .addButton(button => button
        .setButtonText('重置')
        .onClick(async () => {
          this.context.plugin.settings.archiving = { ...DEFAULT_ARCHIVING_SETTINGS };
          await this.saveSettings();
          this.refreshDisplay();
        }));
  }
}

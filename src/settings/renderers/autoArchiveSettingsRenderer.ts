/**
 * 自动归档设置渲染器
 * 负责渲染自动归档配置
 */

import { Setting, Notice } from 'obsidian';
import type { RendererContext } from '../types';
import { BaseSettingsRenderer } from './baseRenderer';
import { DEFAULT_AUTO_ARCHIVE_SETTINGS } from '../settings';
import { t } from '../../i18n';

/**
 * 自动归档设置渲染器
 */
export class AutoArchiveSettingsRenderer extends BaseSettingsRenderer {
  /**
   * 渲染自动归档设置
   * @param context 渲染器上下文
   */
  render(context: RendererContext): void {
    this.context = context;
    const containerEl = context.containerEl;

    // 统一初始化 autoArchive 设置，避免后续重复空值检查
    if (!this.context.plugin.settings.autoArchive) {
      this.context.plugin.settings.autoArchive = { ...DEFAULT_AUTO_ARCHIVE_SETTINGS };
    }

    // 功能说明
    this.renderDescription(containerEl);

    // 主要设置
    this.renderMainSettings(containerEl);

    // 高级设置
    this.renderAdvancedSettings(containerEl);
  }

  /**
   * 渲染功能说明
   */
  private renderDescription(containerEl: HTMLElement): void {
    const descCard = containerEl.createDiv({ cls: 'settings-card' });

    descCard.createEl('h3', {
      text: t('autoArchive.settings.title'),
      attr: { style: 'margin-top: 0; margin-bottom: 8px;' }
    });

    const desc = descCard.createEl('p', {
      attr: { style: 'margin: 0; color: var(--text-muted); line-height: 1.5;' }
    });
    desc.innerHTML = t('autoArchive.settings.descriptionHtml');
  }

  /**
   * 渲染主要设置
   */
  private renderMainSettings(containerEl: HTMLElement): void {
    const card = containerEl.createDiv({ cls: 'settings-card' });

    new Setting(card)
      .setName(t('autoArchive.settings.mainSettings'))
      .setHeading();

    // 启用/禁用自动归档
    new Setting(card)
      .setName(t('autoArchive.settings.enabled'))
      .setDesc(t('autoArchive.settings.enabledDesc'))
      .addToggle(toggle => toggle
        .setValue(this.context.plugin.settings.autoArchive.enabled ?? false)
        .onChange(async (value) => {
          this.context.plugin.settings.autoArchive.enabled = value;
          await this.context.plugin.saveSettings();

          // 提示用户重新加载插件
          new Notice(t('autoArchive.notices.reloadRequired'));
        })
      );

    // 触发字段名
    new Setting(card)
      .setName(t('autoArchive.settings.triggerField'))
      .setDesc(t('autoArchive.settings.triggerFieldDesc'))
      .addText(text => text
        .setPlaceholder(t('autoArchive.settings.triggerFieldPlaceholder'))
        .setValue(this.context.plugin.settings.autoArchive.triggerField || 'status')
        .onChange(async (value) => {
          this.context.plugin.settings.autoArchive.triggerField = value || 'status';
          await this.context.plugin.saveSettings();
        })
      );

    // 触发状态值
    new Setting(card)
      .setName(t('autoArchive.settings.triggerStatus'))
      .setDesc(t('autoArchive.settings.triggerStatusDesc'))
      .addText(text => text
        .setPlaceholder(t('autoArchive.settings.triggerStatusPlaceholder'))
        .setValue(this.context.plugin.settings.autoArchive.triggerStatus || 'finish')
        .onChange(async (value) => {
          this.context.plugin.settings.autoArchive.triggerStatus = value || 'finish';
          await this.context.plugin.saveSettings();
        })
      );

    // 自动生成标签
    new Setting(card)
      .setName(t('autoArchive.settings.generateTags'))
      .setDesc(t('autoArchive.settings.generateTagsDesc'))
      .addToggle(toggle => toggle
        .setValue(this.context.plugin.settings.autoArchive.generateTags ?? true)
        .onChange(async (value) => {
          this.context.plugin.settings.autoArchive.generateTags = value;
          await this.context.plugin.saveSettings();
        })
      );

    // 执行自动归档
    new Setting(card)
      .setName(t('autoArchive.settings.performArchive'))
      .setDesc(t('autoArchive.settings.performArchiveDesc'))
      .addToggle(toggle => toggle
        .setValue(this.context.plugin.settings.autoArchive.performArchive ?? true)
        .onChange(async (value) => {
          this.context.plugin.settings.autoArchive.performArchive = value;
          await this.context.plugin.saveSettings();
        })
      );
  }

  /**
   * 渲染高级设置
   */
  private renderAdvancedSettings(containerEl: HTMLElement): void {
    const card = containerEl.createDiv({ cls: 'settings-card' });

    new Setting(card)
      .setName(t('autoArchive.settings.advancedSettings'))
      .setHeading();

    // 去抖动延迟
    new Setting(card)
      .setName(t('autoArchive.settings.debounceDelay'))
      .setDesc(t('autoArchive.settings.debounceDelayDesc'))
      .addText(text => text
        .setPlaceholder(t('autoArchive.settings.debounceDelayPlaceholder'))
        .setValue(String(this.context.plugin.settings.autoArchive.debounceDelay || 2000))
        .onChange(async (value) => {
          const delay = parseInt(value) || 2000;
          this.context.plugin.settings.autoArchive.debounceDelay = delay;
          await this.context.plugin.saveSettings();
        })
      );

    // 排除文件夹
    new Setting(card)
      .setName(t('autoArchive.settings.excludeFolders'))
      .setDesc(t('autoArchive.settings.excludeFoldersDesc'))
      .addTextArea(text => {
        text.inputEl.style.width = '100%';
        text.inputEl.style.minHeight = '80px';
        text.inputEl.style.fontFamily = 'var(--font-monospace)';
        text
          .setPlaceholder(t('autoArchive.settings.excludeFoldersPlaceholder'))
          .setValue((this.context.plugin.settings.autoArchive.excludeFolders || []).join('\n'))
          .onChange(async (value) => {
            const folders = value.split('\n').map(f => f.trim()).filter(f => f.length > 0);
            this.context.plugin.settings.autoArchive.excludeFolders = folders;
            await this.context.plugin.saveSettings();
          });
      });

    // 使用示例
    const exampleCard = containerEl.createDiv({ cls: 'settings-card-bordered' });

    exampleCard.createEl('h4', {
      text: t('autoArchive.settings.exampleTitle'),
      attr: { style: 'margin-top: 0; margin-bottom: 12px;' }
    });

    const example = exampleCard.createEl('pre', {
      attr: { style: 'margin: 0; padding: 12px; background: var(--background-primary); border-radius: 4px; overflow-x: auto; font-family: var(--font-monospace); font-size: 12px;' }
    });
    example.innerHTML = `<code>${t('autoArchive.settings.exampleCode')}</code>`;

    const note = exampleCard.createEl('p', {
      attr: { style: 'margin-top: 12px; margin-bottom: 0; color: var(--text-muted); font-size: 13px;' }
    });
    note.innerHTML = t('autoArchive.settings.exampleNote');
  }
}

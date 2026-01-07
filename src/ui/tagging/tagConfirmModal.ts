/**
 * TagConfirmModal - 标签生成确认对话框
 * 显示AI生成的标签，允许用户编辑后应用
 */

import { App, Modal, Setting } from 'obsidian';
import { t } from '../../i18n';

/**
 * 标签确认对话框
 */
export class TagConfirmModal extends Modal {
  private tags: string[];
  private existingTags: Set<string>; // 原有标签集合
  private onConfirm: (tags: string[]) => void;
  private onCancel: () => void;
  private resolved = false;
  private tagInputs: HTMLInputElement[] = [];

  constructor(
    app: App,
    tags: string[],
    onConfirm: (tags: string[]) => void,
    onCancel?: () => void,
    existingTags: string[] = [] // 新增：原有标签参数
  ) {
    super(app);
    this.tags = [...tags]; // 复制数组，避免直接修改
    this.existingTags = new Set(existingTags.map(t => t.toLowerCase())); // 存储原有标签（小写用于比较）
    this.onConfirm = onConfirm;
    this.onCancel = onCancel || (() => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // 设置弹窗宽度
    this.modalEl.style.width = '500px';
    this.modalEl.style.maxWidth = '90vw';

    // 标题
    new Setting(contentEl)
      .setName('AI 生成的标签')
      .setDesc('您可以编辑、添加或删除标签')
      .setHeading();

    // 标签列表容器
    const tagsContainer = contentEl.createDiv({ cls: 'tag-confirm-container' });
    tagsContainer.style.marginBottom = '16px';
    tagsContainer.style.maxHeight = '400px';
    tagsContainer.style.overflowY = 'auto';

    // 渲染标签输入框
    this.renderTagInputs(tagsContainer);

    // 添加标签按钮
    const addButtonContainer = contentEl.createDiv({ cls: 'add-tag-button-container' });
    addButtonContainer.style.marginBottom = '16px';

    const addButton = addButtonContainer.createEl('button', {
      text: '+ 添加标签',
      cls: 'mod-cta'
    });
    addButton.style.marginRight = '8px';

    addButton.addEventListener('click', () => {
      this.addTag('');
      this.renderTagInputs(tagsContainer);
    });

    // 按钮容器
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '8px';

    // 取消按钮
    const cancelButton = buttonContainer.createEl('button', { text: '取消' });
    cancelButton.addEventListener('click', () => {
      this.resolved = true;
      this.onCancel();
      this.close();
    });

    // 确认按钮
    const confirmButton = buttonContainer.createEl('button', {
      text: '确认应用',
      cls: 'mod-cta'
    });
    confirmButton.addEventListener('click', () => {
      this.resolved = true;
      const finalTags = this.collectTags();
      this.onConfirm(finalTags);
      this.close();
    });

    // 聚焦第一个输入框
    if (this.tagInputs.length > 0) {
      this.tagInputs[0].focus();
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // 如果对话框被关闭但没有确认或取消，调用取消回调
    if (!this.resolved) {
      this.onCancel();
    }
  }

  /**
   * 渲染标签输入框
   */
  private renderTagInputs(container: HTMLElement) {
    container.empty();
    this.tagInputs = [];

    this.tags.forEach((tag, index) => {
      const tagRow = container.createDiv({ cls: 'tag-input-row' });
      tagRow.style.display = 'flex';
      tagRow.style.alignItems = 'center';
      tagRow.style.marginBottom = '8px';
      tagRow.style.position = 'relative'; // 添加相对定位

      // 检查是否是原有标签
      const isExisting = this.existingTags.has(tag.toLowerCase());

      // 标签输入框
      const input = tagRow.createEl('input', {
        type: 'text',
        value: tag,
        placeholder: '输入标签...'
      });
      input.style.flex = '1';
      input.style.marginRight = '8px';
      input.style.padding = isExisting ? '6px 12px 6px 50px' : '6px 12px'; // 原有标签留出空间给标识
      input.style.backgroundColor = isExisting ? 'var(--background-modifier-form-field-highlighted)' : '';
      input.style.border = isExisting ? '1px solid var(--interactive-accent)' : '';
      input.style.borderRadius = '4px';

      // 如果是原有标签，添加视觉标识
      if (isExisting) {
        const existingBadge = tagRow.createEl('span', {
          text: '原有',
          cls: 'tag-existing-badge'
        });
        existingBadge.style.position = 'absolute';
        existingBadge.style.left = '0';
        existingBadge.style.top = '50%';
        existingBadge.style.transform = 'translateY(-50%)';
        existingBadge.style.marginLeft = '8px';
        existingBadge.style.fontSize = '10px';
        existingBadge.style.padding = '2px 6px';
        existingBadge.style.backgroundColor = 'var(--interactive-accent)';
        existingBadge.style.color = 'var(--text-on-accent)';
        existingBadge.style.borderRadius = '3px';
        existingBadge.style.fontWeight = 'bold';
        existingBadge.style.pointerEvents = 'none';
        existingBadge.style.zIndex = '1';
      }

      this.tagInputs.push(input);

      // 删除按钮
      const deleteButton = tagRow.createEl('button', {
        text: '删除',
        cls: 'mod-warning'
      });
      deleteButton.addEventListener('click', () => {
        this.removeTag(index);
        this.renderTagInputs(container);
      });

      // 回车键确认
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const finalTags = this.collectTags();
          this.resolved = true;
          this.onConfirm(finalTags);
          this.close();
        }
      });
    });
  }

  /**
   * 添加标签
   */
  private addTag(tag: string) {
    this.tags.push(tag);
  }

  /**
   * 删除标签
   */
  private removeTag(index: number) {
    this.tags.splice(index, 1);
  }

  /**
   * 收集所有标签
   */
  private collectTags(): string[] {
    return this.tagInputs
      .map(input => input.value.trim())
      .filter(tag => tag.length > 0);
  }
}

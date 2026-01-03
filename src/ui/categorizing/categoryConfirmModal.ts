/**
 * CategoryConfirmModal - 分类确认对话框
 *
 * 显示AI推荐的分类，允许用户选择、编辑或创建新分类
 */

import { App, Modal, Setting } from 'obsidian';
import { CategorySuggestion } from '../../services/categorizing';

/**
 * 分类确认对话框
 */
export class CategoryConfirmModal extends Modal {
  private suggestions: CategorySuggestion[];
  private selectedSuggestion: CategorySuggestion | null = null;
  private onConfirm: (suggestion: CategorySuggestion | null) => void;
  private customPath: string = '';

  constructor(
    app: App,
    suggestions: CategorySuggestion[],
    onConfirm: (suggestion: CategorySuggestion | null) => void
  ) {
    super(app);
    this.suggestions = suggestions;
    this.onConfirm = onConfirm;

    // 默认选择第一个建议（如果有）
    if (suggestions.length > 0) {
      this.selectedSuggestion = suggestions[0];
    }
  }

  onOpen() {
    const { contentEl } = this;

    // 标题
    contentEl.createEl('h2', { text: '选择归档分类' });

    // 如果没有建议
    if (this.suggestions.length === 0) {
      contentEl.createEl('p', {
        text: '没有找到合适的分类建议，您可以手动输入路径。',
        cls: 'mod-warning',
      });
    } else {
      // 显示建议说明
      contentEl.createEl('p', {
        text: 'AI 为您推荐了以下分类，请选择一个：',
        cls: 'setting-item-description',
      });

      // 渲染分类建议列表
      this.renderSuggestions(contentEl);
    }

    // 自定义路径选项
    this.renderCustomPath(contentEl);

    // 按钮区域
    this.renderButtons(contentEl);
  }

  /**
   * 渲染分类建议列表
   */
  private renderSuggestions(containerEl: HTMLElement): void {
    const suggestionsContainer = containerEl.createDiv({ cls: 'category-suggestions' });
    suggestionsContainer.style.marginBottom = '20px';

    this.suggestions.forEach((suggestion, index) => {
      const suggestionItem = suggestionsContainer.createDiv({ cls: 'category-suggestion-item' });
      suggestionItem.style.padding = '12px';
      suggestionItem.style.marginBottom = '8px';
      suggestionItem.style.border = '1px solid var(--background-modifier-border)';
      suggestionItem.style.borderRadius = '4px';
      suggestionItem.style.cursor = 'pointer';
      suggestionItem.style.transition = 'all 0.2s';

      // 选中状态
      if (this.selectedSuggestion === suggestion) {
        suggestionItem.style.backgroundColor = 'var(--interactive-accent)';
        suggestionItem.style.color = 'var(--text-on-accent)';
        suggestionItem.style.borderColor = 'var(--interactive-accent)';
      }

      // 点击选择
      suggestionItem.addEventListener('click', () => {
        this.selectedSuggestion = suggestion;
        this.customPath = ''; // 清空自定义路径
        this.onOpen(); // 重新渲染
      });

      // 鼠标悬停效果
      suggestionItem.addEventListener('mouseenter', () => {
        if (this.selectedSuggestion !== suggestion) {
          suggestionItem.style.backgroundColor = 'var(--background-modifier-hover)';
        }
      });

      suggestionItem.addEventListener('mouseleave', () => {
        if (this.selectedSuggestion !== suggestion) {
          suggestionItem.style.backgroundColor = '';
        }
      });

      // 分类名称和置信度
      const headerRow = suggestionItem.createDiv({ cls: 'suggestion-header' });
      headerRow.style.display = 'flex';
      headerRow.style.justifyContent = 'space-between';
      headerRow.style.alignItems = 'center';
      headerRow.style.marginBottom = '4px';

      const nameEl = headerRow.createEl('strong', { text: suggestion.name });
      nameEl.style.fontSize = '1.1em';

      const confidenceEl = headerRow.createEl('span', {
        text: `${(suggestion.confidence * 100).toFixed(0)}%`,
      });
      confidenceEl.style.fontSize = '0.9em';
      confidenceEl.style.opacity = '0.8';

      // 路径
      const pathEl = suggestionItem.createDiv({ text: suggestion.path });
      pathEl.style.fontSize = '0.85em';
      pathEl.style.opacity = '0.7';
      pathEl.style.marginBottom = '4px';

      // 新建标记
      if (suggestion.isNew) {
        const newBadge = suggestionItem.createEl('span', { text: '新建' });
        newBadge.style.display = 'inline-block';
        newBadge.style.padding = '2px 6px';
        newBadge.style.fontSize = '0.75em';
        newBadge.style.backgroundColor = 'var(--interactive-accent)';
        newBadge.style.color = 'var(--text-on-accent)';
        newBadge.style.borderRadius = '3px';
        newBadge.style.marginRight = '6px';
      }

      // AI推理说明
      if (suggestion.reasoning) {
        const reasoningEl = suggestionItem.createDiv({ text: `💡 ${suggestion.reasoning}` });
        reasoningEl.style.fontSize = '0.85em';
        reasoningEl.style.opacity = '0.8';
        reasoningEl.style.marginTop = '4px';
        reasoningEl.style.fontStyle = 'italic';
      }
    });
  }

  /**
   * 渲染自定义路径输入
   */
  private renderCustomPath(containerEl: HTMLElement): void {
    const customSection = containerEl.createDiv({ cls: 'category-custom-path' });
    customSection.style.marginTop = '20px';
    customSection.style.marginBottom = '20px';

    new Setting(customSection)
      .setName('或手动输入路径')
      .setDesc('输入完整的文件夹路径（例如：03-归档区/技术笔记）')
      .addText(text => {
        text
          .setPlaceholder('例如：03-归档区/技术笔记')
          .setValue(this.customPath)
          .onChange(value => {
            this.customPath = value;
            if (value.trim()) {
              this.selectedSuggestion = null; // 清空选中的建议
            }
          });
        text.inputEl.style.width = '100%';

        // 回车键提交
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.confirm();
          }
        });
      });
  }

  /**
   * 渲染按钮区域
   */
  private renderButtons(containerEl: HTMLElement): void {
    const buttonContainer = containerEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginTop = '20px';

    // 取消按钮
    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    // 确认按钮
    const confirmBtn = buttonContainer.createEl('button', {
      text: '归档',
      cls: 'mod-cta',
    });
    confirmBtn.addEventListener('click', () => {
      this.confirm();
    });
  }

  /**
   * 确认归档
   */
  private confirm(): void {
    let finalSuggestion: CategorySuggestion | null = null;

    if (this.customPath.trim()) {
      // 使用自定义路径
      finalSuggestion = {
        path: this.customPath.trim(),
        name: this.customPath.trim().split('/').pop() || this.customPath.trim(),
        confidence: 1.0,
        isNew: true,
      };
    } else if (this.selectedSuggestion) {
      // 使用选中的建议
      finalSuggestion = this.selectedSuggestion;
    }

    this.onConfirm(finalSuggestion);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

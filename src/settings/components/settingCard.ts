/**
 * 卡片式设置容器组件
 * 提供统一的设置卡片样式
 */

/**
 * 创建卡片式设置容器
 * @param containerEl 父容器元素
 * @returns 卡片容器元素
 */
export function createSettingCard(containerEl: HTMLElement): HTMLElement {
  return containerEl.createDiv({ cls: 'settings-card' });
}

/**
 * 创建带边框样式的卡片容器
 * @param containerEl 父容器元素
 * @returns 卡片容器元素
 */
export function createSettingCardBordered(containerEl: HTMLElement): HTMLElement {
  return containerEl.createDiv({ cls: 'settings-card-bordered' });
}

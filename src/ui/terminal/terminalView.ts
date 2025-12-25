import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { TerminalService } from '../../services/terminal/terminalService';
import { TerminalInstance } from '../../services/terminal/terminalInstance';
import { debugLog, debugWarn, errorLog } from '../../utils/logger';

export const TERMINAL_VIEW_TYPE = 'terminal-view';

/**
 * 终端视图类
 * 每个视图实例管理一个终端实例，使用 Obsidian 原生标签页系统
 * 基于 Rust PTY 服务器和 WebSocket 通信
 */
export class TerminalView extends ItemView {
  private terminalService: TerminalService;
  private terminalInstance: TerminalInstance | null = null;
  private terminalContainer: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, terminalService: TerminalService) {
    super(leaf);
    this.terminalService = terminalService;
  }

  /**
   * 获取视图类型
   */
  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  /**
   * 获取显示文本
   */
  getDisplayText(): string {
    if (this.terminalInstance) {
      return this.terminalInstance.getTitle();
    }
    return '终端';
  }

  /**
   * 获取图标
   */
  getIcon(): string {
    return 'terminal';
  }

  /**
   * 视图打开时初始化
   */
  async onOpen(): Promise<void> {
    // 获取视图内容容器
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('terminal-view-container');
    
    // 移除默认的内边距，确保容器占满整个空间
    const containerEl = container as HTMLElement;
    containerEl.style.padding = '0';
    containerEl.style.margin = '0';
    containerEl.style.height = '100%';
    containerEl.style.width = '100%';
    containerEl.style.display = 'flex';
    containerEl.style.flexDirection = 'column';
    containerEl.style.overflow = 'hidden';

    // 创建终端容器
    this.terminalContainer = container.createDiv('terminal-container');
    this.terminalContainer.style.flex = '1';
    this.terminalContainer.style.minHeight = '0';
    this.terminalContainer.style.overflow = 'hidden';

    // 初始化终端实例
    await this.initializeTerminal();

    // 设置窗口大小调整监听
    this.setupResizeObserver();
  }

  /**
   * 视图关闭时清理资源
   */
  async onClose(): Promise<void> {
    debugLog('[TerminalView] 开始清理视图资源');

    // 断开 ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 销毁终端实例（会自动关闭 WebSocket 连接并清理资源）
    if (this.terminalInstance) {
      try {
        await this.terminalService.destroyTerminal(this.terminalInstance.id);
        debugLog('[TerminalView] 终端实例已销毁');
      } catch (error) {
        errorLog('[TerminalView] 销毁终端实例失败:', error);
      } finally {
        this.terminalInstance = null;
      }
    }

    // 清空容器
    this.containerEl.empty();
    debugLog('[TerminalView] 视图清理完成');
  }

  /**
   * 初始化终端实例
   */
  private async initializeTerminal(): Promise<void> {
    try {
      // 创建新的终端实例（会自动连接到 PTY 服务器）
      this.terminalInstance = await this.terminalService.createTerminal();

      // 监听标题变化
      this.terminalInstance.onTitleChange(() => {
        // 触发视图更新以反映新标题
        this.leaf.view = this;
      });

      // 先应用背景图片样式（创建背景层）
      this.applyBackgroundImage();
      
      // 应用文本透明度
      this.applyTextOpacity();
      
      // 再渲染终端（文字层）
      this.renderTerminal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorLog('[TerminalView] 初始化终端失败:', errorMessage);
      new Notice(`❌ 无法初始化终端: ${errorMessage}`);
      
      // 初始化失败时关闭视图
      this.leaf.detach();
    }
  }

  /**
   * 应用背景图片样式
   */
  private applyBackgroundImage(): void {
    if (!this.terminalContainer || !this.terminalInstance) {
      debugWarn('[TerminalView] 无法应用背景：容器或实例不存在');
      return;
    }

    const options = (this.terminalInstance as any).options;
    
    // 如果使用 Obsidian 主题，不应用自定义背景
    if (options?.useObsidianTheme) {
      debugLog('[TerminalView] 使用 Obsidian 主题，跳过自定义背景');
      return;
    }
    
    // 如果使用 WebGL 渲染器，不应用自定义背景（仅 Canvas 支持）
    if (options?.preferredRenderer === 'webgl') {
      debugLog('[TerminalView] 使用 WebGL 渲染器，跳过自定义背景');
      return;
    }
    
    if (!options || !options.backgroundImage) {
      debugLog('[TerminalView] 未设置背景图片，跳过');
      return;
    }

    const {
      backgroundImage,
      backgroundImageOpacity = 0.5,
      backgroundImageSize = 'cover',
      backgroundImagePosition = 'center',
      enableBlur = false,
      blurAmount = 10
    } = options;

    debugLog('[TerminalView] 开始应用背景图片:', {
      backgroundImage,
      backgroundImageOpacity,
      backgroundImageSize,
      backgroundImagePosition,
      enableBlur,
      blurAmount
    });

    // 为容器添加背景图片标记类，使容器背景透明
    this.terminalContainer.addClass('has-background-image');
    const viewContainer = this.containerEl.querySelector('.terminal-view-container');
    if (viewContainer) {
      viewContainer.addClass('has-background-image');
      debugLog('[TerminalView] 已为视图容器添加 has-background-image 类');
    }

    // 创建背景图片层
    const bgLayer = this.terminalContainer.createDiv('terminal-background-image');
    bgLayer.style.position = 'absolute';
    bgLayer.style.top = '0';
    bgLayer.style.left = '0';
    bgLayer.style.width = '100%';
    bgLayer.style.height = '100%';
    bgLayer.style.backgroundImage = `url("${backgroundImage}")`;
    bgLayer.style.backgroundSize = backgroundImageSize;
    bgLayer.style.backgroundPosition = backgroundImagePosition;
    bgLayer.style.backgroundRepeat = 'no-repeat';
    bgLayer.style.pointerEvents = 'none';
    bgLayer.style.zIndex = '0';
    
    // 背景图片层本身保持完全不透明
    bgLayer.style.opacity = '1';
    
    // 创建一个半透明的黑色遮罩层来控制背景亮度
    // backgroundImageOpacity 从 0-0.8
    // 0 -> 遮罩完全不透明（背景很暗）
    // 0.8 -> 遮罩完全透明（背景清晰）
    const overlayOpacity = 1 - backgroundImageOpacity; // 反转：0.8 -> 0.2, 0 -> 1
    
    // 使用伪元素或者叠加层来实现遮罩效果
    // 这里使用 linear-gradient 叠加黑色遮罩
    const overlayGradient = `linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity}))`;
    bgLayer.style.backgroundImage = `${overlayGradient}, url("${backgroundImage}")`;
    
    let filterValue = '';
    
    // 应用毛玻璃效果
    if (enableBlur && blurAmount > 0) {
      filterValue = `blur(${blurAmount}px)`;
      // 扩大背景以避免边缘模糊后出现空白
      bgLayer.style.transform = 'scale(1.1)';
      bgLayer.style.filter = filterValue;
    }

    debugLog('[TerminalView] 背景图片层已创建:', {
      element: bgLayer,
      overlayOpacity,
      backgroundImageOpacity,
      computedStyle: {
        backgroundImage: window.getComputedStyle(bgLayer).backgroundImage,
        opacity: window.getComputedStyle(bgLayer).opacity,
        filter: window.getComputedStyle(bgLayer).filter,
        zIndex: window.getComputedStyle(bgLayer).zIndex,
        position: window.getComputedStyle(bgLayer).position
      }
    });

    debugLog('[TerminalView] 背景图片已应用:', backgroundImage, `(遮罩透明度: ${overlayOpacity.toFixed(2)})`, enableBlur ? `(模糊: ${blurAmount}px)` : '');
  }

  /**
   * 应用文本透明度
   */
  private applyTextOpacity(): void {
    if (!this.terminalContainer || !this.terminalInstance) {
      return;
    }

    const options = (this.terminalInstance as any).options;
    
    // 如果使用 Obsidian 主题，不应用自定义文本透明度
    if (options?.useObsidianTheme) {
      debugLog('[TerminalView] 使用 Obsidian 主题，跳过自定义文本透明度');
      return;
    }
    
    // 如果使用 WebGL 渲染器，不应用自定义文本透明度（仅 Canvas 支持）
    if (options?.preferredRenderer === 'webgl') {
      debugLog('[TerminalView] 使用 WebGL 渲染器，跳过自定义文本透明度');
      return;
    }
    
    // 如果没有设置背景图片，不应用自定义文本透明度
    if (!options?.backgroundImage) {
      debugLog('[TerminalView] 未设置背景图片，跳过自定义文本透明度');
      return;
    }
    
    const textOpacity = options?.textOpacity ?? 1.0;

    debugLog('[TerminalView] 应用文本透明度:', textOpacity);

    // 为终端容器添加自定义属性，用于 CSS 选择器
    this.terminalContainer.style.setProperty('--terminal-text-opacity', String(textOpacity));
  }

  /**
   * 渲染终端
   */
  private renderTerminal(): void {
    if (!this.terminalContainer || !this.terminalInstance) {
      errorLog('[TerminalView] 渲染失败：容器或实例为空', {
        hasContainer: !!this.terminalContainer,
        hasInstance: !!this.terminalInstance
      });
      return;
    }

    debugLog('[TerminalView] 开始渲染终端');
    debugLog('[TerminalView] 容器信息:', {
      clientWidth: this.terminalContainer.clientWidth,
      clientHeight: this.terminalContainer.clientHeight,
      offsetWidth: this.terminalContainer.offsetWidth,
      offsetHeight: this.terminalContainer.offsetHeight,
      scrollWidth: this.terminalContainer.scrollWidth,
      scrollHeight: this.terminalContainer.scrollHeight
    });

    // 保存背景层引用
    const bgLayer = this.terminalContainer.querySelector('.terminal-background-image');
    
    // 清空容器
    this.terminalContainer.empty();
    
    // 如果有背景层，重新添加到容器底部
    if (bgLayer) {
      this.terminalContainer.appendChild(bgLayer);
    }

    // 附加终端实例到容器（会创建在背景层之上）
    try {
      this.terminalInstance.attachToElement(this.terminalContainer);
      debugLog('[TerminalView] 终端已附加到容器');
    } catch (error) {
      errorLog('[TerminalView] 附加终端失败:', error);
      new Notice(`❌ 终端渲染失败: ${error}`);
      return;
    }
    
    // 延迟调整大小和聚焦，确保 DOM 已完全渲染
    setTimeout(() => {
      if (this.terminalInstance && this.terminalInstance.isAlive()) {
        debugLog('[TerminalView] 延迟调整大小和聚焦');
        this.terminalInstance.fit();
        this.terminalInstance.focus();
      }
    }, 100);
  }

  /**
   * 设置窗口大小调整监听
   */
  private setupResizeObserver(): void {
    if (!this.terminalContainer) {
      return;
    }

    let resizeTimeout: NodeJS.Timeout | null = null;

    this.resizeObserver = new ResizeObserver((entries) => {
      // 使用节流避免频繁调整
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        if (this.terminalInstance && this.terminalInstance.isAlive()) {
          try {
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            
            debugLog('[TerminalView] ResizeObserver 触发，容器尺寸:', { width, height });
            
            // 只有在容器有实际尺寸时才调整
            if (width > 0 && height > 0) {
              this.terminalInstance.fit();
            }
          } catch (error) {
            errorLog('[TerminalView] 调整终端大小失败:', error);
          }
        }
      }, 100);
    });

    this.resizeObserver.observe(this.terminalContainer);
    debugLog('[TerminalView] ResizeObserver 已设置');
  }
}

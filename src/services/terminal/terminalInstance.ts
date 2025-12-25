/**
 * 终端实例类 - 基于 Rust PTY 服务器的 WebSocket 通信实现
 *
 * 核心特性:
 * 1. 完全基于 WebSocket 通信，无需本地 PTY 依赖
 * 2. 改进的重连机制（指数退避）
 * 3. 更好的错误处理和用户提示
 * 4. 支持服务器崩溃恢复
 * 5. 二进制数据支持
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { CanvasAddon } from '@xterm/addon-canvas';
import { WebglAddon } from '@xterm/addon-webgl';
import { platform } from 'os';
import { debugLog, debugWarn, errorLog } from '../../utils/logger';

// 导入 xterm.js 的 CSS
import '@xterm/xterm/css/xterm.css';

/**
 * 终端实例选项
 */
export interface TerminalOptions {
  shellType?: string;
  shellArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  fontSize?: number;
  fontFamily?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  scrollback?: number;
  preferredRenderer?: 'canvas' | 'webgl';
  useObsidianTheme?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  backgroundImageSize?: 'cover' | 'contain' | 'auto';
  backgroundImagePosition?: string;
  enableBlur?: boolean;
  blurAmount?: number;
  textOpacity?: number;
}

/**
 * WebSocket 消息类型
 */
interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

interface EnvMessage {
  type: 'env';
  cwd?: string;
  env?: Record<string, string>;
}

interface InitMessage {
  type: 'init';
  shell_type?: string;
  shell_args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

type WSInputMessage = string | Uint8Array | ResizeMessage | EnvMessage | InitMessage;

/**
 * 终端实例类
 */
export class TerminalInstance {
  readonly id: string;
  readonly shellType: string;

  private xterm: Terminal;
  private fitAddon: FitAddon;
  private renderer: CanvasAddon | WebglAddon | null = null;
  
  // WebSocket 相关属性
  private ws: WebSocket | null = null;
  private serverPort = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  
  private containerEl: HTMLElement | null = null;
  private options: TerminalOptions;
  private title: string;
  private isInitialized = false;
  private isDestroyed = false;

  // 事件回调
  private exitCallback: ((exitCode: number) => void) | null = null;
  private titleChangeCallback: ((title: string) => void) | null = null;

  constructor(options: TerminalOptions = {}) {
    this.id = this.generateId();
    this.options = options;
    this.shellType = options.shellType || 'default';
    this.title = this.shellType;

    // 初始化 xterm.js
    this.xterm = new Terminal({
      cursorBlink: options.cursorBlink ?? true,
      cursorStyle: options.cursorStyle ?? 'block',
      fontSize: options.fontSize ?? 14,
      fontFamily: options.fontFamily ?? 'Consolas, "Courier New", monospace',
      theme: this.getTheme(),
      scrollback: options.scrollback ?? 1000,
      allowTransparency: !!options.backgroundImage, // 有背景图片时启用透明
      convertEol: true,
      windowsMode: platform() === 'win32',
    });

    debugLog('[Terminal] xterm 配置:', {
      allowTransparency: !!options.backgroundImage,
      backgroundImage: options.backgroundImage,
      theme: this.getTheme()
    });

    // 初始化 FitAddon
    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);

    // 初始化 WebLinksAddon
    const webLinksAddon = new WebLinksAddon();
    this.xterm.loadAddon(webLinksAddon);

    // 渲染器将在 xterm.open() 之后根据配置加载
    this.options.preferredRenderer = options.preferredRenderer ?? 'canvas';
    
    debugLog('[Terminal] 终端实例已创建，渲染器类型:', this.options.preferredRenderer);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取终端主题配色
   */
  private getTheme() {
    const { useObsidianTheme, backgroundColor, foregroundColor, backgroundImage } = this.options;

    if (useObsidianTheme) {
      const isDark = document.body.classList.contains('theme-dark');
      return {
        background: isDark ? '#1e1e1e' : '#ffffff',
        foreground: isDark ? '#cccccc' : '#333333',
        cursor: isDark ? '#ffffff' : '#000000',
        cursorAccent: isDark ? '#000000' : '#ffffff',
        selectionBackground: isDark ? '#264f78' : '#add6ff',
      };
    }

    // 如果设置了背景图片，使背景透明
    const bgColor = backgroundImage ? 'transparent' : (backgroundColor || '#000000');
    const isDark = backgroundColor ? this.isColorDark(backgroundColor) : true;
    
    return {
      background: bgColor,
      foreground: foregroundColor || '#FFFFFF',
      cursor: foregroundColor || '#FFFFFF',
      cursorAccent: backgroundColor || '#000000',
      selectionBackground: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
    };
  }

  /**
   * 判断颜色是否为深色
   */
  private isColorDark(color: string): boolean {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }

  /**
   * 加载指定的渲染器
   * 注意：必须在 xterm.open() 之后调用
   * @throws 如果渲染器不支持或加载失败
   */
  private loadRenderer(renderer: 'canvas' | 'webgl'): void {
    // 检查渲染器支持
    if (!this.checkRendererSupport(renderer)) {
      throw new Error(`${renderer.toUpperCase()} 渲染器不支持，请检查浏览器兼容性`);
    }

    // 加载渲染器
    try {
      if (renderer === 'canvas') {
        this.renderer = new CanvasAddon();
        this.xterm.loadAddon(this.renderer);
        debugLog('[Terminal] Canvas 渲染器已加载');
      } else if (renderer === 'webgl') {
        const webglAddon = new WebglAddon();
        
        // 监听 WebGL 上下文丢失
        webglAddon.onContextLoss(() => {
          errorLog('[Terminal] WebGL 上下文丢失');
          throw new Error('WebGL 上下文丢失，终端渲染失败');
        });
        
        this.xterm.loadAddon(webglAddon);
        this.renderer = webglAddon;
        debugLog('[Terminal] WebGL 渲染器已加载');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorLog(`[Terminal] ${renderer.toUpperCase()} 渲染器加载失败:`, error);
      throw new Error(`${renderer.toUpperCase()} 渲染器加载失败: ${errorMsg}`);
    }
  }

  /**
   * 检查渲染器是否支持
   */
  private checkRendererSupport(renderer: 'canvas' | 'webgl'): boolean {
    if (renderer === 'canvas') {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        return !!ctx;
      } catch (error) {
        debugWarn('[Terminal] Canvas 2D 检测失败:', error);
        return false;
      }
    }

    if (renderer === 'webgl') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return !!gl;
      } catch (error) {
        debugWarn('[Terminal] WebGL 检测失败:', error);
        return false;
      }
    }

    return false;
  }

  /**
   * 初始化终端实例
   * @param serverPort PTY 服务器端口号
   */
  async initialize(serverPort: number): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.isDestroyed) {
      throw new Error('终端实例已被销毁');
    }

    try {
      this.serverPort = serverPort;

      // 创建 WebSocket 连接
      await this.connectToServer();

      // 设置 xterm.js 事件处理
      this.setupXtermHandlers();

      this.isInitialized = true;
      debugLog('[Terminal] 终端实例初始化成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorLog('[Terminal] 初始化失败:', error);
      this.xterm.write(`\r\n\x1b[1;31m[错误] 无法启动终端\x1b[0m\r\n`);
      this.xterm.write(`\x1b[31m${errorMessage}\x1b[0m\r\n`);
      throw new Error(`终端启动失败: ${errorMessage}`);
    }
  }

  /**
   * 连接到 PTY 服务器
   */
  private async connectToServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isDestroyed) {
        reject(new Error('终端实例已被销毁'));
        return;
      }

      const wsUrl = `ws://127.0.0.1:${this.serverPort}`;
      debugLog('[Terminal] 正在连接到 PTY 服务器:', wsUrl);

      // 设置连接超时（10秒）
      this.connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          this.xterm.write('\r\n\x1b[1;31m[连接超时]\x1b[0m\r\n');
          this.xterm.write('\x1b[31m无法在 10 秒内连接到 PTY 服务器\x1b[0m\r\n');
          reject(new Error('连接超时'));
        }
      }, 10000);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          debugLog('[Terminal] WebSocket 连接成功');
          
          // 清除连接超时
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          this.reconnectAttempts = 0;

          // 发送初始化消息（包含 shell 类型、参数等）
          const initMsg: InitMessage = {
            type: 'init',
            shell_type: this.shellType === 'default' ? undefined : this.shellType,
            shell_args: this.options.shellArgs,
            cwd: this.options.cwd,
            env: this.options.env
          };
          debugLog('[Terminal] 发送初始化消息:', initMsg);
          this.sendMessage(initMsg);

          resolve();
        };

        this.ws.onerror = (error) => {
          errorLog('[Terminal] WebSocket 错误:', error);
          
          // 清除连接超时
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          this.xterm.write('\r\n\x1b[1;31m[连接错误]\x1b[0m\r\n');
          this.xterm.write('\x1b[31m无法连接到 PTY 服务器\x1b[0m\r\n');
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.xterm.write(`\x1b[33m正在重试 (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...\x1b[0m\r\n`);
          }

          reject(new Error('无法连接到 PTY 服务器'));
        };

        this.ws.onmessage = (event) => {
          // PTY 输出 -> xterm 显示
          // 支持文本和二进制数据
          if (typeof event.data === 'string') {
            this.xterm.write(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            this.xterm.write(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            // 处理 Blob 数据
            event.data.arrayBuffer().then(buffer => {
              this.xterm.write(new Uint8Array(buffer));
            });
          }
        };

        this.ws.onclose = (event) => {
          debugLog('[Terminal] WebSocket 连接关闭:', event.code, event.reason);
          
          // 清除连接超时
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          this.handleConnectionClose();
        };

      } catch (error) {
        // 清除连接超时
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }

        errorLog('[Terminal] 创建 WebSocket 失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 设置 xterm.js 事件处理
   */
  private setupXtermHandlers(): void {
    // 用户输入 -> WebSocket
    this.xterm.onData((data) => {
      debugLog('[Terminal] xterm.onData 触发，数据长度:', data.length, '内容:', data.substring(0, 20));
      this.sendMessage(data);
    });

    // 处理二进制输入（粘贴等）
    this.xterm.onBinary((data) => {
      debugLog('[Terminal] xterm.onBinary 触发，数据长度:', data.length);
      // 将 base64 编码的二进制数据转换为 Uint8Array
      const binaryData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      this.sendMessage(binaryData);
    });
  }

  /**
   * 发送消息到 WebSocket
   * 支持文本、二进制和 JSON 消息
   */
  private sendMessage(message: WSInputMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      debugWarn('[Terminal] WebSocket 未连接，无法发送消息，状态:', this.ws?.readyState);
      return;
    }

    try {
      if (typeof message === 'string') {
        debugLog('[Terminal] 发送文本消息，长度:', message.length);
        this.ws.send(message);
      } else if (message instanceof Uint8Array) {
        debugLog('[Terminal] 发送二进制消息，长度:', message.length);
        this.ws.send(message);
      } else {
        // JSON 消息（resize, env 等）
        debugLog('[Terminal] 发送 JSON 消息:', message.type);
        this.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      errorLog('[Terminal] 发送消息失败:', error);
    }
  }

  /**
   * 调整终端大小
   */
  fit(): void {
    if (!this.containerEl) {
      debugWarn('[Terminal] 无法调整大小：容器不存在');
      return;
    }

    try {
      // 检查容器尺寸
      const containerWidth = this.containerEl.clientWidth;
      const containerHeight = this.containerEl.clientHeight;
      
      debugLog('[Terminal] fit() 调用，容器尺寸:', {
        width: containerWidth,
        height: containerHeight
      });

      if (containerWidth === 0 || containerHeight === 0) {
        debugWarn('[Terminal] 容器尺寸为 0，跳过 fit');
        return;
      }

      this.fitAddon.fit();

      debugLog('[Terminal] fit() 完成，终端尺寸:', {
        cols: this.xterm.cols,
        rows: this.xterm.rows
      });

      // 发送 resize 消息到服务器
      const resizeMsg: ResizeMessage = {
        type: 'resize',
        cols: this.xterm.cols,
        rows: this.xterm.rows
      };

      this.sendMessage(resizeMsg);
      debugLog(`[Terminal] 已发送 resize 消息: ${this.xterm.cols}x${this.xterm.rows}`);
    } catch (error) {
      debugWarn('[Terminal] 调整大小失败:', error);
    }
  }

  /**
   * 处理连接关闭
   * 使用指数退避策略进行重连
   */
  private handleConnectionClose(): void {
    if (this.isDestroyed) {
      return;
    }

    // 清除之前的重连定时器
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.xterm.write('\r\n\r\n\x1b[33m[连接已断开]\x1b[0m\r\n');

    // 尝试重连
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // 指数退避：1秒、2秒、4秒
      const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
      
      this.xterm.write(`\x1b[33m正在重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay / 1000} 秒后重试...\x1b[0m\r\n`);

      this.reconnectTimeout = setTimeout(() => {
        this.connectToServer().catch(err => {
          errorLog('[Terminal] 重连失败:', err);
          this.xterm.write('\x1b[31m重连失败\x1b[0m\r\n');
        });
      }, delay);
    } else {
      this.xterm.write('\x1b[31m已达到最大重连次数，无法重新连接到服务器\x1b[0m\r\n');
      this.xterm.write('\x1b[33m请尝试重新打开终端\x1b[0m\r\n');
    }
  }

  /**
   * 处理服务器崩溃
   * 当 PTY 服务器进程崩溃时由 TerminalService 调用
   */
  handleServerCrash(): void {
    if (this.isDestroyed) {
      return;
    }

    // 清除重连定时器
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // 重置重连计数
    this.reconnectAttempts = 0;

    this.xterm.write('\r\n\r\n\x1b[1;31m[服务器已崩溃]\x1b[0m\r\n');
    this.xterm.write('\x1b[33m正在尝试重启服务器...\x1b[0m\r\n');
    this.xterm.write('\x1b[33m服务器重启后将自动重新连接\x1b[0m\r\n');
  }

  /**
   * 销毁终端实例
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // 清除所有定时器
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // 从 DOM 分离
    this.detach();

    // 清理渲染器
    if (this.renderer) {
      try {
        this.renderer.dispose();
      } catch (error) {
        debugLog('[Terminal] 渲染器清理:', error);
      }
      this.renderer = null;
    }

    // 关闭 WebSocket 连接
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Terminal destroyed');
        }
      } catch (error) {
        errorLog('[Terminal] 关闭 WebSocket 失败:', error);
      } finally {
        this.ws = null;
      }
    }

    // 清理 xterm
    if (this.xterm) {
      try {
        this.xterm.dispose();
      } catch (error) {
        debugLog('[Terminal] xterm 清理:', error);
      }
    }

    debugLog('[Terminal] 终端实例已销毁');
  }

  /**
   * 附加到 DOM 元素
   */
  attachToElement(container: HTMLElement): void {
    if (this.isDestroyed) {
      throw new Error('终端实例已被销毁');
    }

    if (this.containerEl === container) {
      debugLog('[Terminal] 容器已附加，跳过');
      return;
    }

    this.detach();
    this.containerEl = container;
    
    // 确保容器有明确的尺寸
    debugLog('[Terminal] 附加前容器尺寸:', {
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
      offsetWidth: container.offsetWidth,
      offsetHeight: container.offsetHeight,
      scrollWidth: container.scrollWidth,
      scrollHeight: container.scrollHeight,
      computedStyle: {
        display: window.getComputedStyle(container).display,
        width: window.getComputedStyle(container).width,
        height: window.getComputedStyle(container).height,
        flex: window.getComputedStyle(container).flex
      }
    });

    // 先附加到 DOM
    try {
      this.xterm.open(container);
      debugLog('[Terminal] xterm.open() 成功');
    } catch (error) {
      errorLog('[Terminal] xterm.open() 失败:', error);
      throw error;
    }

    debugLog('[Terminal] 已附加到 DOM，xterm 尺寸:', {
      cols: this.xterm.cols,
      rows: this.xterm.rows
    });

    // 检查 xterm 是否真的附加了
    const xtermElement = container.querySelector('.xterm');
    debugLog('[Terminal] .xterm 元素存在:', !!xtermElement);
    if (xtermElement) {
      debugLog('[Terminal] .xterm 元素尺寸:', {
        clientWidth: xtermElement.clientWidth,
        clientHeight: xtermElement.clientHeight
      });
    }

    // 在附加到 DOM 后加载渲染器
    // Canvas 和 WebGL 渲染器需要 DOM 元素已经存在
    const preferredRenderer = this.options.preferredRenderer || 'canvas';
    
    // 延迟加载渲染器，确保 DOM 完全准备好
    setTimeout(() => {
      try {
        debugLog('[Terminal] 开始加载渲染器:', preferredRenderer);
        this.loadRenderer(preferredRenderer);
        
        // 加载后立即调整大小
        debugLog('[Terminal] 渲染器加载完成，调用 fit()');
        this.fit();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errorLog('[Terminal] 渲染器加载失败:', error);
        
        // 在终端中显示错误
        this.xterm.write(`\r\n\x1b[1;31m[渲染器错误]\x1b[0m\r\n`);
        this.xterm.write(`\x1b[31m${errorMsg}\x1b[0m\r\n`);
        this.xterm.write(`\x1b[33m请在设置中更换渲染器类型\x1b[0m\r\n\r\n`);
        
        // 抛出错误，让上层处理
        throw error;
      }
    }, 50);
  }

  /**
   * 从 DOM 分离
   */
  detach(): void {
    if (this.containerEl) {
      this.containerEl.empty();
      this.containerEl = null;
    }
  }

  /**
   * 聚焦终端
   */
  focus(): void {
    if (!this.isDestroyed) {
      this.xterm.focus();
    }
  }

  /**
   * 检查连接是否存活
   */
  isAlive(): boolean {
    return !this.isDestroyed && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 获取标题
   */
  getTitle(): string {
    return this.title;
  }

  /**
   * 设置标题
   */
  setTitle(title: string): void {
    this.title = title;
    if (this.titleChangeCallback) {
      this.titleChangeCallback(title);
    }
  }

  /**
   * 获取工作目录
   */
  getCwd(): string {
    return this.options.cwd || process.env.HOME || process.env.USERPROFILE || process.cwd();
  }

  /**
   * 注册退出回调
   */
  onExit(callback: (exitCode: number) => void): void {
    this.exitCallback = callback;
  }

  /**
   * 注册标题变化回调
   */
  onTitleChange(callback: (title: string) => void): void {
    this.titleChangeCallback = callback;
  }

  /**
   * 获取 xterm 实例
   */
  getXterm(): Terminal {
    return this.xterm;
  }

  /**
   * 获取 FitAddon 实例
   */
  getFitAddon(): FitAddon {
    return this.fitAddon;
  }

  /**
   * 获取当前渲染器类型
   */
  getCurrentRenderer(): 'canvas' | 'webgl' {
    if (!this.renderer) {
      return 'canvas';
    }
    
    if (this.renderer instanceof CanvasAddon) {
      return 'canvas';
    }
    if (this.renderer instanceof WebglAddon) {
      return 'webgl';
    }
    
    return 'canvas';
  }

  /**
   * 更新终端主题（用于动态更新背景等设置）
   */
  updateTheme(): void {
    const newTheme = this.getTheme();
    debugLog('[Terminal] 更新主题:', newTheme);
    this.xterm.options.theme = newTheme;
    this.xterm.options.allowTransparency = !!this.options.backgroundImage;
    
    // 强制刷新终端显示
    this.xterm.refresh(0, this.xterm.rows - 1);
  }
}

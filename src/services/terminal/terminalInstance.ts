/**
 * 终端实例类 - 基于 Rust PTY 服务器的 WebSocket 通信实现
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { CanvasAddon } from '@xterm/addon-canvas';
import { WebglAddon } from '@xterm/addon-webgl';
import { platform } from 'os';
import { debugLog, debugWarn, errorLog } from '../../utils/logger';
import { t } from '../../i18n';

import '@xterm/xterm/css/xterm.css';

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

interface ResizeMessage { type: 'resize'; cols: number; rows: number; }
interface InitMessage { type: 'init'; shell_type?: string; shell_args?: string[]; cwd?: string; env?: Record<string, string>; }
type WSInputMessage = string | Uint8Array | ResizeMessage | InitMessage;

export class TerminalInstance {
  readonly id: string;
  readonly shellType: string;

  private xterm: Terminal;
  private fitAddon: FitAddon;
  private renderer: CanvasAddon | WebglAddon | null = null;
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
  private titleChangeCallback: ((title: string) => void) | null = null;

  constructor(options: TerminalOptions = {}) {
    this.id = `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.options = options;
    this.shellType = options.shellType || 'default';
    this.title = t('terminal.defaultTitle');

    this.xterm = new Terminal({
      cursorBlink: options.cursorBlink ?? true,
      cursorStyle: options.cursorStyle ?? 'block',
      fontSize: options.fontSize ?? 14,
      fontFamily: options.fontFamily ?? 'Consolas, "Courier New", monospace',
      theme: this.getTheme(),
      scrollback: options.scrollback ?? 1000,
      allowTransparency: !!options.backgroundImage,
      convertEol: true,
      windowsMode: platform() === 'win32',
    });

    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);
    this.xterm.loadAddon(new WebLinksAddon());
    this.options.preferredRenderer = options.preferredRenderer ?? 'canvas';
  }

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

  private isColorDark(color: string): boolean {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }

  private loadRenderer(renderer: 'canvas' | 'webgl'): void {
    if (!this.checkRendererSupport(renderer)) {
      throw new Error(t('terminalInstance.rendererNotSupported', { renderer: renderer.toUpperCase() }));
    }

    try {
      if (renderer === 'canvas') {
        this.renderer = new CanvasAddon();
        this.xterm.loadAddon(this.renderer);
      } else {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          errorLog('[Terminal] WebGL context lost');
        });
        this.xterm.loadAddon(webglAddon);
        this.renderer = webglAddon;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errorLog(`[Terminal] ${renderer} renderer failed:`, error);
      throw new Error(t('terminalInstance.rendererLoadFailed', { renderer: renderer.toUpperCase(), message: errorMsg }));
    }
  }

  private checkRendererSupport(renderer: 'canvas' | 'webgl'): boolean {
    try {
      const canvas = document.createElement('canvas');
      if (renderer === 'canvas') {
        return !!canvas.getContext('2d');
      }
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  async initialize(serverPort: number): Promise<void> {
    if (this.isInitialized || this.isDestroyed) return;

    try {
      this.serverPort = serverPort;
      await this.connectToServer();
      this.setupXtermHandlers();
      this.isInitialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorLog('[Terminal] Init failed:', error);
      this.xterm.write(`\r\n\x1b[1;31m[Error] ${errorMessage}\x1b[0m\r\n`);
      throw new Error(t('terminalInstance.startFailed', { message: errorMessage }));
    }
  }

  private async connectToServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isDestroyed) {
        reject(new Error(t('terminalInstance.instanceDestroyed')));
        return;
      }

      const wsUrl = `ws://127.0.0.1:${this.serverPort}`;

      this.connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error(t('terminalInstance.connectionTimeout')));
        }
      }, 10000);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.reconnectAttempts = 0;

          const initMsg: InitMessage = {
            type: 'init',
            shell_type: this.shellType === 'default' ? undefined : this.shellType,
            shell_args: this.options.shellArgs,
            cwd: this.options.cwd,
            env: {
              // 确保 TERM 环境变量存在，否则 clear/vim 等命令无法正常工作
              TERM: process.env.TERM || 'xterm-256color',
              ...this.options.env
            }
          };
          this.sendMessage(initMsg);
          resolve();
        };

        this.ws.onerror = () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.xterm.write('\r\n\x1b[1;31m[Connection Error]\x1b[0m\r\n');
          reject(new Error(t('terminalInstance.cannotConnect')));
        };

        this.ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            this.xterm.write(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            this.xterm.write(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            event.data.arrayBuffer().then(buffer => this.xterm.write(new Uint8Array(buffer)));
          }
        };

        this.ws.onclose = () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.handleConnectionClose();
        };

      } catch (error) {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        reject(error);
      }
    });
  }

  private setupXtermHandlers(): void {
    this.xterm.onData((data) => this.sendMessage(data));
    this.xterm.onBinary((data) => {
      const binaryData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      this.sendMessage(binaryData);
    });
  }

  private sendMessage(message: WSInputMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      if (typeof message === 'string' || message instanceof Uint8Array) {
        this.ws.send(message);
      } else {
        this.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      errorLog('[Terminal] Send failed:', error);
    }
  }

  fit(): void {
    if (!this.containerEl) return;

    try {
      const { clientWidth, clientHeight } = this.containerEl;
      if (clientWidth === 0 || clientHeight === 0) return;

      this.fitAddon.fit();
      this.sendMessage({ type: 'resize', cols: this.xterm.cols, rows: this.xterm.rows });
    } catch (error) {
      debugWarn('[Terminal] Fit failed:', error);
    }
  }

  private handleConnectionClose(): void {
    if (this.isDestroyed) return;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.xterm.write('\r\n\x1b[33m[连接已断开]\x1b[0m\r\n');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
      this.xterm.write(`\x1b[33m正在重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...\x1b[0m\r\n`);

      this.reconnectTimeout = setTimeout(() => {
        this.connectToServer().catch(() => {
          this.xterm.write('\x1b[31m重连失败\x1b[0m\r\n');
        });
      }, delay);
    } else {
      this.xterm.write('\x1b[31m已达到最大重连次数\x1b[0m\r\n');
    }
  }

  handleServerCrash(): void {
    if (this.isDestroyed) return;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;

    this.xterm.write('\r\n\x1b[1;31m[服务器已崩溃]\x1b[0m\r\n');
    this.xterm.write('\x1b[33m正在尝试重启服务器...\x1b[0m\r\n');
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);

    this.detach();

    if (this.renderer) {
      try { this.renderer.dispose(); } catch { /* ignore */ }
      this.renderer = null;
    }

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Terminal destroyed');
        }
      } catch { /* ignore */ }
      this.ws = null;
    }

    try { this.xterm.dispose(); } catch { /* ignore */ }
  }

  attachToElement(container: HTMLElement): void {
    if (this.isDestroyed) {
      throw new Error(t('terminalInstance.instanceDestroyed'));
    }

    if (this.containerEl === container) return;

    this.detach();
    this.containerEl = container;

    try {
      this.xterm.open(container);
    } catch (error) {
      errorLog('[Terminal] xterm.open() failed:', error);
      throw error;
    }

    const preferredRenderer = this.options.preferredRenderer || 'canvas';
    
    setTimeout(() => {
      try {
        this.loadRenderer(preferredRenderer);
        this.fit();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.xterm.write(`\r\n\x1b[1;31m[渲染器错误] ${errorMsg}\x1b[0m\r\n`);
        throw error;
      }
    }, 50);
  }

  detach(): void {
    if (this.containerEl) {
      this.containerEl.empty();
      this.containerEl = null;
    }
  }

  focus(): void {
    if (!this.isDestroyed) this.xterm.focus();
  }

  isAlive(): boolean {
    return !this.isDestroyed && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getTitle(): string { return this.title; }

  setTitle(title: string): void {
    this.title = title;
    this.titleChangeCallback?.(title);
  }

  getCwd(): string {
    return this.options.cwd || process.env.HOME || process.env.USERPROFILE || process.cwd();
  }

  onTitleChange(callback: (title: string) => void): void {
    this.titleChangeCallback = callback;
  }

  getXterm(): Terminal { return this.xterm; }
  getFitAddon(): FitAddon { return this.fitAddon; }

  getCurrentRenderer(): 'canvas' | 'webgl' {
    if (this.renderer instanceof WebglAddon) return 'webgl';
    return 'canvas';
  }

  updateTheme(): void {
    this.xterm.options.theme = this.getTheme();
    this.xterm.options.allowTransparency = !!this.options.backgroundImage;
    this.xterm.refresh(0, this.xterm.rows - 1);
  }
}

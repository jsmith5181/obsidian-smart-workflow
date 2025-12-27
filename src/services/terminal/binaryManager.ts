/**
 * BinaryManager - 管理 Rust PTY 服务器二进制文件
 * 
 * 职责:
 * 1. 平台检测和二进制文件路径解析
 * 2. 从 GitHub Releases 下载二进制文件
 * 3. SHA256 校验和验证
 * 4. Unix 系统文件权限管理
 * 5. 错误处理和用户友好的提示
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { debugLog, errorLog } from '../../utils/logger';
import * as http from 'http';
import { Notice } from 'obsidian';
import { t } from '../../i18n';

/**
 * 平台信息
 */
export interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
}

/**
 * 二进制文件信息
 */
export interface BinaryInfo {
  name: string;           // 二进制文件名
  path: string;           // 完整路径
  isBuiltin: boolean;     // 是否内置
  needsDownload: boolean; // 是否需要下载
}

/**
 * 下载进度回调
 */
export type ProgressCallback = (downloaded: number, total: number, percentage: number) => void;

/**
 * 错误代码
 */
export enum BinaryErrorCode {
  BINARY_MISSING = 'BINARY_MISSING',
  CHECKSUM_FAILED = 'CHECKSUM_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  DISK_SPACE_ERROR = 'DISK_SPACE_ERROR',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
}

/**
 * 二进制管理器错误
 */
export class BinaryManagerError extends Error {
  constructor(
    public code: BinaryErrorCode,
    message: string,
    public downloadUrl?: string
  ) {
    super(message);
    this.name = 'BinaryManagerError';
  }
}

/**
 * 二进制管理器
 */
export class BinaryManager {
  private pluginDir: string;
  private cacheDir: string;
  private version: string;
  private githubRepo: string;
  
  // 内置平台列表（覆盖 95% 用户）
  private readonly builtinPlatforms = [
    'win32-x64',
    'darwin-arm64',
    'linux-x64'
  ];
  
  // 下载重试配置
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 秒

  constructor(pluginDir: string, version: string, githubRepo = 'user/repo') {
    this.pluginDir = pluginDir;
    this.cacheDir = path.join(pluginDir, 'cache');
    this.version = version;
    this.githubRepo = githubRepo;
  }

  /**
   * 确保二进制文件可用
   * 
   * @returns 二进制文件的完整路径
   * @throws BinaryManagerError 如果无法获取二进制文件
   */
  async ensureBinary(): Promise<string> {
    try {
      const platform = this.detectPlatform();
      debugLog('[BinaryManager] 检测到平台:', platform);
      
      const binaryInfo = this.getBinaryInfo(platform);
      debugLog('[BinaryManager] 二进制文件信息:', binaryInfo);
      
      if (binaryInfo.needsDownload) {
        debugLog('[BinaryManager] 二进制文件不存在，开始下载...');
        await this.downloadBinary(platform);
      } else if (!fs.existsSync(binaryInfo.path)) {
        throw new BinaryManagerError(
          BinaryErrorCode.BINARY_MISSING,
          t('binaryManager.builtinBinaryMissing', { path: binaryInfo.path }),
          this.getDownloadUrl(platform)
        );
      }
      
      await this.ensureExecutable(binaryInfo.path);

      return binaryInfo.path;
      
    } catch (error) {
      if (error instanceof BinaryManagerError) {
        throw error;
      }
      
      // 包装未知错误
      throw new BinaryManagerError(
        BinaryErrorCode.BINARY_MISSING,
        t('binaryManager.cannotGetBinary', { message: error instanceof Error ? error.message : String(error) })
      );
    }
  }

  /**
   * 检测当前平台
   * 
   * @returns 平台信息
   * @throws Error 如果平台不受支持
   */
  private detectPlatform(): PlatformInfo {
    const platform = process.platform;
    const arch = process.arch;
    
    // 验证平台
    if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
      throw new Error(t('binaryManager.unsupportedOS', { platform }));
    }
    
    // 验证架构
    if (arch !== 'x64' && arch !== 'arm64') {
      throw new Error(t('binaryManager.unsupportedArch', { arch }));
    }
    
    return {
      platform: platform as 'win32' | 'darwin' | 'linux',
      arch: arch as 'x64' | 'arm64'
    };
  }

  /**
   * 获取二进制文件信息
   * 
   * @param platform 平台信息
   * @returns 二进制文件信息
   */
  private getBinaryInfo(platform: PlatformInfo): BinaryInfo {
    const ext = platform.platform === 'win32' ? '.exe' : '';
    const name = `pty-server-${platform.platform}-${platform.arch}${ext}`;
    
    // 检查是否为内置平台
    const platformKey = `${platform.platform}-${platform.arch}`;
    const isBuiltin = this.builtinPlatforms.includes(platformKey);
    
    // 确定文件路径
    const filePath = isBuiltin
      ? path.join(this.pluginDir, 'binaries', name)
      : path.join(this.cacheDir, name);
    
    // 检查文件是否存在
    const needsDownload = !isBuiltin && !fs.existsSync(filePath);
    
    return {
      name,
      path: filePath,
      isBuiltin,
      needsDownload
    };
  }

  /**
   * 下载二进制文件
   * 
   * @param platform 平台信息
   * @throws BinaryManagerError 如果下载失败
   */
  private async downloadBinary(platform: PlatformInfo): Promise<void> {
    const ext = platform.platform === 'win32' ? '.exe' : '';
    const filename = `pty-server-${platform.platform}-${platform.arch}${ext}`;
    const targetPath = path.join(this.cacheDir, filename);
    
    // 创建缓存目录
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (error) {
        throw new BinaryManagerError(
          BinaryErrorCode.DISK_SPACE_ERROR,
          t('binaryManager.cannotCreateCacheDir', { message: error instanceof Error ? error.message : String(error) })
        );
      }
    }
    
    // 构建下载 URL
    const binaryUrl = this.getDownloadUrl(platform);
    const checksumUrl = `${binaryUrl}.sha256`;
    
    debugLog('[BinaryManager] 下载 URL:', binaryUrl);
    
    // 显示下载通知
    const notice = new Notice(t('binaryManager.downloadingBinary'), 0);
    
    try {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          debugLog(`[BinaryManager] 下载尝试 ${attempt}/${this.maxRetries}`);
          
          // 下载二进制文件
          await this.downloadFile(binaryUrl, targetPath, (downloaded, total, percentage) => {
            notice.setMessage(
              t('binaryManager.downloadProgress', {
                percentage: percentage.toFixed(1),
                downloaded: this.formatBytes(downloaded),
                total: this.formatBytes(total)
              })
            );
          });
          
          // 下载校验和文件
          debugLog('[BinaryManager] 下载校验和文件...');
          const checksum = await this.downloadChecksum(checksumUrl);
          
          debugLog('[BinaryManager] 验证文件完整性...');
          const isValid = await this.verifyChecksum(targetPath, checksum);
          
          if (!isValid) {
            fs.unlinkSync(targetPath);
            throw new BinaryManagerError(
              BinaryErrorCode.CHECKSUM_FAILED,
              t('binaryManager.checksumFailed')
            );
          }
          
          // 下载成功
          notice.hide();
          new Notice(t('binaryManager.downloadComplete'), 3000);
          debugLog('[BinaryManager] 下载成功');
          return;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          errorLog(`[BinaryManager] 下载尝试 ${attempt} 失败:`, lastError);
          
          // 如果是校验失败，不重试
          if (error instanceof BinaryManagerError && error.code === BinaryErrorCode.CHECKSUM_FAILED) {
            throw error;
          }
          
          // 如果还有重试机会，等待后重试
          if (attempt < this.maxRetries) {
            notice.setMessage(t('binaryManager.downloadRetrying', { current: String(attempt), max: String(this.maxRetries) }));
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        }
      }
      
      // 所有重试都失败
      notice.hide();
      throw new BinaryManagerError(
        BinaryErrorCode.NETWORK_ERROR,
        t('binaryManager.downloadFailed', { message: lastError?.message || 'Unknown error', retries: String(this.maxRetries) }),
        binaryUrl
      );
      
    } catch (error) {
      notice.hide();
      
      if (error instanceof BinaryManagerError) {
        throw error;
      }
      
      throw new BinaryManagerError(
        BinaryErrorCode.NETWORK_ERROR,
        `下载失败: ${error instanceof Error ? error.message : String(error)}`,
        binaryUrl
      );
    }
  }

  /**
   * 下载文件
   * 
   * @param url 下载 URL
   * @param targetPath 目标路径
   * @param onProgress 进度回调
   */
  private async downloadFile(
    url: string,
    targetPath: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, (response: http.IncomingMessage) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error(t('binaryManager.redirectUrlEmpty')));
            return;
          }
          debugLog('[BinaryManager] 重定向到:', redirectUrl);
          this.downloadFile(redirectUrl, targetPath, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        
        const fileStream = fs.createWriteStream(targetPath);
        
        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          
          if (onProgress && totalBytes > 0) {
            const percentage = (downloadedBytes / totalBytes) * 100;
            onProgress(downloadedBytes, totalBytes, percentage);
          }
        });
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        
        fileStream.on('error', (error: Error) => {
          fs.unlink(targetPath, () => {
            // 删除部分下载的文件
          });
          reject(error);
        });
      });
      
      request.on('error', (error: Error) => {
        reject(error);
      });
      
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error(t('binaryManager.downloadTimeout')));
      });
    });
  }

  /**
   * 下载校验和文件
   * 
   * @param url 校验和文件 URL
   * @returns SHA256 校验和
   */
  private async downloadChecksum(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, (response: http.IncomingMessage) => {
        if (response.statusCode !== 200) {
          reject(new Error(t('binaryManager.checksumDownloadFailed', { status: String(response.statusCode) })));
          return;
        }
        
        let data = '';
        response.on('data', (chunk: string) => {
          data += chunk;
        });
        
        response.on('end', () => {
          // 校验和文件格式: "checksum filename"
          const checksum = data.trim().split(/\s+/)[0];
          resolve(checksum);
        });
      });
      
      request.on('error', (error: Error) => {
        reject(error);
      });
      
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error(t('binaryManager.checksumDownloadTimeout')));
      });
    });
  }

  /**
   * 验证文件 SHA256 校验和
   * 
   * @param filePath 文件路径
   * @param expectedChecksum 期望的校验和
   * @returns 是否匹配
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      const actualChecksum = hash.digest('hex');
      
      const isValid = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
      
      if (!isValid) {
        errorLog('[BinaryManager] 校验和不匹配:');
        errorLog('  期望:', expectedChecksum);
        errorLog('  实际:', actualChecksum);
      }
      
      return isValid;
    } catch (error) {
      errorLog('[BinaryManager] 校验和验证失败:', error);
      return false;
    }
  }

  /**
   * 确保文件可执行（Unix 系统）
   * 
   * @param filePath 文件路径
   */
  private async ensureExecutable(filePath: string): Promise<void> {
    // Windows 不需要设置可执行权限
    if (process.platform === 'win32') {
      return;
    }
    
    try {
      // 检查文件权限
      const stats = await fs.promises.stat(filePath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      
      if (!isExecutable) {
        debugLog('[BinaryManager] 添加可执行权限:', filePath);
        await fs.promises.chmod(filePath, 0o755);
        debugLog('[BinaryManager] 权限已设置');
      }
    } catch (error) {
      errorLog('[BinaryManager] 设置可执行权限失败:', error);
      throw new BinaryManagerError(
        BinaryErrorCode.PERMISSION_ERROR,
        t('binaryManager.cannotSetPermission', { 
          message: error instanceof Error ? error.message : String(error),
          path: filePath
        })
      );
    }
  }

  /**
   * 获取下载 URL
   * 
   * @param platform 平台信息
   * @returns GitHub Releases 下载 URL
   */
  private getDownloadUrl(platform: PlatformInfo): string {
    const ext = platform.platform === 'win32' ? '.exe' : '';
    const filename = `pty-server-${platform.platform}-${platform.arch}${ext}`;
    return `https://github.com/${this.githubRepo}/releases/download/v${this.version}/${filename}`;
  }

  /**
   * 格式化字节数
   * 
   * @param bytes 字节数
   * @returns 格式化的字符串
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * 检查二进制文件是否存在
   * 
   * @returns 是否存在
   */
  async binaryExists(): Promise<boolean> {
    try {
      const platform = this.detectPlatform();
      const binaryInfo = this.getBinaryInfo(platform);
      return fs.existsSync(binaryInfo.path);
    } catch {
      return false;
    }
  }

  /**
   * 获取二进制文件路径（不下载）
   * 
   * @returns 二进制文件路径，如果不存在则返回 null
   */
  getBinaryPath(): string | null {
    try {
      const platform = this.detectPlatform();
      const binaryInfo = this.getBinaryInfo(platform);
      return fs.existsSync(binaryInfo.path) ? binaryInfo.path : null;
    } catch {
      return null;
    }
  }

  /**
   * 清理缓存目录
   * 
   * @returns 是否成功
   */
  async cleanCache(): Promise<boolean> {
    try {
      if (fs.existsSync(this.cacheDir)) {
        await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
        debugLog('[BinaryManager] 缓存已清理');
        return true;
      }
      return true;
    } catch (error) {
      errorLog('[BinaryManager] 清理缓存失败:', error);
      return false;
    }
  }
}

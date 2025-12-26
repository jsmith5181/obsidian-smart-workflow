/**
 * 开发环境安装脚本
 * 将插件文件复制到 Obsidian 插件目录进行测试
 * 
 * 用法:
 *   node scripts/install-dev.js              # 交互模式
 *   node scripts/install-dev.js -f           # 强制模式（跳过确认）
 *   node scripts/install-dev.js --kill       # 自动关闭 Obsidian 进程
 *   node scripts/install-dev.js -f --kill    # 强制模式 + 自动关闭 Obsidian
 *   node scripts/install-dev.js --reset      # 重置保存的配置
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT_DIR, '.dev-install-config.json');

// 解析命令行参数
const args = process.argv.slice(2);
const FORCE_MODE = args.includes('-f') || args.includes('--force');
const KILL_OBSIDIAN = args.includes('--kill');
const RESET_CONFIG = args.includes('--reset');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 加载保存的配置
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    // 忽略错误
  }
  return {};
}

// 保存配置
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    log(`  ⚠️  无法保存配置: ${e.message}`, 'yellow');
  }
}

// 检测操作系统
function getPlatform() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

// 获取 Obsidian 可执行文件路径
function getObsidianPath() {
  const platform = getPlatform();
  if (platform === 'windows') {
    // Windows 常见安装路径
    const possiblePaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Obsidian', 'Obsidian.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Obsidian', 'Obsidian.exe'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (platform === 'macos') {
    return '/Applications/Obsidian.app';
  } else {
    // Linux - 尝试使用 which 查找
    try {
      return execSync('which obsidian 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch (e) {
      return 'obsidian';
    }
  }
  return null;
}

// 关闭 Obsidian 进程
function killObsidian() {
  const platform = getPlatform();
  try {
    if (platform === 'windows') {
      execSync('taskkill /F /IM Obsidian.exe 2>nul', { stdio: 'ignore' });
    } else {
      execSync('pkill -f Obsidian 2>/dev/null || true', { stdio: 'ignore' });
    }
    log('  ✓ 已关闭 Obsidian 进程', 'green');
    return true;
  } catch (e) {
    // 进程可能不存在，忽略错误
    return false;
  }
}

// 启动 Obsidian
function startObsidian() {
  const platform = getPlatform();
  const obsidianPath = getObsidianPath();
  
  try {
    if (platform === 'windows') {
      if (obsidianPath && fs.existsSync(obsidianPath)) {
        // 使用完整路径启动
        spawn(obsidianPath, [], { detached: true, stdio: 'ignore', shell: true }).unref();
      } else {
        // 尝试通过 explorer 启动 URI scheme
        execSync('start obsidian://', { stdio: 'ignore', shell: true });
      }
    } else if (platform === 'macos') {
      execSync('open -a Obsidian', { stdio: 'ignore' });
    } else {
      spawn('obsidian', [], { detached: true, stdio: 'ignore' }).unref();
    }
    log('  ✓ 已启动 Obsidian', 'green');
    return true;
  } catch (e) {
    log(`  ⚠️  无法自动启动 Obsidian: ${e.message}`, 'yellow');
    return false;
  }
}

// 检查 Obsidian 是否在运行
function isObsidianRunning() {
  const platform = getPlatform();
  try {
    if (platform === 'windows') {
      const result = execSync('tasklist /FI "IMAGENAME eq Obsidian.exe" 2>nul', { encoding: 'utf-8' });
      return result.includes('Obsidian.exe');
    } else {
      const result = execSync('pgrep -f Obsidian 2>/dev/null || echo ""', { encoding: 'utf-8' });
      return result.trim() !== '';
    }
  } catch (e) {
    return false;
  }
}

// 带重试的文件复制
async function copyFileWithRetry(srcPath, destPath, maxRetries = 3, retryDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.copyFileSync(srcPath, destPath);
      return true;
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        if (attempt < maxRetries) {
          log(`  ⚠️  文件被锁定，${retryDelay / 1000}秒后重试 (${attempt}/${maxRetries})...`, 'yellow');
          await sleep(retryDelay);
          continue;
        }
      }
      throw error;
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 创建 readline 接口
let rl = null;
function getReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

function closeReadline() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function question(query) {
  return new Promise(resolve => getReadline().question(query, resolve));
}

async function main() {
  log('\n📦 Obsidian 插件开发安装工具\n', 'cyan');
  
  // 显示当前模式
  if (FORCE_MODE || KILL_OBSIDIAN) {
    const modes = [];
    if (FORCE_MODE) modes.push('强制模式');
    if (KILL_OBSIDIAN) modes.push('自动关闭Obsidian');
    log(`   模式: ${modes.join(' + ')}`, 'gray');
  }

  // 重置配置
  if (RESET_CONFIG) {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
      log('✓ 已重置配置\n', 'green');
    }
    closeReadline();
    process.exit(0);
  }

  // 加载配置
  const config = loadConfig();

  // 1. 检查必需文件
  log('🔍 检查必需文件...', 'cyan');
  
  // 根据平台确定需要的二进制文件
  const platform = getPlatform();
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  let binaryName;
  if (platform === 'windows') {
    binaryName = `pty-server-win32-${arch}.exe`;
  } else if (platform === 'macos') {
    binaryName = `pty-server-darwin-${arch}`;
  } else {
    binaryName = `pty-server-linux-${arch}`;
  }

  const requiredFiles = [
    'main.js',
    'manifest.json',
    'styles.css',
    `binaries/${binaryName}`
  ];

  const missingFiles = [];
  for (const file of requiredFiles) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
      log(`  ❌ 缺少: ${file}`, 'red');
    } else {
      log(`  ✓ ${file}`, 'green');
    }
  }

  if (missingFiles.length > 0) {
    log('\n❌ 错误: 缺少必需文件', 'red');
    log('请先运行以下命令:', 'yellow');
    if (missingFiles.some(f => f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.css'))) {
      log('  pnpm build', 'yellow');
    }
    if (missingFiles.some(f => f.includes('binaries'))) {
      log('  pnpm build:rust', 'yellow');
    }
    closeReadline();
    process.exit(1);
  }

  log('\n✅ 所有必需文件存在\n', 'green');

  // 2. 获取 Obsidian 插件目录
  let pluginDirPath = config.pluginDir;

  if (!pluginDirPath) {
    log('📁 请输入你的 Obsidian 插件目录路径:', 'cyan');
    log('   默认路径示例: C:\\Users\\<用户名>\\AppData\\Roaming\\Obsidian\\<库名>\\plugins', 'yellow');
    log('   或者在 Obsidian 中打开插件目录，复制路径\n', 'yellow');

    const pluginDir = await question('插件目录路径: ');

    if (!pluginDir || pluginDir.trim() === '') {
      log('\n❌ 未提供路径', 'red');
      closeReadline();
      process.exit(1);
    }

    pluginDirPath = pluginDir.trim().replace(/['"]/g, '');
  } else {
    log(`📁 使用保存的插件目录: ${pluginDirPath}`, 'cyan');
    log('   (运行 node scripts/install-dev.js --reset 可重置)\n', 'gray');
  }

  // 验证目录是否存在
  if (!fs.existsSync(pluginDirPath)) {
    log(`\n❌ 目录不存在: ${pluginDirPath}`, 'red');
    // 清除无效的保存配置
    if (config.pluginDir) {
      delete config.pluginDir;
      saveConfig(config);
    }
    closeReadline();
    process.exit(1);
  }

  // 保存有效的目录路径
  if (config.pluginDir !== pluginDirPath) {
    config.pluginDir = pluginDirPath;
    saveConfig(config);
    log('  ✓ 已保存插件目录路径（下次将自动使用）', 'green');
  }

  // 3. 创建插件文件夹
  const targetDir = path.join(pluginDirPath, 'obsidian-smart-workflow');
  
  log(`\n📂 目标目录: ${targetDir}`, 'cyan');

  if (fs.existsSync(targetDir)) {
    if (!FORCE_MODE) {
      const overwrite = await question('\n⚠️  目标目录已存在，是否覆盖? (y/n): ');
      if (overwrite.toLowerCase() !== 'y') {
        log('\n❌ 已取消', 'yellow');
        closeReadline();
        process.exit(0);
      }
    } else {
      log('  ⚠️  目标目录已存在，强制覆盖', 'yellow');
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
    log('  ✓ 创建目标目录', 'green');
  }

  // 4. 如果需要，关闭 Obsidian
  if (KILL_OBSIDIAN && isObsidianRunning()) {
    log('\n🔄 关闭 Obsidian 进程...', 'cyan');
    killObsidian();
    await sleep(1000); // 等待进程完全退出
  }

  // 5. 复制文件
  log('\n📋 复制文件...', 'cyan');

  // 复制核心文件
  const coreFiles = ['main.js', 'manifest.json', 'styles.css'];
  for (const file of coreFiles) {
    const srcPath = path.join(ROOT_DIR, file);
    const destPath = path.join(targetDir, file);
    try {
      await copyFileWithRetry(srcPath, destPath);
      log(`  ✓ ${file}`, 'green');
    } catch (error) {
      log(`  ❌ ${file}: ${error.message}`, 'red');
      closeReadline();
      process.exit(1);
    }
  }

  // 复制二进制文件
  const binariesDir = path.join(targetDir, 'binaries');
  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
  }

  const binaryFiles = fs.readdirSync(path.join(ROOT_DIR, 'binaries'))
    .filter(f => f.startsWith('pty-server-') && !f.endsWith('.md'));

  let hasLockedFile = false;
  for (const file of binaryFiles) {
    const srcPath = path.join(ROOT_DIR, 'binaries', file);
    const destPath = path.join(binariesDir, file);
    try {
      await copyFileWithRetry(srcPath, destPath);
      log(`  ✓ binaries/${file}`, 'green');
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        hasLockedFile = true;
        log(`  ❌ binaries/${file}: 文件被锁定`, 'red');
      } else {
        log(`  ❌ binaries/${file}: ${error.message}`, 'red');
      }
    }
  }

  // 如果有文件被锁定，提示用户
  if (hasLockedFile) {
    log('\n⚠️  部分文件被锁定（可能 Obsidian 正在使用）', 'yellow');
    log('   解决方案:', 'yellow');
    log('   1. 关闭 Obsidian 后重新运行此脚本', 'yellow');
    log('   2. 或使用 --kill 参数自动关闭 Obsidian:', 'yellow');
    log('      node scripts/install-dev.js -f --kill\n', 'cyan');
    closeReadline();
    process.exit(1);
  }

  // 6. 如果之前关闭了 Obsidian，自动重启
  if (KILL_OBSIDIAN) {
    log('\n🚀 重新启动 Obsidian...', 'cyan');
    await sleep(500);
    startObsidian();
  }

  // 7. 完成
  log('\n🎉 安装完成！', 'green');
  
  if (!KILL_OBSIDIAN) {
    log('\n下一步:', 'cyan');
    log('  1. 打开 Obsidian', 'yellow');
    log('  2. 进入设置 → 第三方插件', 'yellow');
    log('  3. 关闭"安全模式"（如果启用）', 'yellow');
    log('  4. 在已安装插件列表中找到 "Smart Workflow"', 'yellow');
    log('  5. 启用插件', 'yellow');
    log('  6. 使用命令面板 (Ctrl+P) 输入 "Terminal" 测试终端功能\n', 'yellow');
  }

  log('💡 提示:', 'cyan');
  log('  - 修改代码后运行 pnpm build，然后在 Obsidian 中重新加载插件', 'yellow');
  log('  - 按 Ctrl+Shift+I 打开开发者工具查看日志', 'yellow');
  log('  - 快速安装: pnpm install:dev:force\n', 'yellow');

  closeReadline();
}

main().catch(error => {
  log(`\n❌ 错误: ${error.message}`, 'red');
  closeReadline();
  process.exit(1);
});

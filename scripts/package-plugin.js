/**
 * 插件打包脚本
 * 打包插件并只包含 3 个内置平台的二进制文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 内置平台（覆盖 95% 用户）
const BUILTIN_PLATFORMS = [
  'win32-x64',
  'darwin-arm64',
  'linux-x64'
];

// 项目路径
const ROOT_DIR = path.join(__dirname, '..');
const BINARIES_DIR = path.join(ROOT_DIR, 'binaries');
const PACKAGE_DIR = path.join(ROOT_DIR, 'plugin-package');

console.log('📦 插件打包脚本');
console.log('');

// 1. 检查必需的文件
console.log('🔍 检查必需文件...');
const requiredFiles = [
  'main.js',
  'manifest.json',
  'styles.css'
];

for (const file of requiredFiles) {
  const filePath = path.join(ROOT_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 错误: 缺少必需文件 ${file}`);
    console.error('请先运行 pnpm build');
    process.exit(1);
  }
}
console.log('✅ 所有必需文件存在');
console.log('');

// 2. 检查内置平台的二进制文件
console.log('🔍 检查内置平台二进制文件...');
const missingBinaries = [];

for (const platform of BUILTIN_PLATFORMS) {
  const ext = platform.startsWith('win32') ? '.exe' : '';
  const binaryName = `pty-server-${platform}${ext}`;
  const binaryPath = path.join(BINARIES_DIR, binaryName);
  
  if (!fs.existsSync(binaryPath)) {
    missingBinaries.push(binaryName);
    console.error(`  ❌ 缺少: ${binaryName}`);
  } else {
    const stats = fs.statSync(binaryPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ ${binaryName} (${sizeMB} MB)`);
  }
}

if (missingBinaries.length > 0) {
  console.error('');
  console.error(`❌ 错误: 缺少 ${missingBinaries.length} 个二进制文件`);
  console.error('请先运行: pnpm build:rust');
  process.exit(1);
}
console.log('✅ 所有内置平台二进制文件存在');
console.log('');

// 3. 清理并创建打包目录
if (fs.existsSync(PACKAGE_DIR)) {
  fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PACKAGE_DIR, { recursive: true });
fs.mkdirSync(path.join(PACKAGE_DIR, 'binaries'), { recursive: true });

console.log('📋 复制文件到打包目录...');

// 4. 复制核心文件
for (const file of requiredFiles) {
  const srcPath = path.join(ROOT_DIR, file);
  const destPath = path.join(PACKAGE_DIR, file);
  fs.copyFileSync(srcPath, destPath);
  console.log(`  ✓ ${file}`);
}

// 5. 复制内置平台二进制文件
for (const platform of BUILTIN_PLATFORMS) {
  const ext = platform.startsWith('win32') ? '.exe' : '';
  const binaryName = `pty-server-${platform}${ext}`;
  const srcPath = path.join(BINARIES_DIR, binaryName);
  const destPath = path.join(PACKAGE_DIR, 'binaries', binaryName);
  
  fs.copyFileSync(srcPath, destPath);
  
  // 复制 SHA256 文件
  const checksumSrc = `${srcPath}.sha256`;
  if (fs.existsSync(checksumSrc)) {
    fs.copyFileSync(checksumSrc, `${destPath}.sha256`);
  }
  
  console.log(`  ✓ binaries/${binaryName}`);
}

console.log('');

// 6. 计算打包体积
console.log('📊 打包体积统计...');
let totalSize = 0;

for (const file of requiredFiles) {
  const filePath = path.join(PACKAGE_DIR, file);
  const stats = fs.statSync(filePath);
  totalSize += stats.size;
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`  ${file}: ${sizeKB} KB`);
}

for (const platform of BUILTIN_PLATFORMS) {
  const ext = platform.startsWith('win32') ? '.exe' : '';
  const binaryName = `pty-server-${platform}${ext}`;
  const binaryPath = path.join(PACKAGE_DIR, 'binaries', binaryName);
  const stats = fs.statSync(binaryPath);
  totalSize += stats.size;
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  ${binaryName}: ${sizeMB} MB`);
}

const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`  总计: ${totalSizeMB} MB`);
console.log('');

// 7. 创建 ZIP 包（可选）
const createZip = process.argv.includes('--zip');
if (createZip) {
  console.log('📦 创建 ZIP 包...');
  
  const zipName = 'obsidian-smart-workflow.zip';
  const zipPath = path.join(ROOT_DIR, zipName);
  
  // 删除旧的 ZIP 文件
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  
  try {
    // 使用 PowerShell Compress-Archive (Windows) 或 zip 命令 (Unix)
    if (process.platform === 'win32') {
      execSync(
        `powershell -Command "Compress-Archive -Path '${PACKAGE_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
        { stdio: 'inherit' }
      );
    } else {
      execSync(
        `cd "${PACKAGE_DIR}" && zip -r "${zipPath}" .`,
        { stdio: 'inherit' }
      );
    }
    
    const zipStats = fs.statSync(zipPath);
    const zipSizeMB = (zipStats.size / 1024 / 1024).toFixed(2);
    console.log(`  ✅ ZIP 创建成功: ${zipName} (${zipSizeMB} MB)`);
  } catch (error) {
    console.error('  ❌ 创建 ZIP 失败:', error.message);
    console.log('  💡 提示: 可以手动压缩 plugin-package/ 目录');
  }
  
  console.log('');
}

console.log('🎉 打包完成！');
console.log(`📁 打包目录: ${PACKAGE_DIR}`);
console.log('');
console.log('📋 内置平台:');
for (const platform of BUILTIN_PLATFORMS) {
  console.log(`  - ${platform}`);
}
console.log('');
console.log('💡 其他平台 (darwin-x64, linux-arm64) 将在首次使用时自动下载');

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * テスト実行時に作成される一時ディレクトリをクリーンアップ
 */
function cleanupTestDirectories() {
  const currentDir = process.cwd();
  const tempTestPattern = /^temp_test_\d+$/;
  
  try {
    const items = fs.readdirSync(currentDir);
    let cleanedCount = 0;
    
    for (const item of items) {
      if (tempTestPattern.test(item)) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`✅ Cleaned up test directory: ${item}`);
            cleanedCount++;
          } catch (error) {
            console.warn(`⚠️  Failed to clean up ${item}: ${error.message}`);
          }
        }
      }
    }
    
    if (cleanedCount === 0) {
      console.log('✨ No test directories to clean up');
    } else {
      console.log(`🧹 Cleaned up ${cleanedCount} test directories`);
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみクリーンアップを実行
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith('cleanup-test-dirs.js');
if (isMainModule) {
  cleanupTestDirectories();
}

export { cleanupTestDirectories };

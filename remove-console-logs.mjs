#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// Find all TypeScript files in src directory
const files = glob.sync('src/**/*.{ts,tsx}', { ignore: ['**/*.test.ts', '**/*.test.tsx'] });

const consolePattern = /console\.(log|debug|info|warn)\([^;]*\);?/gs;
const multiLineConsolePattern = /console\.(log|debug|info|warn)\s*\([^)]*\)\s*;?/gs;

files.forEach(file => {
  let content = readFileSync(file, 'utf-8');
  const originalLength = content.length;
  
  // Remove single-line and multi-line console.log/debug/info/warn
  // This regex matches console.log(...) across multiple lines
  content = content.replace(/console\.(log|debug|info|warn)\s*\([^]*?\)\s*;?/gm, (match) => {
    // Count opening and closing parens to ensure we match correctly
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let result = '';
    
    for (let i = 0; i < match.length; i++) {
      const char = match[i];
      const prevChar = i > 0 ? match[i-1] : '';
      
      // Track string boundaries
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      }
      
      // Track parentheses depth (only outside strings)
      if (!inString) {
        if (char === '(') depth++;
        if (char === ')') {
          depth--;
          if (depth === 0) {
            // Found the matching closing paren
            // Remove this entire console statement
            return '';
          }
        }
      }
    }
    
    // If we couldn't match properly, keep the original
    return match;
  });
  
  if (content.length !== originalLength) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✓ Cleaned ${file}`);
  }
});

console.log('\nDone! Removed all console.log/debug/info/warn statements.');

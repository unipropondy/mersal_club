const fs = require('fs');
const content = fs.readFileSync('c:/Users/User/Desktop/Club_Demo_2026_July/frontend/components/UniversalPrinter.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('isBridgeOnline')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

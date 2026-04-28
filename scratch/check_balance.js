const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');

// Try to parse the content line by line or find the imbalance
let openBraces = 0;
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
    }
    if (openBraces === 0 && i < lines.length - 1) {
        console.log(`JSON closed early at line ${i+1}`);
        console.log(`Context: ${line}`);
    }
}

const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
let openBraces = 0;
for (let i = 0; i < 900; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (openBraces === 0) {
            console.log(`Open braces became 0 at line ${i+1}: ${line}`);
            // Don't exit, let's see how many times it happens
        }
    }
}

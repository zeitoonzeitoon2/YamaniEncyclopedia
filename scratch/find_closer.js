const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
let openBraces = 0;
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (openBraces === 0) {
             console.log(`Open braces became 0 at line ${i+1}, char '${char}'`);
             // Print context
             console.log(`Line content: ${line}`);
             process.exit(0);
        }
    }
}

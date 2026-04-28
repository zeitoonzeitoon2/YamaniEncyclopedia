const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
let openBraces = 0;
console.log("Root start");
openBraces++; // For the root { at line 1
for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
    }
    if (openBraces === 1 && lines[i].trim() === '},') {
         // This is a top-level child ending
    }
    if (openBraces === 0) {
        console.log(`Imbalance detected! Root closed at line ${i+1}`);
        // Let's see the previous few lines
        for (let j = i-5; j <= i; j++) {
            console.log(`${j+1}: ${lines[j]}`);
        }
        process.exit(0);
    }
}

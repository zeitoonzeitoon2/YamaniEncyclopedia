const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '}') {
        const indent = lines[i].indexOf('}');
        if (indent === 0) {
            console.log(`Line ${i+1}: ${lines[i]}`);
        }
    }
}

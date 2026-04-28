const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 900; i < 975; i++) {
    if (lines[i].trim() === '}') {
        console.log(`Line ${i+1}: ${lines[i]}`);
    }
}

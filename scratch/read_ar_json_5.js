const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 1130; i <= 1155; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}

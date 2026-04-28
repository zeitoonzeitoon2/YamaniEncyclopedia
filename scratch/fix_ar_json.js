const fs = require('fs');
const path = 'c:/Users/Hamed/SITEMAN/messages/ar.json';
let content = fs.readFileSync(path, 'utf8');

// The mess looks like:
// "statusDraft": "???      "content": "<p>...
// and then some Arabic text and closing quote on the next line.

// Let's use a regex to find the whole broken part and replace it.
// We know it starts with "statusDraft": and then has a mess including "content":
// until it reaches the next key or end of that block.

const brokenPattern = /"statusDraft":\s*"[^"]*"\s*content\s*":\s*"<p>[\s\S]*?"noDependencies":/m;

// Wait, that might be too complex.
// Let's just look for the specific lines I saw.

const lines = content.split(/\r?\n/);
const startIndex = 925; // line 926 (0-indexed is 925)
const endIndex = 926;   // line 927

console.log("Line 926 before:", lines[startIndex]);
console.log("Line 927 before:", lines[endIndex]);

// Fix line 926
lines[startIndex] = '    "statusDraft": "مسودة",';
// Fix line 927 (which had the tail of the broken string)
lines[endIndex] = '    "noDependencies": "لا توجد متطلبات سابقة لهذه المادة حاليًا.",';

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log("Fixed ar.json");

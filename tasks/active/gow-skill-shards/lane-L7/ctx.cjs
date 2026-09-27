// sa-L76 helper: print text context around a phrase in a file (HTML tags stripped). usage: node ctx.cjs <file> <phrase> [n]
const fs = require('fs');
const [file, phrase, n = '2'] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
let i = -1, k = 0;
while ((i = text.indexOf(phrase, i + 1)) >= 0 && k++ < Number(n)) console.log('...', text.slice(Math.max(0, i - 200), i + 300), '...\n');

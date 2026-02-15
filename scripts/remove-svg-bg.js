const fs = require('fs');
const path = require('path');

const snowmanDir = path.join(__dirname, '../public/snowman-symbol');
const files = fs.readdirSync(snowmanDir).filter(f => f.endsWith('.svg'));

files.forEach(file => {
  const filePath = path.join(snowmanDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove white backgrounds or common patterns
  content = content
    .replace(/fill="#fff(fff)?"/gi, 'fill="none"')
    .replace(/fill="white"/gi, 'fill="none"')
    .replace(/<rect[^>]*fill="#fff(fff)?"[^>]*\/>/gi, '')
    .replace(/<rect[^>]*fill="white"[^>]*\/>/gi, '');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Processed ${file}`);
});

console.log(`\n✨ Done! Processed ${files.length} files.`);

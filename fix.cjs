const fs = require('fs');
let src = fs.readFileSync('server.ts', 'utf8');
const replacements = [
  ['models.image', 'getMergedModels().image'],
  ['models.video', 'getMergedModels().video'],
  ['models.tts', 'getMergedModels().tts'],
  ['models.creative', 'getMergedModels().creative'],
  ['models.multimodal', 'getMergedModels().multimodal'],
  ['models.text', 'getMergedModels().text'],
  ['models.boardroom', 'getMergedModels().boardroom']
];
replacements.forEach(([from, to]) => {
  // Use a regex bounded by non-word chars so we only replace exactly that
  src = src.replace(new RegExp(from.replace('.', '\\.'), 'g'), to);
});
fs.writeFileSync('server.ts', src);
console.log('Replaced successfully');

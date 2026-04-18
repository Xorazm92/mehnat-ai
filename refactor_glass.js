const fs = require('fs');
const glob = require('glob'); // Note: we can just use a simple walk or specify files since we know them
const path = require('path');

const dir = path.join(process.cwd(), 'components');

const walkSync = function(dir, filelist) {
  var files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = walkSync(path.join(dir, file), filelist);
    }
    else {
      if(file.endsWith('.tsx')) {
        filelist.push(path.join(dir, file));
      }
    }
  });
  return filelist;
};

const components = walkSync(dir);

let totalReplaced = 0;

components.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let newContent = content;

  // Replace background and shadow glasses
  newContent = newContent.replace(/liquid-glass-card/g, 'c1-card');
  newContent = newContent.replace(/liquid-glass-sidebar/g, 'c1-card');
  newContent = newContent.replace(/shadow-glass(-\w+)?/g, 'shadow-sm');
  
  // Replace large rounded corners
  newContent = newContent.replace(/rounded-\[[0-9.]+(rem|px)\]/g, 'rounded-sm');
  newContent = newContent.replace(/rounded-2xl/g, 'rounded-sm');
  newContent = newContent.replace(/rounded-3xl/g, 'rounded-sm');
  newContent = newContent.replace(/rounded-xl/g, 'rounded-sm');
  newContent = newContent.replace(/rounded-lg/g, 'rounded-sm');
  
  // Remove blur
  newContent = newContent.replace(/backdrop-blur(-\w+)?/g, '');
  
  // Replace decorative background opacity
  // Note: we do this carefully to not mess up gradients
  newContent = newContent.replace(/bg-white\/[0-9]+/g, 'bg-white dark:bg-[#22252B]');
  
  // Animations
  newContent = newContent.replace(/animate-macos/g, '');
  newContent = newContent.replace(/animate-fade-in(-up)?/g, '');

  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
    totalReplaced++;
    console.log(`Updated ${f}`);
  }
});

console.log(`Total files updated: ${totalReplaced}`);

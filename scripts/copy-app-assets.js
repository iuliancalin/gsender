const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distApp = path.join(root, 'dist', 'gsender', 'app');
const distAppSrc = path.join(distApp, 'src');

fs.mkdirSync(distApp, { recursive: true });
fs.mkdirSync(distAppSrc, { recursive: true });

const copyItems = [
    { src: path.join(root, 'src', 'app', 'favicon.ico'), dest: path.join(distApp, 'favicon.ico') },
    { src: path.join(root, 'src', 'app', 'images'), dest: path.join(distApp, 'images') },
    { src: path.join(root, 'src', 'app', 'assets'), dest: path.join(distApp, 'assets') },
    { src: path.join(root, 'src', 'app', 'src', 'application.css'), dest: path.join(distAppSrc, 'application.css') },
];

for (const item of copyItems) {
    if (fs.existsSync(item.src)) {
        fs.cpSync(item.src, item.dest, { recursive: true, force: true });
    }
}

console.log('App assets & CSS copied successfully to dist/gsender/app');

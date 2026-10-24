
const { defineConfig } = require('vite');
const path = require('node:path');
const fs = require('node:fs');

function copyClassicScripts() {
    return {
        name: 'copy-classic-scripts',
        apply: 'build',

        generateBundle() {
            for (const file of ['auth.js', 'script.js']) {
                const filePath = path.resolve(__dirname, 'frontend', file);

                this.emitFile({
                    type: 'asset',
                    fileName: file,
                    source: fs.readFileSync(filePath, 'utf8')
                });
            }
        }
    };
}

module.exports = defineConfig({
    root: path.resolve(__dirname, 'frontend'),

    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    },

    build: {
        outDir: path.resolve(__dirname, 'dist'),
        emptyOutDir: true
    },

    plugins: [copyClassicScripts()]
});

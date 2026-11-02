// Wraps the artifact build into one HTML fragment (title, styles, Vue from cdnjs, app script).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const js = readFileSync('dist-artifact/app.js', 'utf8')
const css = existsSync('dist-artifact/app.css') ? readFileSync('dist-artifact/app.css', 'utf8') : ''
const html = `<title>IO-470-F Power Planner</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap">
<style>${css}</style>
<div id="app"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.21/vue.global.prod.min.js"></script>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
`
writeFileSync('dist-artifact/io470-power-planner.html', html)
console.log('wrote dist-artifact/io470-power-planner.html', (html.length / 1024).toFixed(0) + ' KB')

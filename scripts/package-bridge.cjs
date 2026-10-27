'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','helper-package');
fs.mkdirSync(output,{recursive:true});
fs.cpSync(path.join(root,'bridge'),path.join(output,'bridge'),{recursive:true});
fs.copyFileSync(path.join(root,'Start-Local-Bridge.cmd'),path.join(output,'Start-Local-Bridge.cmd'));
fs.writeFileSync(path.join(output,'PEHLE-PARHEIN.txt'),`Universal AI Switcher — local helper\n\n1. Node.js 22.13+ aur official Codex / Antigravity installed hon.\n2. Start-Local-Bridge.cmd double-click karein. Window khuli rakhein.\n3. http://127.0.0.1:47831/pair kholain. Open & pair Universal dabayein.\n4. Website mein Connect, phir chats/projects select karke Review transfer karein.\n\nWebsite: https://universal-ai-switcher.vercel.app\nSource: https://github.com/ahmedrajpoot2582-cloud/Universal-AI-Switcher\n\nHelper sirf 127.0.0.1 par chalta hai. Pairing code share na karein.\nHistory local rehti hai. ChatGPT web chats export import se; Antigravity journals project context se aate hain. Native chat bubbles clone nahin hotin.\nPrepare transfer AI request submit nahin karta. Send to Codex quota use karta hai; billing review zaroori hai.\nAntigravity ko stop karke Codex mein continue karein.\n`);
console.log(output);

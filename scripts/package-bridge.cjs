'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local','helper-package');
fs.mkdirSync(output,{recursive:true});
fs.cpSync(path.join(root,'bridge'),path.join(output,'bridge'),{recursive:true});
// The helper ships its small runtime dependencies and never asks the user to run npm install.
for(const name of ['jose','@iarna/toml','jsonc-parser']){
 fs.cpSync(path.join(root,'node_modules',name),path.join(output,'node_modules',name),{recursive:true});
}
const oldLauncher=path.join(output,'Start-Local-Bridge.cmd');if(fs.existsSync(oldLauncher))fs.unlinkSync(oldLauncher);
fs.copyFileSync(path.join(root,'Connect-Universal.cmd'),path.join(output,'Connect-Universal.cmd'));
fs.writeFileSync(path.join(output,'PEHLE-PARHEIN.txt'),`Universal AI Switcher v2.0 — connection-link installer\n\nPrimary flow: website par Connect an AI > Create connection link > Copy AI prompt. Apni coding AI ko dein; woh source-reviewed installer se actual selected project ka MCP setup kar sakti hai.\n\nNode.js 22.13+ required. No pairing code / local pairing page.\n\nAI command: node bridge/link-install.cjs --link <full original private link> --project <actual project folder>\n\nManual fallback: Connect-Universal.cmd khol kar actual project path aur phir private link dein.\n\nLink one-use, 15-minute expiry. MCP credentials private app-data file mein save hote hain; project config mein sirf us file ka path hota hai. Existing settings ka backup save hota hai.\n\nInitial setup is Linked. Actual MCP client initialize/heartbeat ke baad hi website Connected kahegi. App reload/new chat ki zaroorat ho sakti hai.\n\nCodex: all available local public active + archived chats. ChatGPT web: OAuth custom MCP connector + official export ZIP import for old chats. Antigravity: selected public journals/MCP progress; native archive requires export. Native provider passwords/keys/hidden reasoning upload nahin hote.\n\nHistory user ke verified Universal account ki private cloud library mein save hoti hai. No inference or provider API billing is triggered by sync.\n\nWebsite: https://universal-ai-switcher.vercel.app\nSource: https://github.com/ahmedrajpoot2582-cloud/Universal-AI-Switcher\n`);
console.log(output);

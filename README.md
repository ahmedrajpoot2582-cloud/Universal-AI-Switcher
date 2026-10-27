# Universal AI Switcher

A private local bridge with a Vercel web dashboard. Browse supported Codex history, import ChatGPT exports, see Antigravity project journals, select chats/projects, review a handoff, and continue in the next tool.

## Istemal

1. Node.js **22.13+** aur official Codex / Antigravity apne PC par installed hon. Codex mein apne ChatGPT account se sign in karein.
2. Is repo ko download/clone karke **Start-Local-Bridge.cmd** kholain. Helper ko running rakhein. `npm install` helper ke liye zaroori nahin: bridge sirf Node built-ins use karta hai.
3. **http://127.0.0.1:47831/pair** kholain aur **Open & pair Universal** dabayein. Pairing code private rakhein. Browser local network permission maange to khud allow karein.
4. Website par **Connect** se Codex aur Antigravity connect karein. **Projects → Add project** mein Git repository ka poora folder path paste karein.
5. Library se chats aur Projects se folders select karein. Right panel mein destination aur working project choose karke **Review transfer** karein.
6. Antigravity destination: **Prepare in Antigravity → Open Antigravity**. Wahan copied prompt dein. Codex destination: **Prepare in Codex → Open Codex draft**. Draft mein agla request likhein; Send apni alag action hai.

## Asal support aur limitations

- **Codex:** official local `codex app-server`, ChatGPT sign-in, `thread/list` / `thread/read`. Desktop WindowsApps `Codex.exe` CLI nahin hai; resolver usay skip karta hai. Adapter verified CLI family: `codex-cli 0.164.0-alpha.11.1`. Unknown versions fail clearly instead of pretending compatibility.
- **ChatGPT web:** account ki saari browser chats ke liye universal official history API assume nahin ki gayi. Apna `conversations.json` export **Import ChatGPT** se import karein. Import local helper par hota hai, Vercel par nahin. Active branch ke public text messages import hote hain; images/attachments aur hidden reasoning copy nahin hote. Import limit 8 MB, 200 conversations; larger exports split karein.
- **Antigravity:** installed app + explicitly connected project journals and official lifecycle hooks where they actually fire. Native hook receipt aur agent-written summaries alag labels mein dikhte hain. Full native chat-history cloning claim nahin ki gayi. Normal writable turns ka project rule agent se progress/journal save karne ko kehta hai; quota ya interruption par aakhri save miss ho sakta hai.
- **Transfers:** selected public context + project metadata move hota hai, code folders ka cloud upload ya duplicate project migration nahin. Working project same local repository hota hai. Large histories most recent text tak trimmed hoti hain; originals unchanged rehte hain.
- **Return:** Antigravity aur uske background tasks stop karein before Codex. Hooks ke baghair helper IDE ke writes forcefully rok nahin sakta. Native Codex desktop thread errors browser dashboard ke handoff ki receipt nahin hote.
- **Billing:** preparing/importing/reading history inference nahin karta. Send to Codex official subscription turn hai, quota apply hota hai. API keys aur automatic top-ups nahin; extra credit balances, unknown billing or unreviewed billing block inference. UI defaults to read-only. Explicit code mode checkpoints files and shows command/file approval requests.

## Privacy and local trust boundary

The Vercel app is static. There is no cloud history database. The Node bridge binds **127.0.0.1:47831**, checks Host + an exact origin allowlist, requires a random bearer pairing token for all private APIs, restricts readable history to the connected library, and never sends provider credentials to the browser. Private local state lives under `%LOCALAPPDATA%/UniversalAISwitcher/web-bridge` (override with `SWITCHER_BRIDGE_DATA`). Browser pairing lives in sessionStorage and clears when that browser session ends. `/pair` is local and should not be shared. An unpaired public visitor sees no user history. Serving the bridge over a LAN/public tunnel is not supported.

The local allowlist defaults to `bridge/site.json`'s deployed URL plus development loopback origins. Set `SWITCHER_SITE_URL=https://your-production-domain.vercel.app` for another deployment. Changing the website origin needs a helper restart. Only pair a website build you trust: its JavaScript can access the history you authorize on that local device.

Known credentials are redacted as a best effort. Review the handoff before sending it to another AI. Project scripts and approved Codex commands can execute local code; allow only actions you trust. Failed/uncertain turns are not automatically replayed.

## Development

```sh
npm install
npm run dev
npm run bridge
npm test
npm run build
```

Tests cover origin/auth isolation, reasoning/secret filtering, selected-only transfers, CLI-vs-desktop detection, Codex draft creation without inference, real project handoff files, journal import, unknown selection refusal, billing guards and approval queue preservation. Fixtures are not presented as live account data.

## Deploy to Vercel

Vite builds to `dist/`; `vercel.json` supplies routing and headers. Run `vercel link --project universal-ai-switcher` and `vercel deploy --prod`. Vercel hosts only the dashboard. The local helper must run on each user's PC for actual provider access. No API keys or Vercel environment secrets are needed for this architecture.

Official references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Antigravity hooks](https://antigravity.google/docs/hooks), [Antigravity rules](https://antigravity.google/docs/rules), [Vercel deployment](https://vercel.com/docs/cli/deploy).

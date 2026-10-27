# Universal AI Switcher · v2.0

Private AI connection links, remote MCP, actual supported public history aur Projects / Recents library. Pairing-code screen primary flow se hata diya gaya hai.

Live: https://universal-ai-switcher.vercel.app

## Aasaan flow

1. Apne verified Universal account se Login karein.
2. Connect an AI > AI choose karein > Create connection link.
3. Copy AI prompt karke us coding AI ki actual project wali chat mein dein.
4. Compatible coding agent source-reviewed installer se us project ka MCP setup kar sakti hai. Link one-use hai aur 15 minutes mein expire hota hai. Link creation / installation ko Connected nahin kaha jata; actual MCP initialize aur activity chahiye.
5. Native app MCP reload / nayi chat ya permission maange to woh app ka required step hai. Ordinary chat message har host mein MCP khud install nahin kar sakta.
6. Synced records Projects / Recents aur searchable history mein nazar aate hain. Chats / projects select karke Continue in another AI se selected handoff prepare karein.
7. Agli connected AI ko kahein: Universal se latest selected handoff parh kar continue karo.

Sirf aik AI bhi independently connect ho sakti hai. Har connection ka Disconnect token access foran revoke karta hai; saved history mehfooz rehti hai. Website Logout aur AI Disconnect alag actions hain: website logout linked clients ki background access revoke nahin karta. Connection revoke karne ke liye Disconnect use karein.

## Asal support

- Codex: link installer official local codex app-server se ChatGPT account/read verify karta hai. Tamam available active + archived thread/list pages aur full paginated public thread/turns/list text sync hota hai. Native provider credentials / hidden reasoning / tool payloads upload nahin hote. Images / attachments clone nahin hotin. Adapter verified CLI: codex-cli 0.164.0-alpha.11.1. Unknown versions explicit compatibility error dete hain; WindowsApps desktop Codex.exe CLI nahin hai.
- ChatGPT web: guide link https://universal-ai-switcher.vercel.app/connect/chatgpt aur remote MCP URL https://universal-ai-switcher.vercel.app/api/mcp. Custom MCP connector approve karna aur OAuth consent zaroori hai. MCP connection ChatGPT ki native Projects / Recents archive ka automatic reader nahin hai. Purani history ke liye original data-export ZIP ya conversations.json import karein.
- Antigravity: actual MCP client handshake + selected project public journals / MCP progress. Native account-wide archive ka access assume nahin hota; supported exported public history import karein.
- Other MCP apps: link installer standard stdio config deta hai. Remote HTTP clients OAuth 2.1 use kar sakte hain. Agar host user-authorized public-history tools deta hai to actual source records switcher_publish_history / switcher_publish_projects se publish ho sakte hain. Yeh tools source permissions create nahin karte.

Native app identity / plan sirf tab show hoti hai jab adapter ne actually report ki ho. MCP client name/version self-reported hai; vendor identity ka cryptographic proof nahin. Missing account/plan/project metadata ko invent nahin kiya jata.

## History / Projects

ChatGPT imports har conversation ka active public branch read karte hain. Tamam conversations traverse hoti hain; 200-chat / 300-turn cap nahin. Import per file 100 MB compressed aur unpacked JSON tak hai; only conversations.json / projects.json decompress hote hain. ZIP attachments skip hote hain. Structured project IDs/names export mein hon to actual tree banta hai, including empty projects. Export mein names na hon to native ChatGPT folders ka clone claim nahin hota.

Cloud messages stable per-chat ordinal se upsert hote hain. Re-import duplicate chats nahin banata. Large histories batches aur paginated message views se read hoti hain. A single public message over 2 MB explicit partial/error deta hai; silently truncate nahin hota. Partial sync ko complete nahin kaha jata. Website 5 seconds mein state refresh karti hai, local adapter 10 seconds mein refresh/heartbeat karta hai; 45-second-old client offline dikhaya jata hai.

Selected handoff mein chat/project references save hote hain. Destination MCP poori selected conversation ko nextOffset follow karke parh sakta hai. Cross-provider unselected conversation access blocked hai. Original records aur actual code folders unchanged rehte hain. AI tool actions user ke current prompt aur project permissions ke mutabiq hote hain; sync ya handoff preparing inference submit nahin karta.

## Privacy / security

v2 history ab verified Universal account ki PRIVATE cloud library mein save hoti hai, existing free Neon resource par. Purane v1 unscoped local cache ko automatically cloud par upload nahin kiya jata. Naya authorized link / deliberate import data lata hai. Provider passwords, auth files aur API keys is library ka hissa nahin hain.

Browser APIs signed Neon identity JWT signature / issuer / audience / algorithm / expiry / email verification / banned claims check karti hain. Browser writes exact same-origin check karti hain. Neon / Better Auth account verification, unique email signup, password hashing, recovery aur HttpOnly/Secure/SameSite cookies handle karta hai.

Private link key URL FRAGMENT mein hoti hai, HTTP query / Referer mein nahin. Database mein sirf key hash hai; claim atomic, one-use aur expiry-bound hai. Per-connection opaque credentials hashed server-side aur private local app-data file mein rehte hain. Project config mein sirf private file ka path hai. Existing config preserved + backed up; invalid / foreign same-name MCP config link claim se pehle refuse hoti hai. Credentials source repo ya download ZIP mein nahin.

Remote MCP standard SDK Streamable HTTP transport use karta hai. OAuth broker existing verified Neon identity ke saath public-client DCR, exact redirect registration, S256 PKCE, resource binding, one-use 5-minute codes, 15-minute access tokens aur rotating 30-day refresh tokens use karta hai. Disconnect revoked connection ke native aur OAuth tokens block karta hai. Only continuity scope supported hai; registration/link/request rates bounded hain.

Only actual public user/assistant text save karein. Hidden analysis/tool messages filter hote hain aur known credentials best-effort redact hote hain. User-provided history ko untrusted background treat karein. Native apps ki billing / subscriptions unki own policies ke mutabiq hain; tool sync inference, API keys ya automatic credit purchase use nahin karti.

## Installer / development

Node.js 22.13+ required. Download ZIP ke dependencies bundled hain; end user ko npm install nahin chahiye. Primary user sirf AI prompt copy karta hai; coding AI source review ke baad installer chala sakti hai:

node bridge/link-install.cjs --link <original full private link> --project <actual project folder>

Manual fallback: Connect-Universal.cmd project folder aur connection link Node prompt se leta hai. Kisi pairing page ko kholna nahin padta. Old v1 services source mein compatibility tests ke liye hain; retired /pair route ab secret expose nahin karta.

Developer commands: npm install, npm run dev, npm test, npm run build. Server functions api/workspace.js, api/link.js, api/connect.js, api/mcp.js, api/sync.js aur api/oauth.js hain. NEON_AUTH_BASE_URL / DATABASE_URL server environment variables managed integration se milti hain. Browser ko database credentials nahin milte. scripts/migrate-cloud.mjs sirf app-owned uas_* schema create karta hai; existing account tables unchanged rehti hain.

Vercel deploy: vercel deploy --prod. Exact rewrites vercel.json mein hain, including nested auth actions aur OAuth discovery. scripts/package-bridge.cjs installer package banata hai. .env.local, .local, local credentials aur private cache Git/deploy uploads se excluded hain.

## Verification

Tests isolated local PostgreSQL engine par actual production SQL, token claim/replay, full pagination, stable-ID deduplication, owner isolation, PKCE/resource binding, code/refresh replay, disconnect revocation, installer config preservation, SDK HTTP round-trip aur original ChatGPT ZIP import cover karte hain. Real local Codex adapter read-only check inference submit nahin karta. Production mein synthetic history/test accounts insert nahin kiye jate. Live endpoint checks read-only / rejection paths tak limited hain jab tak actual user connection authorize na kare.

Official sources: [OpenAI MCP](https://learn.chatgpt.com/docs/extend/mcp), [Codex App Server](https://learn.chatgpt.com/docs/app-server), [MCP authorization](https://developers.openai.com/plugins/build/auth), [Antigravity MCP](https://antigravity.google/docs/mcp), [Neon Auth](https://neon.com/docs/auth/overview).

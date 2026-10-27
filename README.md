# Universal AI Switcher · v1.2

Real provider connections, verified email accounts, independent connect/disconnect, local history aur selected project handoff. Koi preloaded demo account ya history nahin.

Live: https://universal-ai-switcher.vercel.app

## Istemal

1. Website par Create account se apna naam, email aur naya 12+ character password dein. Inbox ka code Verify email mein enter karein. Aik email par aik account hota hai; agli dafa Login karein. Forgot password se email code ke zariye recovery hoti hai. Google / ChatGPT ka password yahan na dein.
2. Latest local helper ZIP extract karein. Node.js 22.13+ aur official provider app installed ho. Start-Local-Bridge.cmd kholain aur running rakhein. ZIP dependencies bundled hain; npm install nahin chahiye. Source checkout ke liye pehle npm install karein.
3. http://127.0.0.1:47831/pair par Open & pair Universal dabayein. Pairing code private rakhein. Browser local-network permission maange to is computer ke liye allow karein.
4. Codex Connect official app-server se signed-in ChatGPT account verify karta hai. Tamam locally available active aur archived Codex chats actual API se sync hoti hain. Sirf installed binary ya saved preference ko connected nahin kaha jata.
5. Projects / Add project mein apni Git repository ka poora path dein. Antigravity Connect / MCP setup se wahi project select karein. Tool project ki .agents/mcp_config.json mein stdio server add karta hai. Official Antigravity mein wahi trusted project kholain aur MCP reload / nayi chat karein. Actual handshake aur heartbeat ke baad MCP active hoga; pehle Waiting for MCP.
6. Codex MCP setup optional hai: project ki .codex/config.toml update hoti hai. Codex sirf trusted project ki config load karta hai. Codex history sync official app-server se independently chalti hai.
7. Chats/projects select karein, destination choose karein aur Review transfer ke baad context prepare karein. Original native chat bubbles merge nahin hotin. AI prompt send karna alag action hai.

Sirf aik provider independently connect ho sakta hai. Disconnect us provider ki sync/MCP access rokta hai; saved history delete ya official app se logout nahin karta. Logout Universal ka session khatam karta hai aur helper mein seen access tokens revoke karta hai. Har verified account ki local library alag hai. Purana unscoped demo/legacy workspace naye email mein automatically import nahin hota.

## Live sync ka asal scope

- Codex: official local codex app-server, account/read, paginated thread/list aur thread/turns/list public-summary view. Tamam active/archived pages parhe jate hain. Readable public user/assistant text local files mein save hota hai. Helper har 10 seconds account/status/history refresh karta hai; website har 3 seconds local status leti hai. Unchanged cache dobara download nahin hota. Failed pages clearly partial rehte hain. account/read model entitlement ya remaining inference quota ka proof nahin.
- Antigravity MCP: switcher_read_context, switcher_list_history, switcher_read_history, switcher_save_progress. Sirf selected project ka saved readable context milta hai. Agent public progress save kare to aglay refresh par library update hoti hai. Stable turn IDs duplicate entries nahin banate. Heartbeat 10 seconds; 35 seconds se purana client live nahin mana jata. Client name self-reported hai; Google account login ya paid-plan identity ka proof nahin.
- Connected project journals/genuine hook exports bhi parhe jate hain. Journals summaries hain, native transcripts nahin. Interrupted agent aakhri save miss kar sakta hai.
- ChatGPT web aur full native Antigravity archive: MCP poore private account ki history API nahin banata. Pehle ki web-only chats ke liye official export Import karein. ChatGPT active public branch ke tamam messages; Antigravity JSON conversations/messages, Markdown/text supported. Unknown JSON transcript nahin banta. 100 MB per input file; no 200-chat/300-turn cap. Re-import stable IDs update karta hai.
- Hidden reasoning, native attachments aur tool payloads copy nahin hote. Large handoff packets newest readable context tak bound hain; review mein actual moving text nazar aata hai. Original library unchanged rehti hai.

## Account security aur privacy

Managed Neon Auth / Better Auth email verification, unique email accounts, password hashing, session cookies aur recovery handle karta hai. Free resource Vercel project se linked hai. Account proxy same-origin HttpOnly, Secure, SameSite=Lax cookies use karta hai. Unknown routes, external return URLs, oversized bodies aur cross-origin mutations reject hote hain. Emails normalize hote hain. Password, OTP aur access JWT browser persistent storage mein nahin rakhe jate. Managed service ki send limits aur UI ka 60-second resend cooldown apply hota hai.

Vercel par account identity data hota hai; project files aur chat history cloud par upload nahin hotin. Helper sirf 127.0.0.1:47831 par bind hota hai. Har private browser request random pairing token + signed verified-user JWT dono maangti hai. Signature, issuer, audience, algorithm, expiry, banned aur emailVerified verify hote hain. Local profiles issuer/user ID ke hash se isolate hain. MCP secret selected account/project/provider tak scoped local private file mein hai. Disconnected/expired account lease MCP ko block karti hai. Project config mein secret value nahin, sirf private file ka path hota hai. Existing config backup hoti hai; symbolic-link config paths refuse hote hain.

Pairing trusted local computer ka access hai. Code/private MCP config share na karein. State: %LOCALAPPDATA%/UniversalAISwitcher/web-bridge; SWITCHER_BRIDGE_DATA se override. Public/LAN tunnels unsupported hain. Credentials best-effort redact hote hain; handoff review karein.

## Subscriptions aur project writing

Sync/import/prepare inference submit nahin karte. Send to Codex actual subscription turn hai; plan quota apply hota hai. API keys/automatic top-ups use nahin hote. Unknown billing, extra credit balances ya missing billing acknowledgement inference block karte hain. Read-only default hai. Code mode checkpoints aur approvals use karta hai. Antigravity/background tasks stop karke Codex ko writer banayein; MCP native writers ko forcefully stop nahin karta.

Verified CLI: codex-cli 0.164.0-alpha.11.1. WindowsApps desktop Codex.exe coding CLI nahin hai. Unknown versions explicit compatibility error dete hain.

## Development / deploy

npm install; npm run dev; npm run bridge; npm test; npm run build.

NEON_AUTH_BASE_URL server setting managed Vercel integration se milti hai. .env.local local account proxy ke liye hai; Git mein commit na karein. bridge/auth.json mein sirf public issuer URL hai. Database/password secrets helper mein ship nahin hote. api/account.js aur server/account-proxy.js account proxy hai, Vite dist frontend. vercel deploy --prod dono publish karta hai. scripts/package-bridge.cjs dependencies ke saath helper package banata hai.

Tests: real JWT signature rejection, account isolation/logout revocation, CSRF/origin/cookies, stale MCP heartbeat, installed-but-unverified status, scoped public-progress read/write, full pagination/cache, independent providers, selected-only handoffs, billing guard aur CLI detection. Fixtures sirf isolated tests mein hain; tests ko actual inbox delivery ka proof nahin kaha jata.

Official docs: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Codex MCP](https://developers.openai.com/codex/mcp), [Antigravity MCP](https://antigravity.google/docs/mcp), [Neon verification](https://neon.com/docs/auth/guides/email-verification), [Neon JWT](https://neon.com/docs/auth/guides/plugins/jwt).

[Download helper](https://universal-ai-switcher.vercel.app/downloads/universal-local-bridge.zip)

Other MCP app: kisi bhi standard stdio MCP-compatible client ke liye separate Connect/Disconnect option hai. Project select karke MCP setup se generated configuration copy karein aur us client mein add karein. Handshake ke baad MCP active hoga. Destination MCP app selected handoff ko context.json mein save karta hai; client switcher_read_context se parh sakta hai. Yeh client ki native account-wide history ka automatic access nahin deta. Multiple configured clients apne actual self-reported names ke saath dikhte hain.

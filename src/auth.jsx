import React, { useState, useEffect, useRef } from 'react';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient, jwtClient } from 'better-auth/client/plugins';
import { ArrowLeftRight, ArrowRight, ShieldCheck, Mail, Loader2, CheckCircle2, KeyRound } from 'lucide-react';

export const authClient = createAuthClient({ baseURL: window.location.origin + '/api/auth', plugins: [emailOTPClient(), jwtClient()], fetchOptions: { credentials: 'include' } });
let access = null;
export async function identityToken() {
  if (access && access.until > Date.now() + 30000) return access.token;
  const { data, error } = await authClient.token();
  if (error || !data?.token) throw Error('Login session expire ho gayi. Dobara login karein.');
  // The browser never trusts these claims for authorization. The helper verifies the signature.
  let until = Date.now() + 60000;
  try { until = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch {}
  access = { token: data.token, until };
  return access.token;
}
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null), [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [name, setName] = useState('');
  const [password, setPassword] = useState(''), [otp, setOtp] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [cooldown, setCooldown] = useState(0);
  const alive = useRef(true);
  const accountEmail = email.trim().toLowerCase();
  async function refreshSession() {
    const result = await authClient.getSession({ query: { disableCookieCache: true } });
    if (result.error) throw Error('Account service unavailable. Retry karein.');
    if (result.data?.user && result.data?.session) {
      if (result.data.user.emailVerified) { setSession(result.data); setPassword(''); setOtp(''); }
      else { setEmail(result.data.user.email); setMode('verify'); }
    } else setSession(null);
  }
  useEffect(() => { alive.current = true; refreshSession().catch(e => setError(e.message)).finally(() => { if (alive.current) setLoading(false); }); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!session) return;
    const check = () => refreshSession().catch(() => {});
    const timer = setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); };
  }, [session?.user?.id]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  function changeMode(next) { setMode(next); setError(''); setMessage(''); setPassword(''); setOtp(''); }
  async function sendCode(type = 'email-verification') {
    const result = await authClient.emailOtp.sendVerificationOtp({ email: accountEmail, type });
    if (result.error) throw Error(result.error.message || 'Code send nahin hua. Thori dair baad try karein.');
    setCooldown(60);
    setMessage('Agar email eligible hai to verification code bhej diya gaya hai. Inbox aur spam check karein.');
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'verify') {
        const result = await authClient.emailOtp.verifyEmail({ email: accountEmail, otp });
        if (result.error) throw Error('Code ghalat ya expire ho gaya. Naya code mangwa lein.');
        await refreshSession(); setMode('login'); setMessage('Email verify ho gaya. Apna password de kar login karein.'); setOtp('');
      } else if (mode === 'forgot') {
        await sendCode('forget-password'); setMode('reset');
      } else if (mode === 'reset') {
        const result = await authClient.emailOtp.resetPassword({ email: accountEmail, otp, password });
        if (result.error) throw Error('Code ya password accept nahin hua. Naya code mangwa kar try karein.');
        access = null; setPassword(''); setOtp(''); setMode('login'); setMessage('Password update ho gaya. Ab login karein.');
      } else {
        const result = mode === 'signup'
          ? await authClient.signUp.email({ name: name.trim() || accountEmail.split('@')[0], email: accountEmail, password })
          : await authClient.signIn.email({ email: accountEmail, password });
        if (result.error) {
          if (/EMAIL_NOT_VERIFIED|email.*verif/i.test(result.error.code + ' ' + result.error.message)) {
            setPassword(''); setMode('verify'); await sendCode(); return;
          }
          throw Error(mode === 'signup' ? 'Account create nahin hua. Is email par pehle account hai to Login ya Forgot password use karein.' : 'Email ya password match nahin hua. Dobara try karein ya password reset karein.');
        }
        setPassword('');
        if (result.data?.user?.emailVerified === false || mode === 'signup') {
          setMode('verify'); await sendCode();
        } else await refreshSession();
      }
    } catch (e) { setError(e.message || 'Account action complete nahin hua. Dobara try karein.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    const result = await authClient.signOut();
    if (result.error) throw Error('Logout confirm nahin hua. Dobara try karein.');
    access = null; setSession(null); setMode('login'); setPassword(''); setOtp(''); setError(''); setMessage('Aap logout ho gaye hain.');
  }
  if (loading) return <div className="auth-loading"><Loader2 className="spin" size={24}/><p>Secure session check ho raha hai…</p></div>;
  if (session?.user?.emailVerified) return children({ user: session.user, logout });
  const codeStep = mode === 'verify' || mode === 'reset';
  const title = ({ login: 'Welcome back.', signup: 'Your workspace starts here.', verify: 'Verify your email.', forgot: 'Recover your account.', reset: 'Choose a new password.' })[mode];
  return <div className="auth-page"><div className="auth-intro"><a className="auth-brand" href="/"><span><ArrowLeftRight size={23}/></span>Universal<small>AI SWITCHER</small></a><div className="auth-editorial"><span className="eyebrow">ONE PROJECT. YOUR NEXT TOOL.</span><h1>Keep the work.<br/>Change the tool.</h1><p>Apna account banayein, aik AI connect karein aur asal project context ke saath kaam jari rakhein.</p><div className="auth-steps">{[['01','Verify your email','Aik email, aik account. Agli baar sirf login.'],['02','Connect your own app','Connection verify hogi; koi preloaded history nahin.'],['03','Continue where you left off','Live updates aur selected project handoff.']].map(([n,t,p])=><div key={n}><span>{n}</span><div><strong>{t}</strong><p>{p}</p></div></div>)}</div></div><div className="auth-private"><ShieldCheck size={17}/><span>Verified account. Private history library.</span></div></div><main className="auth-main"><div className="auth-form"><div className="auth-symbol">{codeStep?<Mail size={22}/>:mode==='forgot'?<KeyRound size={22}/>:<ShieldCheck size={22}/>}</div><h2>{title}</h2><p>{mode==='login'?'Apne verified email aur password se login karein.':mode==='signup'?'Apna naam, email aur mazboot password dein.':codeStep?'Email par aaya code yahan enter karein. Code private rakhein.':'Account wale email par recovery code mangwayein.'}</p>{['login','signup'].includes(mode)&&<div className="auth-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>changeMode('login')}>Login</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>changeMode('signup')}>Create account</button></div>}{error&&<div className="auth-error" role="alert">{error}</div>}{message&&<div className="auth-message" role="status"><CheckCircle2 size={16}/>{message}</div>}<form onSubmit={submit}>{mode==='signup'&&<label>Your name<input autoComplete="name" name="name" value={name} maxLength={100} required onChange={e=>setName(e.target.value)}/></label>}<label>Email address<input name="email" type="email" autoComplete="email" value={email} maxLength={254} required readOnly={codeStep} onChange={e=>setEmail(e.target.value)}/></label>{codeStep&&<label>Verification code<input name="otp" className="otp-input" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={otp} required onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></label>}{['login','signup','reset'].includes(mode)&&<label>{mode==='reset'?'New password':'Password'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={128} value={password} required onChange={e=>setPassword(e.target.value)}/>{mode!=='login'&&<small>Kam az kam 12 characters. Doosre accounts ka password use na karein.</small>}</label>}{mode==='login'&&<button type="button" className="auth-text-link" onClick={()=>changeMode('forgot')}>Forgot password?</button>}<button className="button primary auth-submit" type="submit" disabled={busy}>{busy?<Loader2 size={16} className="spin"/>:null}{({login:'Login to workspace',signup:'Create account',verify:'Verify email',forgot:'Send recovery code',reset:'Update password'})[mode]}<ArrowRight size={16}/></button></form>{codeStep&&<button className="auth-text-link resend" disabled={busy||!!cooldown} onClick={async()=>{setBusy(true);setError('');try{await sendCode(mode==='reset'?'forget-password':'email-verification');}catch(e){setError(e.message);}finally{setBusy(false);}}}>{cooldown?'Naya code '+cooldown+'s mein':'Resend code'}</button>}{!['login','signup'].includes(mode)&&<button className="auth-text-link" onClick={()=>changeMode('login')}>← Back to login</button>}<div className="auth-footnote"><ShieldCheck size={15}/><p>Yeh Universal ka login hai. ChatGPT aur Google ke passwords yahan kabhi na dein. Har email ka aik hi account hota hai.</p></div></div></main></div>;
}

import React from 'react';
import {createRoot} from 'react-dom/client';
import AuthGate from './auth.jsx';
import CloudApp from './cloud-app.jsx';
import OAuthConsent from './oauth-consent.jsx';
import './style.css';
const Screen=location.pathname==='/authorize'?OAuthConsent:CloudApp;
createRoot(document.getElementById('root')).render(<AuthGate>{account=><Screen key={account.user.id} {...account}/>}</AuthGate>);

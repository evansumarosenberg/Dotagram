'use client';

import { useRef, useState } from 'react';
import { inspectTelegramSetup, prepareTelegramOwnerVerification, verifyTelegramOwner, registerTelegramWebhook } from './actions';
import type { SetupResult } from '../../lib/setup/service';

const messages:Record<string,string>={
  no_match:'No eligible exact nonce message was found. Check the bot and account. No configuration changed.',
  ambiguous:'More than one eligible nonce message matched. No owner was verified. Agree on a deliberate next step with the installer.',
  incomplete:'The update page is full. Inspection is incomplete; no owner was verified. No updates were discarded.',
  owner_configured:'A Telegram owner is already configured. Preserve that binding and skip enrollment.',
  webhook_exists:'A webhook exists. Inspect the bot, then confirm replacement before preparing owner verification.',
  ready_for_verification:'The webhook is absent and pending updates were preserved. Inspect the bot, then generate and send a new nonce.',
  registered:'Webhook registration and public settings confirmed. A real owner-message round trip is still required.',
  already_configured:'The webhook already matches this Site and its public settings. No write was made. Inspection cannot verify the saved webhook secret.',
  conflict:'An existing webhook needs your confirmation before replacement. Inspect the bot and confirm replacement to continue.',
  uncertain:'The webhook change outcome is uncertain. Do not resubmit automatically. Use Inspect bot to check state; it cannot verify the webhook secret or delivery.',
};
const webhookLabels={absent:'No webhook',matching:'This Site; public settings match',settings_conflict:'This Site; conflicting public settings',another_destination:'Another destination (not displayed)'};

export default function SetupControls({ownerConfigured}:{ownerConfigured:boolean}) {
  const [result,setResult]=useState<SetupResult|null>(null);
  const [inspection,setInspection]=useState<Extract<SetupResult,{status:'inspected'}>|null>(null);
  const [nonce,setNonce]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
  const [registrationUncertain,setRegistrationUncertain]=useState(false);
  const [replacementConfirmed,setReplacementConfirmed]=useState(false);
  const active=useRef(false);
  async function invoke(kind:'inspect'|'prepare'|'verify'|'register') {
    if(active.current) return;
    active.current=true;setBusy(true);setResult(null);setConfirmed(false);
    try {
      const value=await (kind==='inspect'?inspectTelegramSetup({}):kind==='prepare'?prepareTelegramOwnerVerification({confirm_replacement:replacementConfirmed}):kind==='verify'?verifyTelegramOwner({nonce}):registerTelegramWebhook({confirm_replacement:replacementConfirmed}));
      setResult(value);
      if(value.status==='inspected') setInspection(value);
      if(kind==='prepare') {setNonce('');setInspection(null);}
      if((kind==='register'||kind==='prepare') && value.status==='uncertain') setRegistrationUncertain(true);
    } catch {
      // The browser losing a response cannot establish whether a write landed.
      setResult(kind==='register'||kind==='prepare'?{status:'uncertain'}:{status:'error',error:'action_response_unavailable'});
      if(kind==='register'||kind==='prepare') {setRegistrationUncertain(true);setInspection(null);setNonce('');}
    } finally {active.current=false;setBusy(false);setReplacementConfirmed(false);}
  }
  function generateNonce() {
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    setNonce(`dotagram-verify-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`);
    setResult(null);setConfirmed(false);
  }
  return <section aria-busy={busy}>
    <h2>1. Inspect the bot</h2>
    <p>Enter the token directly in Sites settings and deploy it first. Setup uses the saved secret; no token is entered here.</p>
    <button disabled={busy} onClick={()=>void invoke('inspect')}>Inspect bot</button>
    {inspection && <div><p>Bot: @{inspection.bot_info.username} · ID {inspection.bot_info.id}</p>
      <p>Webhook: {webhookLabels[inspection.webhook]}</p>
      <details><summary>Validated bot information and capabilities</summary><pre>{JSON.stringify(inspection.bot_info,null,2)}</pre></details>
      <p>Before new registration, disable group joining in BotFather and leave inline, business and topic features disabled.</p></div>}
    {inspection && inspection.webhook!=='absent' && <div>
      <p>This bot already has a webhook. Replacing it stops delivery to its current integration. Pending updates will be preserved.</p>
      <label><input type="checkbox" disabled={busy||registrationUncertain} checked={replacementConfirmed} onChange={event=>setReplacementConfirmed(event.target.checked)}/> I confirm replacing this bot's existing webhook with Dotagram.</label>
      {!ownerConfigured && <>
        <p>First remove the old webhook so Telegram can verify your account. Dotagram's webhook will be registered after verification and configuration.</p>
        <button disabled={busy||!replacementConfirmed||registrationUncertain} onClick={()=>void invoke('prepare')}>Prepare owner verification</button>
      </>}
    </div>}
    <h2>2. Verify the Telegram owner</h2>
    {ownerConfigured?<p>A Telegram owner is configured. Preserve it and skip enrollment.</p>:<>
      <p>After inspecting the intended bot, generate a nonce and send it as an exact text message to that bot from your own private Telegram account. Then select Verify owner once. Reloading discards unfinished verification.</p>
      <button disabled={busy||!inspection||inspection.webhook!=='absent'} onClick={generateNonce}>Generate nonce</button>
      {nonce && <><pre aria-label="Verification nonce">{nonce}</pre><button disabled={busy} onClick={()=>void invoke('verify')}>Verify owner</button></>}
    </>}
    <h2>3. Register or replace the webhook</h2>
    <p>The installer must first save your confirmed numeric owner ID and validated bot information through Sites and deploy those settings. Keep existing keys. Replacement requires your confirmation above. A matching webhook is left unchanged unless you confirm replacement.</p>
    <button disabled={busy||!ownerConfigured||!inspection||registrationUncertain||((inspection.webhook==='another_destination'||inspection.webhook==='settings_conflict')&&!replacementConfirmed)} onClick={()=>void invoke('register')}>Register or replace webhook</button>
    <p>Use one setup session at a time. Actions are never automatically retried.</p>
    <div role="status" aria-live="polite">
      {busy && <p>Checking Telegram…</p>}
      {result?.status==='error' && <p>Setup stopped: <code>{result.error}</code>. Give this category to the installer; do not send credentials.</p>}
      {result && messages[result.status] && <p>{messages[result.status]}</p>}
      {result?.status==='candidate' && <>
        <h2>Confirm the candidate account</h2>
        <p>Nonce matched for @{result.bot_info.username} (bot ID {result.bot_info.id}). Candidate human-owner ID: <strong>{result.candidate_user_id}</strong>.</p>
        <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> I sent the nonce from my intended Telegram account and confirm this numeric owner ID.</label>
        {confirmed && <><p>Confirmation is local to this page. Give the installer these non-secret settings to save through Sites and deploy. This page does not save or bind an account.</p>
          <p>TELEGRAM_OWNER_USER_ID: <code>{result.candidate_user_id}</code></p>
          <p>TELEGRAM_BOT_INFO:</p><pre>{JSON.stringify(result.bot_info,null,2)}</pre></>}
      </>}
    </div>
  </section>;
}

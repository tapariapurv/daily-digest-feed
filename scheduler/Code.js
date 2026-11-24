// Morning Digest scheduler, running as the app's Gmail account (MAIL_ACCOUNT on Vercel).
// Wakes every 10 minutes but only calls the app when there is work: an edition due soon,
// new newsletter mail in a reader's plus-address, or a periodic refresh. Each call is a
// cold start on Vercel, so idle wakes stay inside Apps Script.
// Deploy: `clasp push`, then run installTrigger() once from the Apps Script editor.
const APP = 'https://morning-digest-khaki.vercel.app';
const DONE = 'morning-digest'; // Gmail label on threads already handed to the app
const LEAD = 10 * 60000; // the app claims editions due within 10 minutes
// ponytail: a schedule moved earlier, or a manual run's email, can wait up to this long; lower it to trade CPU for promptness
const REFRESH = 30 * 60000;

const unseen = (to) => 'deliveredto:' + to + ' -label:' + DONE + ' newer_than:7d';

function tick() {
  const props = PropertiesService.getScriptProperties();
  const s = JSON.parse(props.getProperty('state') || '{}'); // { next, inboxes, synced, check }
  const now = Date.now();
  try {
    const mail = (s.inboxes || []).some((to) => GmailApp.search(unseen(to), 0, 1).length);
    if (mail || s.check || !(now - (s.synced || 0) < REFRESH)) {
      const work = syncMail();
      // An app without `next` (older deploy) gets 0: due every wake, the old behaviour.
      Object.assign(s, { next: work.next === undefined ? 0 : work.next, inboxes: work.inboxes, synced: now, check: false });
    }
    if (s.next != null && now >= s.next - LEAD) {
      UrlFetchApp.fetch(APP + '/api/cron/tick', { method: 'post', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      s.check = true; // next wake: send what the run queued and learn the following edition
    }
  } finally {
    props.setProperty('state', JSON.stringify(s));
  }
}

function api(body) {
  const res = UrlFetchApp.fetch(APP + '/api/mail', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('/api/mail ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function syncMail() {
  const work = api({});
  const label = GmailApp.getUserLabelByName(DONE) || GmailApp.createLabel(DONE);
  work.inboxes.forEach((to) => {
    GmailApp.search(unseen(to), 0, 20).forEach((thread) => {
      thread.getMessages().forEach((m) => {
        api({ issue: { id: m.getId(), to: to, from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), html: m.getBody().slice(0, 400000), text: m.getPlainBody().slice(0, 100000) } });
      });
      thread.addLabel(label);
    });
  });
  work.outbox.forEach((mail) => {
    GmailApp.sendEmail(mail.to, mail.subject, mail.text, { htmlBody: mail.html, name: mail.name });
    api({ sent: mail.id });
  });
  return work;
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(10).create();
  tick();
}

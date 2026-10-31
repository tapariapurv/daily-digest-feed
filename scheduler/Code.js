// Morning Digest scheduler, running as the app's Gmail account (MAIL_ACCOUNT on Vercel).
// Every 10 minutes: pings the app so editions print on time, hands it newsletter issues
// sent to readers' plus-addresses, and sends queued editions from this Gmail.
// Deploy: `clasp push`, then run installTrigger() once from the Apps Script editor.
const APP = 'https://morning-digest-khaki.vercel.app';
const DONE = 'morning-digest'; // Gmail label on threads already handed to the app

function tick() {
  UrlFetchApp.fetch(APP + '/api/cron/tick', { method: 'post', muteHttpExceptions: true });
  syncMail();
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
    GmailApp.search('deliveredto:' + to + ' -label:' + DONE + ' newer_than:7d', 0, 20).forEach((thread) => {
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
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(10).create();
  tick();
}

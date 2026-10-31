// Morning Digest scheduler: pings the app every 10 minutes so editions print on time.
// Deploy: `clasp push`, then run installTrigger() once from the Apps Script editor.
const TICK_URL = 'https://morning-digest-khaki.vercel.app/api/cron/tick';

function tick() {
  UrlFetchApp.fetch(TICK_URL, { method: 'post', muteHttpExceptions: true });
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(10).create();
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { fromPostmark, fromRawMime, latestReplyText, unwrapManualForward } from '../src/modules/email/email-integration';
import { providerDetails, providerFromMx } from '../src/modules/email/providers';

test('providers are recognised from MX records', () => {
  assert.equal(providerFromMx(['aspmx.l.google.com.', 'alt1.aspmx.l.google.com']).id, 'google');
  assert.deepEqual(providerFromMx(['mx.zoho.in', 'mx2.zoho.in']), { id: 'zoho', zohoRegion: 'in' });
  assert.deepEqual(providerFromMx(['mx.zoho.com']), { id: 'zoho', zohoRegion: 'com' });
  assert.equal(providerFromMx(['mehtafoods-in.mail.protection.outlook.com']).id, 'microsoft');
  assert.equal(providerFromMx(['smtp.secureserver.net', 'mailstore1.secureserver.net']).id, 'godaddy');
  assert.equal(providerFromMx(['mx1.hostinger.com']).id, 'hostinger');
  assert.equal(providerFromMx(['mail.mehtafoods.in']).id, 'other');
});

test('Microsoft does not allow password sign-in; Zoho India uses .in servers', () => {
  assert.equal(providerDetails('microsoft', 'x.in').passwordWorks, false);
  assert.equal(providerDetails('zoho', 'x.in', 'in').imap?.host, 'imap.zoho.in');
  assert.equal(providerDetails('other', 'mehtafoods.in').imap?.host, 'mail.mehtafoods.in');
});

test('a Postmark inbound payload becomes one email', () => {
  const email = fromPostmark({
    MessageID: 'abc-1', FromFull: { Email: 'Anita@DesaiFoods.in', Name: 'Anita Desai' }, To: 'sales-1a2b3c@in.forge.example',
    OriginalRecipient: 'sales-1a2b3c@in.forge.example', Subject: 'Pouches', TextBody: 'Need 4000 pouches\n\nOn Mon, X wrote:\n> old',
    StrippedTextReply: 'Need 4000 pouches', Headers: [{ Name: 'Auto-Submitted', Value: 'no' }],
  });
  assert.equal(email.from, 'anita@desaifoods.in');
  assert.equal(email.fromName, 'Anita Desai');
  assert.ok(email.to.includes('sales-1a2b3c@in.forge.example'));
  assert.equal(email.text, 'Need 4000 pouches');
  assert.equal(email.autoSubmitted, false);
});

test('a raw MIME message becomes one email, and auto-replies are flagged', async () => {
  const raw = [
    'From: "Vikram Rao" <vikram@raoagro.in>', 'To: sales-1a2b3c@in.forge.example', 'Subject: Out of office',
    'Message-ID: <m1@raoagro.in>', 'Auto-Submitted: auto-replied', 'Content-Type: text/plain', '', 'I am away.',
  ].join('\r\n');
  const email = await fromRawMime(raw);
  assert.equal(email.from, 'vikram@raoagro.in');
  assert.equal(email.subject, 'Out of office');
  assert.equal(email.autoSubmitted, true);
});

test('a mail the salesperson forwarded by hand keeps the original buyer as sender', () => {
  const forwarded = unwrapManualForward({
    messageId: 'm2', from: 'sales@mehtafoods.in', fromName: 'Sales', to: [], subject: 'Fwd: Requirement', autoSubmitted: false,
    text: 'FYI\n\n---------- Forwarded message ---------\nFrom: Kavya Nair <kavya@naircoffee.in>\nDate: Mon\nSubject: Requirement\n\nNeed 6000 pouches 250 ml',
  }, 'sales@mehtafoods.in');
  assert.equal(forwarded.from, 'kavya@naircoffee.in');
  assert.equal(forwarded.fromName, 'Kavya Nair');
  assert.equal(forwarded.text, 'Need 6000 pouches 250 ml');
});

test('quoted history is cut from a reply', () => {
  assert.equal(latestReplyText('Confirmed, go ahead\n\nOn 29 Sept, Forge wrote:\n> Here is your quote'), 'Confirmed, go ahead');
});

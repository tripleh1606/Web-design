const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SMTPServer } = require('smtp-server');
const { createSmtpMailer } = require('../src/auth/mail');

test('SMTP transport sends activation OTP, reset link and password-change notice to an isolated local inbox', async () => {
  const messages = [];
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], logger: false, disableReverseLookup: true,
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        messages.push({ recipients: session.envelope.rcptTo.map(recipient => recipient.address), raw: Buffer.concat(chunks).toString('utf8') });
        callback();
      });
      stream.on('error', callback);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const mailer = createSmtpMailer({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port),
    SMTP_SECURE: 'false', SMTP_FROM: 'soucha@example.invalid' });
  try {
    assert.equal(mailer.isConfigured(), true);
    const to = 'student@example.invalid';
    await mailer.sendActivationOtp({ to, otp: '123456' });
    await mailer.sendPasswordResetEmail({ to, resetUrl: 'http://localhost:3001/reset?token=local-fixture-token' });
    await mailer.sendPasswordChangedNotice({ to });
    assert.equal(messages.length, 3);
    assert.ok(messages.every(message => message.recipients.length === 1 && message.recipients[0] === to));
    assert.match(messages[0].raw, /123456/);
    assert.match(messages[1].raw, /local-fixture-token/);
    assert.doesNotMatch(messages[2].raw, /123456|local-fixture-token/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

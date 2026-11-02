const nodemailer = require('nodemailer');

function createSmtpMailer(env = process.env) {
  const port = Number(env.SMTP_PORT || 587), secure = env.SMTP_SECURE === 'true';
  const configured = Boolean(env.SMTP_HOST && env.SMTP_FROM && Number.isInteger(port) && port > 0 && port <= 65535
    && (!env.SMTP_SECURE || ['true', 'false'].includes(env.SMTP_SECURE)) && (!env.SMTP_USER === !env.SMTP_PASS));
  let transport;
  async function send(to, subject, text) {
    if (!configured) throw new Error('SMTP not configured');
    transport ||= nodemailer.createTransport({ host: env.SMTP_HOST, port, secure,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
    // Plain text avoids HTML injection. No secret appears in subjects or logs.
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  }
  return {
    isConfigured: () => configured,
    sendActivationOtp: ({ to, otp, expiresMinutes }) => send(to, 'Mã kích hoạt Soucha', `Mã kích hoạt của bạn: ${otp}\nMã có hiệu lực ${expiresMinutes} phút và chỉ dùng một lần. Nhập mã tại trang /activate của Soucha.`),
    sendPasswordResetEmail: ({ to, resetUrl }) => send(to, 'Đặt lại mật khẩu Soucha', `Vui lòng đặt lại mật khẩu của bạn: ${resetUrl}\nLiên kết này sẽ hết hạn sau 15 phút.`),
    sendPasswordChangedNotice: ({ to }) => send(to, 'Mật khẩu Soucha đã được thay đổi', 'Mật khẩu tài khoản Soucha của bạn đã được thay đổi thành công. Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ với chúng tôi.')
  };
}

function dispatchActivationAfterResponse(res, mailer, message, logger) {
  res.once('finish', () => {
    // Do not await SMTP on the request path. Only the delivery task holds plaintext.
    setImmediate(() => {
      Promise.resolve().then(() => mailer.sendActivationOtp(message)).catch(() => {
        logger.error('Activation email delivery failed', { code: 'ACTIVATION_MAIL_FAILED' });
      });
    });
  });
}
module.exports = { createSmtpMailer, dispatchActivationAfterResponse };

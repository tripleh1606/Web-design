const nodemailer = require('nodemailer');

function createSmtpMailer(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  const configured = Boolean(env.SMTP_HOST && env.SMTP_FROM && Number.isInteger(port) && port > 0 && port <= 65535
    && (!env.SMTP_SECURE || ['true', 'false'].includes(env.SMTP_SECURE)) && (!env.SMTP_USER === !env.SMTP_PASS));
  const transport = configured ? nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
    logger: false, debug: false
  }) : null;
  return {
    isConfigured: () => configured,
    async sendActivationOtp({ to, otp }) {
      if (!transport) throw new Error('SMTP is not configured');
      await transport.sendMail({
        from: env.SMTP_FROM, to, subject: 'Mã kích hoạt tài khoản Soucha',
        text: `Mã OTP kích hoạt tài khoản Soucha của bạn là: ${otp}\nMã có hiệu lực trong 10 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`
      });
    },
    async sendPasswordResetEmail({ to, resetUrl }) {
      if (!transport) throw new Error('SMTP is not configured');
      await transport.sendMail({ from: env.SMTP_FROM, to, subject: 'Đặt lại mật khẩu Soucha',
        text: `Liên kết đặt lại mật khẩu Soucha: ${resetUrl}\nLiên kết có hiệu lực trong 15 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.` });
    },
    async sendPasswordChangedNotice({ to }) {
      if (!transport) throw new Error('SMTP is not configured');
      await transport.sendMail({ from: env.SMTP_FROM, to, subject: 'Mật khẩu Soucha đã thay đổi',
        text: 'Mật khẩu tài khoản Soucha của bạn đã được thay đổi. Nếu bạn không thực hiện thao tác này, hãy liên hệ hỗ trợ.' });
    }
  };
}

module.exports = { createSmtpMailer };

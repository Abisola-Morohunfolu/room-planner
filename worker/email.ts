export function emailConfigured(env: Env) {
  return (
    !!env.EMAIL_FROM &&
    (env.EMAIL_PROVIDER === 'cloudflare' ||
      (env.EMAIL_PROVIDER === 'resend' && !!env.RESEND_API_KEY))
  );
}
export async function sendSignInCode(env: Env, email: string, code: string) {
  if (!emailConfigured(env)) throw new Error('Sign-in email is not configured.');
  const subject = 'Your Room Planner sign-in code';
  const text = `Your Room Planner code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`;
  if (env.EMAIL_PROVIDER === 'cloudflare') {
    try {
      await env.EMAIL.send({
        from: env.EMAIL_FROM,
        to: email,
        subject,
        text,
        html: `<p>Your Room Planner sign-in code:</p><p><strong>${code}</strong></p><p>Expires in 5 minutes. If you did not request it, ignore this email.</p>`,
      });
    } catch {
      throw new Error('Sign-in email delivery failed. Please try again.');
    }
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Sign-in email delivery failed. Please try again.');
}

/** Send a transactional email via Resend. */
export type SendEmailInput = {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
};

export class EmailSendError extends Error {
  status: number;
  retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function sendEmail(
  input: SendEmailInput,
  apiKey: string,
): Promise<{ id: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const retryAfter = res.headers.get("retry-after");
    throw new EmailSendError(
      `Resend error ${res.status}: ${body}`,
      res.status,
      retryAfter ? Number(retryAfter) || 60 : res.status === 429 ? 60 : null,
    );
  }

  return (await res.json()) as { id: string };
}

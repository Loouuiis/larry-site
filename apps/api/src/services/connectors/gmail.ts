export function buildGmailInstallUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes,
    access_type: "offline",
    prompt: "consent",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function fetchGmailUserProfile(
  accessToken: string
): Promise<{ email: string; name?: string }> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Gmail user profile: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { email: string; name?: string };
  return { email: data.email, name: data.name };
}

export async function sendGmailMessage(input: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<{ id: string; threadId: string }> {
  const from = input.from ?? "me";
  const mimeMessage = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    input.body,
  ].join("\r\n");

  const raw = Buffer.from(mimeMessage).toString("base64url");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { id: string; threadId: string };
  return { id: data.id, threadId: data.threadId };
}

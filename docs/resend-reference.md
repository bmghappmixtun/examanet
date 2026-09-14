# Resend Email API Reference (2026-09-02)

Source: resend.com/docs, resend.com/blog

## Overview
Email API for developers. Transactional (event-driven) + Marketing (broadcasts).
- Base URL: `https://api.resend.com`
- Auth: `Authorization: Bearer re_xxxxx`
- **Required header**: `User-Agent: my-app/1.0` (else 403)
- **Rate limit**: 10 req/sec per team (can request increase)

## Next.js SDK Quickstart

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: 'Acme <onboarding@resend.dev>',
  to: ['delivered@resend.dev'],
  subject: 'Hello',
  react: <EmailTemplate firstName="John" />,
});
if (error) return Response.json({ error }, { status: 500 });
```

## Core API Endpoints

### Sending
- `POST /emails` — Send (returns `{ id }`)
- `POST /emails/batch` — **Max 100/batch**, max 50 recipients/email, **NO attachments**
- `GET /emails/:id`, `GET /emails` (list)
- `PATCH /emails/:id` (update), `POST /emails/:id/cancel`
- `GET /emails/:id/metrics` — **Email Metrics API** (NEW: volume, opens, clicks, bounces)

### Domains
- `POST/GET/PATCH/DELETE /domains`
- `POST /domains/:id/verify`
- **Subdomain isolation** for reputation segmentation

### Broadcasts (marketing)
- `POST /broadcasts` create, `POST /broadcasts/:id/send`, `GET`
- Need **Segments** for targeting, can scope to **Topics**

### Automations (drip campaigns) — NEW
- `POST /automations` — Create workflow with steps
- Step types: `trigger`, `condition`, `delay`, `wait_for_event`, `send_email`, `contact_update`, `contact_delete`, `add_to_segment`
- `POST /events/send` — Trigger via custom event (e.g. `user.created`)
- Run by `email` OR `contact_id`
- Use cases: welcome, abandoned cart, trial expiration

### Contacts
- `POST/GET/PATCH/DELETE /contacts`
- `POST /contacts/:id/segments/:segment_id`
- Default props: `first_name`, `last_name`, `email`, `unsubscribed`
- Custom props (string/number) for personalization
- **Audiences deprecated** → use Segments + Topics
- Bulk import: CSV up to 200MB

### Templates
- Draft → Publish flow
- `POST /templates` create, `POST /templates/:id/publish` publish
- Max 20 vars per template, types: string/number
- Reserved names: `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `RESEND_UNSUBSCRIBE_URL`
- **Versioning**: published versions stay stable, drafts don't affect sent emails

### Suppressions
- `POST/GET/DELETE /suppressions`
- `POST/DELETE /suppressions/batch`
- Auto on hard bounces + complaints, **now can manage manually**

### Webhooks
- Event types: `email.sent`, `email.queued`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`
- **At-least-once** delivery, **NO order guarantee** (use `created_at` to sort)
- Retry schedule: 5s, 5min, 30min, 2h, 5h, 10h
- Dedupe via `svix-id` header
- Source IPs: 44.228.126.217, 50.112.21.217, 52.24.126.164, 54.148.139.208

## Webhook Signature Verification

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const payload = await req.text();  // RAW text, not JSON
  try {
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    });
    // process event.type
  } catch {
    return new NextResponse('Invalid signature', { status: 400 });
  }
}
```

## Send Parameters

| Field | Type | Notes |
|-------|------|-------|
| `from` | string | Required. `Name <email@domain>` format |
| `to` / `cc` / `bcc` | string[] | Max 50 per email |
| `subject` | string | Required |
| `html` / `text` | string | text auto-gen from html if absent |
| `react` | ReactNode | **Node SDK only** |
| `template` | `{id, variables}` | Can't mix with html/text/react |
| `headers` | object | Custom headers |
| `attachments` | array | Max 40MB total, base64 |
| `tags` | `{name, value}[]` | ASCII only, 256 chars each |
| `reply_to` | string | |
| `scheduled_at` | string | ISO 8601, **no batch** |
| `Idempotency-Key` | header | 24h dedup, 256 chars max |

## Deliverability Best Practices (from blog)

1. **SPF + DKIM + DMARC** — all 3 required
2. **Domain warmup** — gradual volume for new domains
3. **DMARC policy** — start `none`, move to `quarantine`/`reject`
4. **APRF** (new) — sender reputation scoring
5. **Bulk sender reqs** (Gmail/Yahoo 2024, Microsoft 2025):
   - SPF + DKIM + DMARC required
   - One-click unsubscribe
   - Spam rate < 0.3%
6. **Subdomain isolation** — separate transactional vs marketing

## Examanet-Specific Status

### What's set up
- ✅ Domain verified: `examanet.com` (since 2026-08-04)
- ✅ Sending from: `Examanet <noreply@examanet.com>` (was `onboarding@resend.dev`)
- ✅ API key: `re_[REDACTED]` (PRODUCTION)
- ✅ Using `react` (Node SDK), React Email components
- ✅ Email types: verify OTP, password reset, resource approved/rejected, newsletter, contact form

### What's missing (opportunities)
- ❌ **Webhook handler** for bounce/complaint → should update D1 user status
- ❌ **Idempotency keys** on transactional sends (prevent duplicate OTP/welcome)
- ❌ **Tags** for analytics (would help track which email type is delivered/bounced)
- ❌ **Broadcasts** (newsletter is currently custom, could use Broadcasts API)
- ❌ **Automations** (welcome series, abandoned cart-style flows)
- ❌ **Templates** (currently inline React, could use Resend templates for non-tech editing)
- ❌ **Manual suppressions** management

## Useful URLs

- Docs: https://resend.com/docs
- API ref: https://resend.com/docs/api-reference/introduction
- Next.js guide: https://resend.com/docs/send-with-nextjs
- LLM text: https://resend.com/docs/llms.txt
- Webhook verify: https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
- Sender reputation: https://resend.com/blog/six-steps-to-improve-your-sender-reputation-score
- DMARC: https://resend.com/blog/the-new-dmarc-is-here
- Spam tips: https://resend.com/blog/why-your-emails-are-going-to-spam
- Bulk reqs: https://resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024
- Domain warmup: https://resend.com/blog/how-to-warm-up-a-new-domain
- DMARC analyzer: https://resend.com/blog/introducing-dmarc-analyzer
- Email Verification API: https://resend.com/blog/email-verification-api

import { after, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { pushLeadToCrm } from '@/lib/leads/crm';
import { leadInputSchema } from '@/lib/leads/schema';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { onlyDigits } from '@/lib/text';

/** Recebe o formulário "Quero ser revendedor". */
export async function POST(request: Request) {
  if (!rateLimit(`lead:${clientIp(request.headers)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: 'Muitas tentativas. Tente de novo em alguns minutos.' }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 });
  }

  const parsed = leadInputSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return NextResponse.json({ ok: false, error: 'Confira os campos destacados.', fieldErrors }, { status: 422 });
  }

  const { consent: _consent, website, ...data } = parsed.data;

  // Honeypot preenchido: responde sucesso sem gravar.
  if (website) return NextResponse.json({ ok: true });

  const lead = await db.lead.create({
    data: { ...data, whatsapp: onlyDigits(data.whatsapp), instagram: data.instagram.replace(/^@/, ''), status: 'NOVO' },
  });

  after(() => pushLeadToCrm(lead));

  return NextResponse.json({ ok: true, id: lead.id });
}

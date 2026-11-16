import 'server-only';
import { createHmac } from 'node:crypto';
import type { Lead } from '@prisma/client';

import { db } from '../db';
import { getSettings } from '../settings';

/**
 * Integração com CRM via webhook genérico.
 *
 * Qualquer CRM (RD Station, HubSpot, Pipedrive, Zapier, Make, n8n, o próprio
 * Doces Prigor OS…) recebe um POST JSON com o lead. Se houver segredo, o corpo
 * vai assinado em X-Prigor-Signature (HMAC-SHA256 hex).
 */
export async function pushLeadToCrm(lead: Lead): Promise<boolean> {
  const { integrations } = await getSettings();
  const url = integrations.crmWebhookUrl.trim();
  if (!/^https:\/\//.test(url)) return false;

  const body = JSON.stringify({
    event: 'lead.created',
    lead: {
      id: lead.id,
      nome: lead.name,
      empresa: lead.company,
      whatsapp: lead.whatsapp,
      cidade: lead.city,
      bairro: lead.neighborhood,
      tipoEstabelecimento: lead.businessType,
      instagram: lead.instagram,
      comoConheceu: lead.howFound,
      mensagem: lead.message,
      origem: lead.source,
      utm: { source: lead.utmSource, medium: lead.utmMedium, campaign: lead.utmCampaign },
      status: lead.status,
      criadoEm: lead.createdAt.toISOString(),
    },
  });

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (integrations.crmWebhookSecret) {
    headers['x-prigor-signature'] = createHmac('sha256', integrations.crmWebhookSecret).update(body).digest('hex');
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    await db.lead.update({ where: { id: lead.id }, data: { crmSyncedAt: new Date() } });
    return true;
  } catch {
    return false;
  }
}

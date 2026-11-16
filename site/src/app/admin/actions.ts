'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';

import { adminConfigured, credentialsMatch, requireAdmin } from '@/lib/auth/server';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret, signSession } from '@/lib/auth/token';
import { CATALOG_TAG, POINTS_TAG } from '@/lib/catalog';
import { db } from '@/lib/db';
import { geocode } from '@/lib/geo';
import { LEAD_STATUSES } from '@/lib/leads/schema';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { DEFAULT_SETTINGS, SETTINGS_TAG, saveSettingsGroup, type Settings } from '@/lib/settings';
import { instagramHandle, onlyDigits, slugify } from '@/lib/text';
import { saveUpload } from '@/lib/uploads';

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

function refreshSite(tag: string) {
  updateTag(tag);
  revalidatePath('/', 'layout');
}

const str = (fd: FormData, key: string, max = 2000) => String(fd.get(key) ?? '').trim().slice(0, max);
const bool = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true';
const lines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || 'item';
  let slug = root;
  for (let i = 2; await exists(slug); i++) slug = `${root}-${i}`;
  return slug;
}

/* ============================== Sessão ============================== */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!adminConfigured()) {
    return { error: 'Painel não configurado: defina ADMIN_EMAIL, ADMIN_PASSWORD (12+ caracteres) e SESSION_SECRET no .env.' };
  }
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 8, 15 * 60 * 1000)) {
    return { error: 'Muitas tentativas. Aguarde 15 minutos.' };
  }
  const email = str(fd, 'email', 200);
  const password = String(fd.get('password') ?? '');
  if (!credentialsMatch(email, password)) return { error: 'E-mail ou senha incorretos.' };

  const token = await signSession(email.toLowerCase(), sessionSecret()!);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = str(fd, 'next', 200);
  redirect(next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin');
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/admin/login');
}

/* ============================== Produtos ============================== */

export async function saveProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const name = str(fd, 'name', 120);
  if (name.length < 2) return { error: 'Informe o nome do produto.' };

  let image = str(fd, 'image', 300);
  const upload = fd.get('imageFile');
  try {
    if (upload instanceof File && upload.size > 0) image = await saveUpload(upload, name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao enviar imagem.' };
  }

  const gallery = lines(str(fd, 'gallery', 3000));
  const galleryFiles = fd.getAll('galleryFiles').filter((f): f is File => f instanceof File && f.size > 0);
  try {
    for (const file of galleryFiles.slice(0, 6)) gallery.push(await saveUpload(file, name));
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao enviar imagem.' };
  }

  const data = {
    name,
    category: str(fd, 'category', 60),
    tagline: str(fd, 'tagline', 200),
    description: str(fd, 'description', 3000),
    size: str(fd, 'size', 60),
    flavors: JSON.stringify(lines(str(fd, 'flavors', 2000))),
    extraInfo: str(fd, 'extraInfo', 3000),
    image,
    imageAlt: str(fd, 'imageAlt', 200),
    gallery: JSON.stringify(gallery),
    featured: bool(fd, 'featured'),
    forResale: bool(fd, 'forResale'),
    active: bool(fd, 'active'),
    order: Number(str(fd, 'order', 6)) || 0,
  };

  const requestedSlug = slugify(str(fd, 'slug', 80));
  if (id) {
    const slug = requestedSlug
      ? await uniqueSlug(requestedSlug, async (s) => Boolean(await db.product.findFirst({ where: { slug: s, NOT: { id } } })))
      : undefined;
    await db.product.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) } });
  } else {
    const slug = await uniqueSlug(requestedSlug || name, async (s) => Boolean(await db.product.findUnique({ where: { slug: s } })));
    await db.product.create({ data: { ...data, slug } });
  }
  refreshSite(CATALOG_TAG);
  redirect('/admin/produtos?salvo=1');
}

export async function toggleProductAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const p = await db.product.findUnique({ where: { id } });
  if (p) await db.product.update({ where: { id }, data: { active: !p.active } });
  refreshSite(CATALOG_TAG);
}

export async function deleteProductAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await db.product.delete({ where: { id: str(fd, 'id', 40) } }).catch(() => null);
  refreshSite(CATALOG_TAG);
  redirect('/admin/produtos');
}

/* ============================== Pontos de venda ============================== */

const pointSchema = z.object({
  name: z.string().min(2, 'Informe o nome do estabelecimento.'),
  address: z.string().min(3, 'Informe o endereço.'),
  city: z.string().min(2, 'Informe a cidade.'),
});

export async function savePointAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const base = {
    name: str(fd, 'name', 160),
    address: str(fd, 'address', 240),
    neighborhood: str(fd, 'neighborhood', 100),
    city: str(fd, 'city', 100),
    state: str(fd, 'state', 2).toUpperCase() || 'RJ',
    zipCode: str(fd, 'zipCode', 12),
    phone: onlyDigits(str(fd, 'phone', 30)),
    whatsapp: onlyDigits(str(fd, 'whatsapp', 30)),
    instagram: instagramHandle(str(fd, 'instagram', 120)),
    hours: str(fd, 'hours', 300),
    mapUrl: str(fd, 'mapUrl', 500),
    notes: str(fd, 'notes', 2000),
    active: bool(fd, 'active'),
  };
  const check = pointSchema.safeParse(base);
  if (!check.success) return { error: check.error.issues[0]?.message ?? 'Dados inválidos.' };

  let latitude: number | null = Number.parseFloat(str(fd, 'latitude', 20).replace(',', '.'));
  let longitude: number | null = Number.parseFloat(str(fd, 'longitude', 20).replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    latitude = null;
    longitude = null;
  }

  // Coordenadas do link do Google Maps (…@-22.9,-43.1… ou ?q=-22.9,-43.1)
  if (latitude == null && base.mapUrl) {
    const m = base.mapUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? base.mapUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) {
      latitude = Number(m[1]);
      longitude = Number(m[2]);
    }
  }

  let message: string | undefined;
  if (latitude == null) {
    const found = await geocode([base.address, base.neighborhood, base.city, base.state, 'Brasil'].filter(Boolean).join(', '));
    if (found) {
      latitude = found.lat;
      longitude = found.lng;
    } else {
      message = 'Salvo, mas não localizamos as coordenadas automaticamente. Informe latitude/longitude para ordenar por distância.';
    }
  }

  const data = { ...base, latitude, longitude };
  if (id) {
    await db.pointOfSale.update({ where: { id }, data });
  } else {
    const slug = await uniqueSlug(`${base.name} ${base.neighborhood}`, async (s) =>
      Boolean(await db.pointOfSale.findUnique({ where: { slug: s } })),
    );
    await db.pointOfSale.create({ data: { ...data, slug } });
  }
  refreshSite(POINTS_TAG);
  if (message) return { ok: true, message };
  redirect('/admin/pontos?salvo=1');
}

/**
 * Localiza no mapa os pontos sem coordenadas (OpenStreetMap, 1 consulta por segundo).
 * Faz no máximo 12 por clique para a requisição não estourar o tempo.
 */
export async function geocodeMissingPointsAction(): Promise<void> {
  await requireAdmin();
  const missing = await db.pointOfSale.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    orderBy: { name: 'asc' },
    take: 12,
  });
  let found = 0;
  for (const [i, p] of missing.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const point =
      (await geocode([p.address, p.neighborhood, p.city, p.state, 'Brasil'].filter(Boolean).join(', '))) ??
      (await geocode([p.neighborhood, p.city, p.state, 'Brasil'].filter(Boolean).join(', ')));
    if (point) {
      await db.pointOfSale.update({ where: { id: p.id }, data: { latitude: point.lat, longitude: point.lng } });
      found++;
    }
  }
  const left = await db.pointOfSale.count({ where: { OR: [{ latitude: null }, { longitude: null }] } });
  refreshSite(POINTS_TAG);
  redirect(`/admin/pontos?localizados=${found}&faltam=${left}`);
}

export async function togglePointAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const p = await db.pointOfSale.findUnique({ where: { id } });
  if (p) await db.pointOfSale.update({ where: { id }, data: { active: !p.active } });
  refreshSite(POINTS_TAG);
}

export async function deletePointAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await db.pointOfSale.delete({ where: { id: str(fd, 'id', 40) } }).catch(() => null);
  refreshSite(POINTS_TAG);
  redirect('/admin/pontos');
}

/* ============================== Leads ============================== */

export async function updateLeadAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const status = str(fd, 'status', 20);
  const data: { status?: string; notes?: string } = {};
  if ((LEAD_STATUSES as readonly string[]).includes(status)) data.status = status;
  if (fd.has('notes')) data.notes = str(fd, 'notes', 4000);
  await db.lead.update({ where: { id }, data });
  revalidatePath('/admin/leads');
  revalidatePath(`/admin/leads/${id}`);
}

export async function deleteLeadAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await db.lead.delete({ where: { id: str(fd, 'id', 40) } }).catch(() => null);
  revalidatePath('/admin/leads');
  redirect('/admin/leads');
}

/* ============================== Conteúdo e configurações ============================== */

export async function saveContentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const c = DEFAULT_SETTINGS.content;
  const content: Settings['content'] = { ...c };
  for (const key of Object.keys(c) as (keyof Settings['content'])[]) {
    const value = c[key];
    if (typeof value === 'string' && fd.has(key)) (content as Record<string, unknown>)[key] = str(fd, key, 4000);
  }
  content.aboutParagraphs = str(fd, 'aboutParagraphs', 8000)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const stepTitles = fd.getAll('stepTitle').map(String);
  const stepTexts = fd.getAll('stepText').map(String);
  content.resellerSteps = stepTitles
    .map((title, i) => ({ title: title.trim(), text: (stepTexts[i] ?? '').trim() }))
    .filter((s) => s.title);

  const pillarTitles = fd.getAll('pillarTitle').map(String);
  const pillarTexts = fd.getAll('pillarText').map(String);
  if (pillarTitles.length) {
    content.universePillars = pillarTitles
      .map((title, i) => ({ title: title.trim(), text: (pillarTexts[i] ?? '').trim() }))
      .filter((s) => s.title);
  }

  const faqQ = fd.getAll('faqQuestion').map(String);
  const faqA = fd.getAll('faqAnswer').map(String);
  content.resellerFaq = faqQ.map((question, i) => ({ question: question.trim(), answer: (faqA[i] ?? '').trim() })).filter((f) => f.question && f.answer);

  const upload = fd.get('heroImageFile');
  try {
    if (upload instanceof File && upload.size > 0) content.heroImage = await saveUpload(upload, 'banner-home');
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao enviar imagem.' };
  }

  await saveSettingsGroup('content', content);
  refreshSite(SETTINGS_TAG);
  return { ok: true, message: 'Conteúdo publicado.' };
}

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const current = DEFAULT_SETTINGS;

  const contact: Settings['contact'] = {
    whatsapp: onlyDigits(str(fd, 'whatsapp', 30)),
    instagram: instagramHandle(str(fd, 'instagram', 120)),
    email: str(fd, 'email', 160),
    region: str(fd, 'region', 120),
    legalName: str(fd, 'legalName', 160),
    cnpj: str(fd, 'cnpj', 30),
    address: str(fd, 'address', 240),
  };
  if (contact.whatsapp && contact.whatsapp.length < 10) return { error: 'WhatsApp inválido: inclua DDD.' };

  const messages = { ...current.messages };
  for (const key of Object.keys(messages) as (keyof Settings['messages'])[]) {
    const v = str(fd, `msg_${key}`, 600);
    if (v) messages[key] = v;
  }

  const integrations: Settings['integrations'] = {
    ga4Id: str(fd, 'ga4Id', 40),
    gtmId: str(fd, 'gtmId', 40),
    metaPixelId: str(fd, 'metaPixelId', 40),
    crmWebhookUrl: str(fd, 'crmWebhookUrl', 500),
    crmWebhookSecret: str(fd, 'crmWebhookSecret', 200),
    instagramToken: str(fd, 'instagramToken', 600),
    erpOrdersUrl: str(fd, 'erpOrdersUrl', 500),
    erpOrdersSecret: str(fd, 'erpOrdersSecret', 200),
  };
  for (const id of [integrations.ga4Id, integrations.gtmId, integrations.metaPixelId]) {
    if (id && !/^[A-Za-z0-9-]+$/.test(id)) return { error: 'IDs de analytics só podem conter letras, números e hífen.' };
  }
  if (integrations.crmWebhookUrl && !integrations.crmWebhookUrl.startsWith('https://')) {
    return { error: 'O webhook do CRM precisa começar com https://' };
  }
  if (integrations.erpOrdersUrl && !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(integrations.erpOrdersUrl)) {
    return { error: 'O endereço do ERP precisa começar com https://' };
  }
  if (integrations.erpOrdersUrl && integrations.erpOrdersSecret.length < 32) {
    return { error: 'O segredo do ERP precisa ter pelo menos 32 caracteres.' };
  }

  await saveSettingsGroup('contact', contact);
  await saveSettingsGroup('messages', messages);
  await saveSettingsGroup('integrations', integrations);
  refreshSite(SETTINGS_TAG);
  return { ok: true, message: 'Configurações salvas.' };
}

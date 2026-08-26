'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Coffee,
  TrendingUp,
  Loader2,
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { PipelineStage, LossReason, ActivityType, SampleResult } from '@prisma/client';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface ActivityRecord {
  id: string;
  type: ActivityType;
  description: string;
  date: string;
  result?: string;
  seller?: { name: string };
}

/** Detalhamento do Prigor Score gravado em `scoreBreakdown`. */
interface ScoreBreakdown {
  category: number;
  compatibility: number;
  commercial_potential: number;
  region: number;
  digital_presence: number;
  nearby_customers: number;
  data_quality: number;
}

interface MeetingRecord {
  id: string;
  date: string;
  location: string | null;
  observation: string | null;
  status: string;
}

interface SampleRecord {
  id: string;
  date: string;
  product: string;
  quantity: number;
  flavors: string | null;
  observation: string | null;
  result: SampleResult | null;
}

/** Resposta de `GET /api/leads/[id]/whatsapp`. */
interface WhatsAppData {
  leadPhone: string;
  formattedPhone: string;
  message: string;
  whatsappUrl: string;
  closestCustomer: {
    id: string;
    tradeName: string;
    category: string | null;
    distance: number;
  } | null;
}

/** Corpo enviado ao atualizar a etapa do lead. */
interface StagePayload {
  pipelineStage: PipelineStage;
  status?: string;
  lossReason?: LossReason;
  lossNotes?: string;
}

/** Corpo enviado ao registrar uma atividade. */
interface ActivityPayload {
  leadId: string;
  type: ActivityType;
  description: string;
  result: string;
  latitude?: number;
  longitude?: number;
  sampleQuantity?: string;
  sampleFlavors?: string;
  sampleResult?: SampleResult;
  meetingDate?: string;
  meetingLocation?: string;
}

interface Lead {
  id: string;
  tradeName: string;
  legalName?: string;
  cnpj?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode?: string;
  latitude: number;
  longitude: number;
  category: string;
  googlePlaceId?: string;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  sellerId?: string;
  regionId?: string;
  neighborhoodId?: string;
  pipelineStage: PipelineStage;
  source: string;
  priority: string;
  status: string;
  firstContactAt?: string;
  convertedCustomerId?: string;
  activities: ActivityRecord[];
  meetings: MeetingRecord[];
  samples: SampleRecord[];
}

interface LeadDetailClientProps {
  initialLead: Lead;
}

interface LeadUpdateResponse {
  lead?: Lead;
  error?: string;
}

interface ActivityResponse {
  error?: string;
}

export default function LeadDetailClient({ initialLead }: LeadDetailClientProps) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initialLead);
  
  // Estados de WhatsApp / Prova Social
  const [waData, setWaData] = useState<WhatsAppData | null>(null);
  const [waLoading, setWaLoading] = useState(true);
  const [editedWaMessage, setEditedWaMessage] = useState('');

  // Estados de formulário de atividades
  const [activeForm, setActiveForm] = useState<'visit' | 'whatsapp' | 'call' | 'meeting' | 'sample' | 'note' | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [resultText, setResultText] = useState('');

  // Campos extras para Amostra
  const [sampleQuantity, setSampleQuantity] = useState('1');
  const [sampleFlavors, setSampleFlavors] = useState('');
  const [sampleResult, setSampleResult] = useState<SampleResult>('INTERESSADO');

  // Campos extras para Reunião
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');

  // Estágio e Perda
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(lead.pipelineStage);
  const [lossReason, setLossReason] = useState<LossReason>('SEM_INTERESSE');
  const [lossNotes, setLossNotes] = useState('');
  const [showLossFields, setShowLossFields] = useState(lead.pipelineStage === 'PERDIDO');
  const [updatingStage, setUpdatingStage] = useState(false);

  const fetchWhatsAppSocialProof = useCallback(async (leadId: string) => {
    try {
      setWaLoading(true);
      const res = await fetch(`/api/leads/${leadId}/whatsapp`);
      const data: WhatsAppData = await res.json();
      if (res.ok) {
        setWaData(data);
        setEditedWaMessage(data.message || '');
      }
    } catch (err) {
      console.error('Erro ao buscar prova social:', err);
    } finally {
      setWaLoading(false);
    }
  }, []);

  useEffect(() => {
    const leadId = lead.id;
    // A busca roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await fetchWhatsAppSocialProof(leadId);
    })();
  }, [lead.id, fetchWhatsAppSocialProof]);

  const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stage = e.target.value as PipelineStage;
    setPipelineStage(stage);
    
    if (stage === 'PERDIDO') {
      setShowLossFields(true);
    } else {
      setShowLossFields(false);
      // Salvar imediatamente na API
      await updateLeadStage(stage);
    }
  };

  const submitStageChange = async () => {
    await updateLeadStage(pipelineStage, showLossFields ? { lossReason, lossNotes } : undefined);
  };

  const updateLeadStage = async (stage: PipelineStage, lossData?: { lossReason: LossReason; lossNotes: string }) => {
    try {
      setUpdatingStage(true);
      const payload: StagePayload = { pipelineStage: stage };
      if (lossData) {
        payload.status = 'PERDIDO';
        payload.lossReason = lossData.lossReason;
        payload.lossNotes = lossData.lossNotes;
      }

      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: LeadUpdateResponse = await res.json();

      if (!res.ok) {
        throw new Error(apiErrorMessage(data, 'Erro ao atualizar estágio do lead.'));
      }

      if (stage === 'NOVO_REVENDEDOR') {
        alert('🎉 Incrível! O lead foi convertido em um Novo Revendedor da Doces Prigor! Ele agora é um Cliente ativo.');
        router.push('/seller/leads');
        router.refresh();
        return;
      }

      // Recarregar dados
      if (data.lead) {
        setLead(data.lead);
        setPipelineStage(data.lead.pipelineStage);
        setShowLossFields(data.lead.pipelineStage === 'PERDIDO');
      }
      router.refresh();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setUpdatingStage(false);
    }
  };

  const handleRegisterActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    // Mapeamento de tipo
    let type: ActivityType = 'NOTE';
    if (activeForm === 'visit') type = 'VISIT';
    if (activeForm === 'whatsapp') type = 'WHATSAPP';
    if (activeForm === 'call') type = 'PHONE';
    if (activeForm === 'meeting') type = 'MEETING';
    if (activeForm === 'sample') type = 'SAMPLE';

    const payload: ActivityPayload = {
      leadId: lead.id,
      type,
      description,
      result: resultText,
    };

    // Obter geolocalização do browser caso seja visita
    if (type === 'VISIT') {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        payload.latitude = position.coords.latitude;
        payload.longitude = position.coords.longitude;
      } catch (err) {
        console.warn('Não foi possível ler coordenadas GPS para visita, registrando sem coordenadas:', err);
      }
    }

    if (type === 'SAMPLE') {
      payload.sampleQuantity = sampleQuantity;
      payload.sampleFlavors = sampleFlavors;
      payload.sampleResult = sampleResult;
    }

    if (type === 'MEETING') {
      payload.meetingDate = meetingDate;
      payload.meetingLocation = meetingLocation;
    }

    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: ActivityResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao registrar atividade.'));

      // Limpar formulário
      setDescription('');
      setResultText('');
      setSampleQuantity('1');
      setSampleFlavors('');
      setMeetingDate('');
      setMeetingLocation('');
      setActiveForm(null);

      // Recarregar os dados do Lead para atualizar a linha do tempo (atividades)
      window.location.reload();
    } catch (err: unknown) {
      setFormError(errorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };


  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Botão Voltar */}
      <div className="flex items-center gap-2">
        <button onClick={() => router.push('/seller/leads')} className="p-2 bg-white rounded-lg border border-stone-200 text-stone-500 hover:text-stone-800 transition-all cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <span className="text-[10px] text-stone-400 font-bold uppercase">Detalhes da Oportunidade</span>
          <h2 className="text-base font-extrabold text-stone-900 truncate">{lead.tradeName}</h2>
        </div>
      </div>

      {/* Box de Informações Principais */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <span className="rounded-md border border-stone-200 bg-stone-50 text-stone-600 text-[10px] font-semibold px-2 py-0.5 capitalize inline-flex items-center gap-1">
              <Coffee className="h-3.5 w-3.5 text-stone-400" />
              {lead.category}
            </span>
            <h3 className="text-lg font-bold text-stone-900 mt-1 truncate">{lead.tradeName}</h3>
            {lead.legalName && <p className="text-[10px] text-stone-400 truncate">{lead.legalName}</p>}
          </div>

          <div className="rounded-2xl bg-orange-50 border border-orange-200 text-orange-800 p-3 text-center shrink-0">
            <span className="block text-[10px] font-bold uppercase leading-none text-orange-700">SCORE</span>
            <span className="text-2xl font-extrabold tracking-tight block mt-0.5">🔥 {lead.score}</span>
          </div>
        </div>

        {/* Endereço */}
        <div className="rounded-xl bg-stone-50 p-3 border border-stone-150 text-xs text-stone-600 space-y-1.5">
          <p className="font-semibold text-stone-800 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-stone-400 shrink-0" />
            {lead.address}
          </p>
          <p className="pl-5 text-stone-500">Bairro: {lead.neighborhood} • {lead.city} - {lead.state}</p>
          {lead.cnpj && <p className="pl-5 text-stone-400 font-mono text-[10px]">CNPJ: {lead.cnpj}</p>}
        </div>

        {/* Contatos Físicos */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-150 text-stone-700 hover:border-amber-500 transition-colors">
              <Phone className="h-4 w-4 text-amber-700" />
              <span>{lead.phone}</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-150 text-stone-700 hover:border-amber-500 transition-colors truncate">
              <Mail className="h-4 w-4 text-amber-700 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
        </div>
      </div>

      {/* Detalhamento do Prigor Score (Explicabilidade) */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-3">
        <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-amber-700" />
          Por que é uma boa oportunidade?
        </h4>

        {lead.scoreBreakdown ? (
          <div className="grid grid-cols-2 gap-2.5 pt-1 text-[11px]">
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Categoria</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.category} pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Compatibilidade</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.compatibility} pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Potencial Google</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.commercial_potential} pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Território</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.region} pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Presença Web</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.digital_presence} pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Pontos Próximos</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.nearby_customers} pts</span>
            </div>
            <div className="col-span-2 flex justify-between items-center p-2 rounded-lg bg-stone-50 border border-stone-150">
              <span className="text-stone-500 font-medium">Qualidade de Dados</span>
              <span className="font-bold text-stone-800">{lead.scoreBreakdown.data_quality} pts</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500 italic">Detalhamento de pontuação não gerado.</p>
        )}
      </div>

      {/* Gerenciamento de Estágio do Funil (Pipeline) */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-3">
        <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Estágio do Funil</h4>

        <div className="flex items-center gap-3">
          <select
            value={pipelineStage}
            onChange={handleStageChange}
            disabled={updatingStage}
            className="block flex-1 rounded-xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-800 focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            <option value="NOVO">Novo</option>
            <option value="QUALIFICADO">Qualificado</option>
            <option value="ATRIBUIDO">Atribuído</option>
            <option value="ABORDADO">Abordado (Visita/WhatsApp)</option>
            <option value="CONTATO_REALIZADO">Contato Realizado</option>
            <option value="INTERESSADO">Interessado</option>
            <option value="AMOSTRA">Amostra Entregue</option>
            <option value="REUNIAO">Reunião Agendada</option>
            <option value="NEGOCIACAO">Negociação</option>
            <option value="NOVO_REVENDEDOR">Converter para Revendedor (Sucesso!)</option>
            <option value="PERDIDO">Perdido</option>
          </select>
        </div>

        {/* Campos extras em caso de perda */}
        {showLossFields && (
          <div className="rounded-xl bg-red-50 p-4 border border-red-100 space-y-3 pt-3 animate-fadeIn">
            <h5 className="text-xs font-bold text-red-800 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Detalhes do Lead Perdido
            </h5>
            
            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Motivo da Perda</label>
              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value as LossReason)}
                className="block w-full rounded-lg border border-red-200 bg-white p-2.5 text-xs text-stone-800 focus:outline-none"
              >
                <option value="SEM_INTERESSE">Sem Interesse</option>
                <option value="PRECO">Preço Alto</option>
                <option value="JA_POSSUI_FORNECEDOR">Já Possui Fornecedor</option>
                <option value="PRODUZ_INTERNAMENTE">Produz Internamente</option>
                <option value="NAO_TRABALHA_COM_SOBREMESAS">Não Trabalha com Sobremesas</option>
                <option value="BAIXO_MOVIMENTO">Baixo Movimento</option>
                <option value="ESTABELECIMENTO_FECHADO">Estabelecimento Fechado</option>
                <option value="CONTATO_INVALIDO">Contato Inválido</option>
                <option value="RESPONSAVEL_NAO_ENCONTRADO">Responsável não Encontrado</option>
                <option value="OUTRO">Outro Motivo</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Observações adicionais</label>
              <textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Detalhe o feedback do responsável..."
                rows={2}
                className="block w-full rounded-lg border border-red-200 bg-white p-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none"
              />
            </div>

            <button
              onClick={submitStageChange}
              disabled={updatingStage}
              className="flex w-full justify-center items-center rounded-lg bg-red-700 py-2.5 text-xs font-bold text-white hover:bg-red-800 active:bg-red-900 transition-all cursor-pointer"
            >
              {updatingStage ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : 'Confirmar Perda do Lead'}
            </button>
          </div>
        )}
      </div>

      {/* Prova Social & WhatsApp */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="h-4.5 w-4.5 text-amber-700 fill-amber-50" />
          Argumento de Abordagem & Prova Social
        </h4>

        {waLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          </div>
        ) : waData ? (
          <div className="space-y-4">
            {/* Cliente mais próximo de prova social */}
            {waData.closestCustomer ? (
              <div className="rounded-xl bg-emerald-50/50 p-3.5 border border-emerald-100 flex items-center justify-between text-xs">
                <div>
                  <span className="block text-[9px] text-emerald-800 font-bold uppercase">Melhor Prova Social</span>
                  <span className="font-bold text-stone-800">{waData.closestCustomer.tradeName}</span>
                  <span className="text-[10px] text-stone-400 block capitalize">{waData.closestCustomer.category}</span>
                </div>
                <span className="rounded bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 text-[10px]">
                  a {waData.closestCustomer.distance < 1 
                    ? `${Math.round(waData.closestCustomer.distance * 1000)}m` 
                    : `${waData.closestCustomer.distance.toFixed(1)}km`}
                </span>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50/30 p-3.5 border border-amber-100 text-xs text-stone-600">
                Nenhum ponto Prigor muito próximo. Argumente expandindo a rede na região de {lead.neighborhood}.
              </div>
            )}

            {/* Mensagem WhatsApp Customizada */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-stone-500 uppercase">Mensagem de Abordagem Sugerida</label>
              <textarea
                value={editedWaMessage}
                onChange={(e) => setEditedWaMessage(e.target.value)}
                rows={4}
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none transition-all leading-relaxed"
              />
            </div>

            {/* Botão de Disparo do Link WA */}
            <a
              href={`https://api.whatsapp.com/send?phone=${waData.formattedPhone}&text=${encodeURIComponent(editedWaMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full justify-center items-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700 active:bg-emerald-800 transition-all text-center"
            >
              💬 Abrir WhatsApp
            </a>
          </div>
        ) : (
          <p className="text-xs text-stone-500 italic">Não foi possível carregar a prova social.</p>
        )}
      </div>

      {/* Grid de Ações Rápidas em Campo */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setActiveForm(activeForm === 'visit' ? null : 'visit')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center cursor-pointer"
        >
          <span className="text-xl">🏃</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Registrar Visita</span>
        </button>

        <button
          onClick={() => setActiveForm(activeForm === 'sample' ? null : 'sample')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center cursor-pointer"
        >
          <span className="text-xl">🍫</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Dar Amostra</span>
        </button>

        <button
          onClick={() => setActiveForm(activeForm === 'meeting' ? null : 'meeting')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center cursor-pointer"
        >
          <span className="text-xl">📅</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Reunião</span>
        </button>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lead.latitude},${lead.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center"
        >
          <span className="text-xl">🗺️</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Traçar Rota</span>
        </a>

        <a
          href={lead.phone ? `tel:${lead.phone}` : '#'}
          className={`flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center ${!lead.phone && 'opacity-40 pointer-events-none'}`}
        >
          <span className="text-xl">📞</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Ligar</span>
        </a>

        <button
          onClick={() => setActiveForm(activeForm === 'note' ? null : 'note')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-amber-500 transition-all text-center cursor-pointer"
        >
          <span className="text-xl">📝</span>
          <span className="text-[10px] font-bold text-stone-700 mt-1">Nova Nota</span>
        </button>
      </div>

      {/* Formulários dinâmicos baseados nas ações de campo */}
      {activeForm && (
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              {activeForm === 'visit' && 'Registrar Visita Presencial'}
              {activeForm === 'sample' && 'Registrar Entrega de Amostra'}
              {activeForm === 'meeting' && 'Agendar Reunião Comercial'}
              {activeForm === 'note' && 'Adicionar Nota / Observação'}
            </h4>
            <button onClick={() => setActiveForm(null)} className="text-xs font-semibold text-stone-400 hover:text-stone-600">Fechar</button>
          </div>

          <form onSubmit={handleRegisterActivity} className="space-y-4">
            {formError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {formError}
              </div>
            )}

            {/* Campos Específicos de Amostra */}
            {activeForm === 'sample' && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Quantidade Entregue</label>
                  <input
                    type="number"
                    min="1"
                    value={sampleQuantity}
                    onChange={(e) => setSampleQuantity(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Resultado da Degustação</label>
                  <select
                    value={sampleResult}
                    onChange={(e) => setSampleResult(e.target.value as SampleResult)}
                    className="block w-full rounded-lg border border-stone-300 p-2.5 text-stone-800 focus:outline-none"
                  >
                    <option value="INTERESSADO">Interessado</option>
                    <option value="GOSTOU">Gostou Muito</option>
                    <option value="PENSANDO">Pensando</option>
                    <option value="NAO_GOSTOU">Não Gostou</option>
                    <option value="SEM_INTERESSE">Sem Interesse</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Sabores entregues</label>
                  <input
                    type="text"
                    placeholder="Ex: Doce de Leite, Brigadeiro Gourmet"
                    value={sampleFlavors}
                    onChange={(e) => setSampleFlavors(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 p-2.5"
                    required
                  />
                </div>
              </div>
            )}

            {/* Campos Específicos de Reunião */}
            {activeForm === 'meeting' && (
              <div className="text-xs space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Data e Horário</label>
                  <input
                    type="datetime-local"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Local da Reunião</label>
                  <input
                    type="text"
                    placeholder="Ex: No próprio estabelecimento / WhatsApp Videocall"
                    value={meetingLocation}
                    onChange={(e) => setMeetingLocation(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 p-2.5"
                    required
                  />
                </div>
              </div>
            )}

            {/* Resultado da Visita */}
            {activeForm === 'visit' && (
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Resultado da Abordagem</label>
                <select
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-800 focus:outline-none"
                  required
                >
                  <option value="">Selecione o resultado...</option>
                  <option value="Interessado - agendou reunião">Interessado - agendou reunião</option>
                  <option value="Interessado - aceitou amostra">Interessado - aceitou amostra</option>
                  <option value="Retornar depois - responsável ausente">Retornar depois - responsável ausente</option>
                  <option value="Sem Interesse - já possui fornecedor">Sem Interesse - já possui fornecedor</option>
                  <option value="Sem Interesse - produz internamente">Sem Interesse - produz internamente</option>
                  <option value="Visita de relacionamento">Visita de relacionamento</option>
                </select>
              </div>
            )}

            {/* Descrição geral da atividade */}
            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">
                {activeForm === 'note' ? 'Texto da Nota' : 'Resumo / O que foi conversado?'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Digite detalhes da atividade..."
                rows={3}
                className="block w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="flex w-full justify-center items-center rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 transition-all cursor-pointer"
            >
              {formLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Salvar Registro'}
            </button>
          </form>
        </div>
      )}

      {/* Histórico / Linha do Tempo de Interações */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
          <Clock className="h-4.5 w-4.5 text-amber-700" />
          Histórico de Atividades ({lead.activities.length})
        </h3>

        {lead.activities.length === 0 ? (
          <p className="text-xs text-stone-500 italic p-4 text-center">
            Nenhuma atividade registrada para este lead.
          </p>
        ) : (
          <div className="relative border-l border-stone-250 ml-3.5 space-y-6">
            {lead.activities.map((act) => {
              const dateStr = new Date(act.date).toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              // Ícone e Cor baseada no tipo
              let icon = '📝';
              if (act.type === 'VISIT') icon = '🏃';
              if (act.type === 'WHATSAPP') icon = '💬';
              if (act.type === 'PHONE') icon = '📞';
              if (act.type === 'MEETING') icon = '📅';
              if (act.type === 'SAMPLE') icon = '🍫';
              if (act.type === 'STATUS_CHANGE') icon = '⚙️';
              if (act.type === 'ASSIGNMENT') icon = '👤';

              return (
                <div key={act.id} className="relative pl-6">
                  {/* Ponto na timeline */}
                  <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-700 shadow-sm" />
                  
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-400 font-bold">{dateStr}</span>
                      <span className="text-[10px] text-stone-500 font-semibold">• por {act.seller?.name || 'Sistema'}</span>
                    </div>
                    <h4 className="font-bold text-stone-800 mt-1 flex items-center gap-1.5">
                      <span className="text-base leading-none">{icon}</span>
                      {act.type.replace('_', ' ')}
                    </h4>
                    <p className="text-stone-600 text-[11px] font-medium leading-relaxed mt-1 bg-stone-50 p-2.5 rounded-lg border border-stone-150">
                      {act.description}
                    </p>
                    {act.result && (
                      <p className="text-[10px] text-amber-800 font-bold mt-1 pl-1">
                        Resultado: {act.result}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { 
  Search, 
  Trash2, 
  UserPlus, 
  Loader2, 
  MapPin, 
  Download, 
  Share2, 
  X, 
  ExternalLink,
  Phone,
  Mail,
  Coffee,
  Info,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { PipelineStage, Role } from '@prisma/client';

interface Seller {
  id: string;
  name: string;
}

interface Region {
  id: string;
  name: string;
}

interface Lead {
  id: string;
  tradeName: string;
  legalName?: string | null;
  cnpj?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode?: string | null;
  latitude: number;
  longitude: number;
  category: string;
  googlePlaceId?: string | null;
  score: number;
  scoreBreakdown?: any;
  sellerId?: string | null;
  seller?: { name: string } | null;
  regionId?: string | null;
  region?: { name: string } | null;
  pipelineStage: PipelineStage;
  source: string;
  priority: string;
  status: string;
  lossReason?: string | null;
  lossNotes?: string | null;
  createdAt: string;
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [filterSeller, setFilterSeller] = useState('');
  const [filterRegion, setFilterRegion] = useState(''); // Filtro por região adicionado
  const [filterStage, setFilterStage] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Estados de atribuição de vendedor
  const [reassignLeadId, setReassignLeadId] = useState<string | null>(null);
  const [reassignSellerId, setReassignSellerId] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);

  // Estado de detalhes do lead
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [closestCustomer, setClosestCustomer] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedLead) {
      fetchClosestCustomer(selectedLead.id);
    } else {
      setClosestCustomer(null);
    }
  }, [selectedLead]);

  const fetchClosestCustomer = async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/whatsapp`);
      if (res.ok) {
        const json = await res.json();
        setClosestCustomer(json.closestCustomer);
      }
    } catch (err) {
      console.error('Erro ao buscar cliente próximo:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [leadsRes, sellersRes, regionsRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/sellers'),
        fetch('/api/regions'),
      ]);

      const leadsJson = await leadsRes.json();
      const sellersJson = await sellersRes.json();
      const regionsJson = await regionsRes.json();

      if (!leadsRes.ok || !sellersRes.ok || !regionsRes.ok) {
        throw new Error('Erro ao carregar dados de leads, vendedores ou regiões.');
      }

      setLeads(leadsJson.leads || []);
      setSellers(sellersJson.sellers || []);
      setRegions(regionsJson.regions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignLeadId) return;
    setReassignLoading(true);
    try {
      const res = await fetch(`/api/leads/${reassignLeadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: reassignSellerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao reatribuir lead.');

      const newSeller = sellers.find(s => s.id === reassignSellerId) || null;

      // Atualizar lista local
      setLeads(leads.map(l => l.id === reassignLeadId ? { 
        ...l, 
        sellerId: reassignSellerId || null, 
        seller: newSeller ? { name: newSeller.name } : null,
        status: reassignSellerId ? 'ATIVO' : 'SEM_TERRITORIO',
        pipelineStage: reassignSellerId ? 'ATRIBUIDO' : l.pipelineStage
      } : l));

      // Atualizar modal de detalhes se estiver aberto
      if (selectedLead && selectedLead.id === reassignLeadId) {
        setSelectedLead({
          ...selectedLead,
          sellerId: reassignSellerId || null,
          seller: newSeller ? { name: newSeller.name } : null,
          status: reassignSellerId ? 'ATIVO' : 'SEM_TERRITORIO',
          pipelineStage: reassignSellerId ? 'ATRIBUIDO' : selectedLead.pipelineStage
        });
      }

      setReassignLeadId(null);
      setReassignSellerId('');
      alert('Lead reatribuído com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setReassignLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lead permanentemente? Essa ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Erro ao excluir lead.');
      }
      setLeads(leads.filter(l => l.id !== id));
      if (selectedLead && selectedLead.id === id) {
        setSelectedLead(null);
      }
      alert('Lead excluído do sistema.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtragem dos Leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.tradeName.toLowerCase().includes(search.toLowerCase()) ||
      lead.address.toLowerCase().includes(search.toLowerCase()) ||
      lead.neighborhood.toLowerCase().includes(search.toLowerCase());

    const matchesSeller =
      filterSeller === '' ||
      (filterSeller === 'null' ? !lead.sellerId : lead.sellerId === filterSeller);

    const matchesRegion = filterRegion === '' || lead.regionId === filterRegion; // Filtro de região
    const matchesStage = filterStage === '' || lead.pipelineStage === filterStage;
    const matchesStatus = filterStatus === '' || lead.status === filterStatus;
    const matchesCategory = filterCategory === '' || lead.category === filterCategory;

    return matchesSearch && matchesSeller && matchesRegion && matchesStage && matchesStatus && matchesCategory;
  });

  // Função para exportar Leads filtrados em formato CSV (Acesso Offline)
  const exportToCSV = () => {
    if (filteredLeads.length === 0) {
      alert('Nenhum lead disponível para exportação.');
      return;
    }

    const headers = [
      'Nome Fantasia',
      'Razão Social',
      'CNPJ',
      'Telefone',
      'Celular',
      'E-mail',
      'Categoria',
      'Endereco',
      'Bairro',
      'Cidade',
      'Pontuacao (Score)',
      'Estagio Pipeline',
      'Prioridade',
      'Status',
      'Vendedor Responsavel'
    ];

    const rows = filteredLeads.map(l => [
      `"${(l.tradeName || '').replace(/"/g, '""')}"`,
      `"${(l.legalName || '').replace(/"/g, '""')}"`,
      `"${l.cnpj || ''}"`,
      `"${l.phone || ''}"`,
      `"${l.mobile || ''}"`,
      `"${l.email || ''}"`,
      `"${l.category}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${l.neighborhood}"`,
      `"${l.city}"`,
      l.score,
      `"${l.pipelineStage}"`,
      `"${l.priority}"`,
      `"${l.status}"`,
      `"${l.seller?.name || 'Sem Vendedor'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `base_leads_offline_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Função para gerar resumo de texto amigável para envio imediato por WhatsApp ao vendedor
  const copyLeadsListForWhatsApp = () => {
    if (filteredLeads.length === 0) {
      alert('Nenhum lead na lista para copiar.');
      return;
    }

    // Identificar se há um vendedor específico no filtro para formatar no cabeçalho
    const selectedSellerName = filterSeller && filterSeller !== 'null'
      ? sellers.find(s => s.id === filterSeller)?.name
      : 'Geral';

    const header = `📋 *OPORTUNIDADES DE EXPANSÃO (OFFLINE)*\n*Destinatário*: ${selectedSellerName}\n*Total*: ${filteredLeads.length} leads qualificados\n\n`;

    const text = filteredLeads.map((l, idx) => {
      const contactStr = l.phone || l.mobile || 'Sem telefone';
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.tradeName}, ${l.address}, ${l.neighborhood}`)}`;
      
      return `*${idx + 1}. ${l.tradeName}* (Score: 🔥 ${l.score})\n` +
             `   • Categoria: ${l.category}\n` +
             `   • Endereço: ${l.address}, ${l.neighborhood}\n` +
             `   • Contato: ${contactStr}\n` +
             `   • Estágio: ${l.pipelineStage.replace('_', ' ')}\n` +
             `   • Rota no Google Maps: ${mapsUrl}`;
    }).join('\n\n');

    const footer = '\n\n🍫 *Doces Prigor - Desejamos boas vendas!*';

    navigator.clipboard.writeText(header + text + footer);
    alert('Lista de leads formatada e copiada para a área de transferência! Cole no WhatsApp do vendedor.');
  };

  const getStageColor = (stage: PipelineStage) => {
    switch (stage) {
      case 'NOVO': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'QUALIFICADO': return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'ATRIBUIDO': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'ABORDADO': return 'bg-yellow-50 text-yellow-800 border-yellow-150';
      case 'CONTATO_REALIZADO': return 'bg-amber-50 text-amber-855 border-amber-100';
      case 'INTERESSADO': return 'bg-orange-50 text-orange-850 border-orange-100';
      case 'REUNIAO':
      case 'AMOSTRA':
      case 'NEGOCIACAO': return 'bg-pink-50 text-pink-700 border-pink-100';
      case 'NOVO_REVENDEDOR': return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'PERDIDO': return 'bg-red-50 text-red-700 border-red-100';
      default: return 'bg-stone-50 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">Gestão de Leads</h2>
          <p className="text-xs text-stone-500 font-medium">Controle de prospecções, distribuições territoriais e exportação offline</p>
        </div>

        {/* Botões de Ações e Exportação */}
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={copyLeadsListForWhatsApp}
            disabled={filteredLeads.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-4 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Copiar lista de leads formatada para colar no WhatsApp"
          >
            <Share2 className="h-4 w-4" />
            Copiar para WhatsApp (Lista)
          </button>
          
          <button
            onClick={exportToCSV}
            disabled={filteredLeads.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Exportar base filtrada de leads em CSV para Excel"
          >
            <Download className="h-4 w-4" />
            Exportar CSV (Acesso Offline)
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-stone-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 text-xs font-semibold text-stone-700">
        <div className="sm:col-span-1 md:col-span-1">
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Buscar</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Nome, rua, bairro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 bg-stone-50 py-2 pl-8 pr-2 focus:bg-white focus:outline-none"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Região Geográfica</label>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 focus:outline-none"
          >
            <option value="">Todas</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Vendedor</label>
          <select
            value={filterSeller}
            onChange={(e) => setFilterSeller(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="null">Sem Vendedor (Fila Triagem)</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Estágio</label>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="NOVO">Novo</option>
            <option value="QUALIFICADO">Qualificado</option>
            <option value="ATRIBUIDO">Atribuído</option>
            <option value="ABORDADO">Abordado</option>
            <option value="CONTATO_REALIZADO">Contato Realizado</option>
            <option value="INTERESSADO">Interessado</option>
            <option value="REUNIAO">Reunião</option>
            <option value="AMOSTRA">Amostra</option>
            <option value="NEGOCIACAO">Negociação</option>
            <option value="NOVO_REVENDEDOR">Novo Revendedor</option>
            <option value="PERDIDO">Perdido</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="ATIVO">Ativo</option>
            <option value="SEM_TERRITORIO">Sem Território</option>
            <option value="PERDIDO">Perdido</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Categoria</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 focus:outline-none"
          >
            <option value="">Todas</option>
            <option value="cafeterias">Cafeterias</option>
            <option value="padarias">Padarias</option>
            <option value="confeitarias">Confeitarias</option>
            <option value="lanchonetes">Lanchonetes</option>
            <option value="açaiterias">Açaiterias</option>
            <option value="conveniências">Conveniências</option>
          </select>
        </div>
      </div>

      {/* Tabela de Leads */}
      {loading ? (
        <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Buscando leads...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs text-center border border-red-200 rounded-xl">{error}</div>
      ) : (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Estabelecimento / Nome</th>
                  <th className="p-4">Endereço/Bairro</th>
                  <th className="p-4">Telefone</th>
                  <th className="p-4">Categoria</th>
                  <th className="p-4 text-center">Score</th>
                  <th className="p-4 text-center">Estágio</th>
                  <th className="p-4">Vendedor Responsável</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-stone-50/30 group">
                    <td 
                      onClick={() => setSelectedLead(lead)} 
                      className="p-4 font-bold text-stone-850 hover:text-amber-800 cursor-pointer"
                    >
                      {lead.tradeName}
                      {lead.legalName && <span className="block text-[10px] text-stone-400 font-normal">{lead.legalName}</span>}
                    </td>
                    <td className="p-4 text-stone-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{lead.address}, {lead.neighborhood}</span>
                      </div>
                    </td>
                    <td className="p-4 text-stone-600 font-medium">
                      {lead.phone || lead.mobile ? (
                        <a href={`tel:${lead.phone || lead.mobile}`} className="hover:text-amber-700 flex items-center gap-1">
                          <Phone className="h-3 w-3 text-stone-400" />
                          {lead.phone || lead.mobile}
                        </a>
                      ) : (
                        <span className="text-stone-400 italic">Sem telefone</span>
                      )}
                    </td>
                    <td className="p-4 capitalize">
                      <span className="rounded-md border border-stone-200 bg-stone-50 text-stone-600 text-[10px] font-semibold px-2 py-0.5 inline-flex items-center gap-1">
                        <Coffee className="h-3 w-3 text-stone-400" />
                        {lead.category}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        lead.score >= 80 ? 'bg-orange-100 text-orange-850' : 'bg-stone-100 text-stone-800'
                      }`}>
                        🔥 {lead.score}
                      </span>
                    </td>
                    <td className="p-4 text-center font-semibold">
                      <span className={`rounded-md border text-[9px] font-extrabold px-2.5 py-0.5 ${getStageColor(lead.pipelineStage)}`}>
                        {lead.pipelineStage.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      {lead.seller ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-800">{lead.seller.name}</span>
                          <button
                            onClick={() => { setReassignLeadId(lead.id); setReassignSellerId(lead.sellerId || ''); }}
                            className="p-1 rounded text-stone-400 hover:text-amber-700 hover:bg-stone-100 transition-all cursor-pointer"
                            title="Reatribuir vendedor"
                          >
                            <UserPlus className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 text-[10px]">SEM TERRITÓRIO</span>
                          <button
                            onClick={() => { setReassignLeadId(lead.id); setReassignSellerId(''); }}
                            className="p-1 rounded bg-orange-100 text-orange-800 hover:bg-amber-700 hover:text-white transition-all cursor-pointer text-[10px] font-bold px-2 py-1"
                          >
                            Atribuir
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="px-2 py-1 rounded bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 transition-colors text-[10px] font-bold cursor-pointer"
                        >
                          Ver Detalhes
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-stone-100 rounded-lg transition-all cursor-pointer"
                          title="Excluir Lead permanentemente"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-550 font-medium">
            <span>Listando {filteredLeads.length} leads</span>
            <span>Total no sistema: {leads.length}</span>
          </div>
        </div>
      )}

      {/* Modal / Caixa Flutuante de Reatribuição */}
      {reassignLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">Atribuir Vendedor Responsável</h3>
            
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-stone-600">Selecione o vendedor:</label>
              <select
                value={reassignSellerId}
                onChange={(e) => setReassignSellerId(e.target.value)}
                className="block w-full rounded-xl border border-stone-300 p-3 text-xs bg-stone-50"
              >
                <option value="">Fila de Triagem (Sem Vendedor)</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setReassignLeadId(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleReassign}
                disabled={reassignLoading}
                className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer"
              >
                {reassignLoading ? 'Gravando...' : 'Salvar Atribuição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal Lateral de Visualização Completa do Lead (Admin) */}
      {selectedLead && (
        <div className="fixed inset-0 z-45 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="bg-white h-full w-full max-w-md border-l border-stone-250 shadow-2xl p-6 overflow-y-auto space-y-6 animate-slideIn">
            
            {/* Header Drawer */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Ficha do Lead</span>
                <h3 className="text-base font-extrabold text-stone-900 truncate max-w-[280px]">{selectedLead.tradeName}</h3>
              </div>
              <button 
                onClick={() => setSelectedLead(null)} 
                className="p-1 rounded bg-stone-100 text-stone-450 hover:text-stone-750 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Ficha Geral */}
            <div className="space-y-4 text-xs font-semibold text-stone-750">
              
              {/* Box do Score */}
              <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-orange-700 font-bold uppercase block leading-none">PRIGOR SCORE</span>
                  <span className="text-2xl font-black text-orange-950 block mt-1">🔥 {selectedLead.score} / 100</span>
                  <span className="text-[10px] text-stone-450 font-medium block mt-1.5 capitalize">Prioridade: {selectedLead.priority}</span>
                </div>
                <span className={`rounded-md border text-[10px] font-extrabold px-3 py-1 uppercase ${getStageColor(selectedLead.pipelineStage)}`}>
                  {selectedLead.pipelineStage.replace('_', ' ')}
                </span>
              </div>

              {/* Endereço detalhado */}
              <div className="rounded-xl bg-stone-50 p-3.5 border border-stone-150 space-y-2">
                <span className="block text-[9px] text-stone-400 font-bold uppercase">Endereço Comercial</span>
                <p className="text-stone-850 font-bold flex items-start gap-1">
                  <MapPin className="h-4 w-4 text-stone-400 shrink-0 mt-0.5" />
                  {selectedLead.address}
                </p>
                <p className="pl-5 text-stone-500 font-medium">Bairro: {selectedLead.neighborhood} • {selectedLead.city} - {selectedLead.state}</p>
                {selectedLead.zipCode && <p className="pl-5 text-stone-400 font-mono text-[10px]">CEP: {selectedLead.zipCode}</p>}
                <div className="pl-5 flex items-center gap-1.5 text-[10px] text-amber-700 pt-1.5 font-bold">
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedLead.tradeName}, ${selectedLead.address}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-0.5"
                  >
                    Google Maps <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Contatos */}
              <div className="space-y-2.5">
                <span className="block text-[9px] text-stone-400 font-bold uppercase">Dados de Contato</span>
                
                {selectedLead.phone && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-150">
                    <span className="text-stone-500 font-medium">Telefone</span>
                    <a href={`tel:${selectedLead.phone}`} className="font-bold text-amber-800 hover:underline flex items-center gap-1">
                      <Phone className="h-4.5 w-4.5 text-stone-400" />
                      {selectedLead.phone}
                    </a>
                  </div>
                )}
                {selectedLead.mobile && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-150">
                    <span className="text-stone-500 font-medium">Celular/WhatsApp</span>
                    <a href={`https://api.whatsapp.com/send?phone=${selectedLead.mobile.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-800 hover:underline flex items-center gap-1">
                      💬 {selectedLead.mobile}
                    </a>
                  </div>
                )}
                {selectedLead.email && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-150">
                    <span className="text-stone-500 font-medium">E-mail</span>
                    <a href={`mailto:${selectedLead.email}`} className="font-bold text-amber-800 hover:underline flex items-center gap-1 truncate max-w-[200px]">
                      <Mail className="h-4.5 w-4.5 text-stone-400" />
                      {selectedLead.email}
                    </a>
                  </div>
                )}
                {selectedLead.cnpj && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-150">
                    <span className="text-stone-500 font-medium">CNPJ</span>
                    <span className="font-mono text-stone-700">{selectedLead.cnpj}</span>
                  </div>
                )}
              </div>

              {/* Atribuição de Vendedor */}
              <div className="space-y-2 pt-2 border-t border-stone-100">
                <span className="block text-[9px] text-stone-400 font-bold uppercase">Território e Responsável</span>
                <div className="flex justify-between items-center p-3 rounded-xl border border-stone-150 bg-stone-50/50">
                  <div>
                    <span className="text-[10px] text-stone-500 block">Vendedor Vinculado</span>
                    <span className="font-bold text-stone-850 block mt-0.5">
                      {selectedLead.seller?.name || 'Fila de Triagem (Sem Vendedor)'}
                    </span>
                  </div>
                  <button
                    onClick={() => { setReassignLeadId(selectedLead.id); setReassignSellerId(selectedLead.sellerId || ''); }}
                    className="rounded bg-amber-700 hover:bg-amber-800 text-white font-bold text-[10px] px-3.5 py-1.5 transition-colors cursor-pointer"
                  >
                    Alterar Dono
                  </button>
                </div>
              </div>

              {/* Clientes Próximos (Prova Social) */}
              <div className="space-y-2 pt-2 border-t border-stone-100">
                <span className="block text-[9px] text-stone-400 font-bold uppercase">Prova Social & Geolocalização</span>
                {closestCustomer ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 space-y-1">
                    <span className="text-[10px] text-emerald-800 font-bold block">🤝 Cliente Ativo Próximo</span>
                    <p className="text-stone-850 font-bold text-xs">{closestCustomer.tradeName}</p>
                    <span className="text-[10px] text-stone-500 font-medium block">
                      Categoria: {closestCustomer.category} • Distância: {closestCustomer.distance < 1 
                        ? `${Math.round(closestCustomer.distance * 1000)}m` 
                        : `${closestCustomer.distance.toFixed(1)}km`}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3.5 text-stone-400 font-medium italic text-center">
                    Nenhum cliente Prigor ativo a menos de 5km deste lead.
                  </div>
                )}
              </div>

              {/* Justificativa de Score */}
              {selectedLead.scoreBreakdown && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <span className="block text-[9px] text-stone-400 font-bold uppercase">Composição do Prigor Score</span>
                  
                  <div className="rounded-xl border border-stone-200 p-3.5 space-y-2 text-[10px] font-semibold">
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span className="flex items-center gap-1"><Coffee className="h-3.5 w-3.5 text-stone-400" /> Categoria</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.category} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span>🔄 Compatibilidade</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.compatibility} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span>⭐ Potencial Google</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.commercial_potential} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span>📍 Região</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.region} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span>💻 Presença Digital</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.digital_presence} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 border-b border-stone-100 pb-1.5">
                      <span>🏘️ Densidade Prigor</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.nearby_customers} pts</span>
                    </div>
                    <div className="flex justify-between items-center text-stone-550 pt-0.5">
                      <span>📋 Qualidade dos Dados</span>
                      <span className="font-bold text-stone-800">{selectedLead.scoreBreakdown.data_quality} pts</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Botão de Excluir */}
            <div className="pt-4 border-t border-stone-200 flex justify-between gap-3">
              <button
                onClick={() => handleDelete(selectedLead.id)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
              >
                <Trash2 className="h-4.5 w-4.5" />
                Excluir Lead
              </button>
              <button
                onClick={() => setSelectedLead(null)}
                className="rounded-lg bg-stone-800 px-4 py-2 text-xs font-bold text-white hover:bg-stone-900 cursor-pointer"
              >
                Fechar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

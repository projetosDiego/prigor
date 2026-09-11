'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  MapPin,
  Coffee,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  X,
  MessageSquare
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { CustomerDTO, Paginated, SellerDTO } from '@/lib/api-types';

interface ImportPreviewRow {
  row: {
    tradeName: string;
    cnpj?: string;
    phone?: string;
    address: string;
    neighborhood: string;
    city: string;
    category: string;
    googlePlaceId?: string;
  };
  status: 'VALID' | 'DUPLICATE' | 'CONFLICT' | 'INVALID';
  message: string;
}

/** Resumo da pré-visualização (`action: 'preview'`). */
interface PreviewSummary {
  total: number;
  valid: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
}

/** Resumo da gravação (`action: 'commit'`). */
interface CommitSummary {
  total: number;
  imported: number;
  skipped: number;
}

/** `GET /api/sellers` devolve `{ data }`: esta listagem não é paginada. */
interface SellersResponse {
  data?: SellerDTO[];
}

interface PreviewResponse {
  summary?: PreviewSummary;
  preview?: ImportPreviewRow[];
  error?: string;
}

interface CommitResponse {
  summary?: CommitSummary;
  error?: string;
}

/** Resposta da consulta de CNPJ (Receita Federal). */
interface CnpjLookup {
  nome_fantasia?: string;
  razao_social?: string;
  ddd_telefone_1?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
}

/** Resposta da consulta de CEP. */
interface CepLookup {
  street?: string;
  neighborhood?: string;
}

const formatPhone = (value: string) => {
  if (!value) return value;
  const phone = value.replace(/\D/g, '');
  const len = phone.length;
  if (len <= 2) {
    return phone.length > 0 ? `(${phone}` : '';
  }
  if (len <= 6) {
    return `(${phone.substring(0, 2)}) ${phone.substring(2)}`;
  }
  if (len <= 10) {
    return `(${phone.substring(0, 2)}) ${phone.substring(2, 6)}-${phone.substring(6)}`;
  }
  return `(${phone.substring(0, 2)}) ${phone.substring(2, 7)}-${phone.substring(7, 11)}`;
};

const formatCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const formatCep = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export default function AdminCustomersPage() {
  const { toast, confirm } = useToast();
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [recurrentFilter, setRecurrentFilter] = useState<'all' | 'active' | 'risk' | 'inactive' | 'new'>('all');
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [sellers, setSellers] = useState<SellerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de importação
  const [rawJsonData, setRawJsonData] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // Estados do Modal de Cadastro Individual
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [docType, setDocType] = useState<'cnpj' | 'cpf'>('cnpj');
  const [formTradeName, setFormTradeName] = useState('');
  const [formLegalName, setFormLegalName] = useState('');
  const [formCnpj, setFormCnpj] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formNeighborhood, setFormNeighborhood] = useState('');
  const [formZipCode, setFormZipCode] = useState('');
  const [formCategory, setFormCategory] = useState('padarias');
  const [formSellerId, setFormSellerId] = useState('');
  const [formIsRevendedor, setFormIsRevendedor] = useState(true);
  const [formCreditLimit, setFormCreditLimit] = useState('0');
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [addrCustomer, setAddrCustomer] = useState<CustomerDTO | null>(null);
  const [addrList, setAddrList] = useState<Array<{ id: string; label: string | null; address: string | null; number: string | null; neighborhood: string | null; city: string | null; state: string | null; zipCode: string | null; isDefault: boolean }>>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [naLabel, setNaLabel] = useState('');
  const [naAddress, setNaAddress] = useState('');
  const [naNumber, setNaNumber] = useState('');
  const [naNeighborhood, setNaNeighborhood] = useState('');
  const [naCity, setNaCity] = useState('');
  const [naState, setNaState] = useState('RJ');
  const [naZip, setNaZip] = useState('');
  const [naSaving, setNaSaving] = useState(false);

  const loadSellers = useCallback(async () => {
    try {
      const res = await fetch('/api/sellers');
      const data: SellersResponse = await res.json();
      if (res.ok) setSellers(data.data ?? []);
    } catch (err) {
      console.error('Erro ao buscar vendedores:', err);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/customers');
      const data: Paginated<CustomerDTO> = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar clientes.'));
      setCustomers(data.data ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // As cargas iniciais rodam fora do corpo síncrono do efeito para não
    // encadear renders (react-hooks/set-state-in-effect).
    void (async () => {
      await Promise.all([loadCustomers(), loadSellers()]);
    })();
  }, [loadCustomers, loadSellers]);

  const handleGeneratePreview = async () => {
    if (!rawJsonData.trim()) {
      toast('Insira os dados em formato de lista (Array JSON) para preview.', 'error');
      return;
    }

    setPreviewLoading(true);
    setPreviewSummary(null);
    setPreviewRows([]);

    try {
      // Tentar parsear JSON na mão para testar validade
      let rows: unknown;
      try {
        rows = JSON.parse(rawJsonData);
      } catch {
        throw new Error('Formato JSON inválido. Certifique-se de colar um array de objetos [{}, {}].');
      }

      if (!Array.isArray(rows)) {
        throw new Error('Os dados devem ser um array de clientes. Ex: [{"tradeName": "Padaria X", ...}]');
      }

      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', rows }),
      });

      const json: PreviewResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao processar preview.'));

      setPreviewSummary(json.summary ?? null);
      setPreviewRows(json.preview || []);
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (previewRows.length === 0) return;
    setImportLoading(true);
    try {
      // Filtrar apenas linhas válidas (ignorar duplicados ou inválidos)
      const validRows = previewRows
        .filter(r => r.status === 'VALID' || r.status === 'CONFLICT') // permite forçar se for só conflito menor ou apenas válidos
        .map(r => r.row);

      if (validRows.length === 0) {
        throw new Error('Nenhuma linha limpa ou válida disponível para importação.');
      }

      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', rows: validRows }),
      });

      const json: CommitResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao realizar importação.'));

      setPreviewRows([]);
      setPreviewSummary(null);
      setRawJsonData('');

      // Recarregar clientes
      await loadCustomers();
      toast(`Importação concluída! ${json.summary?.imported} clientes novos importados.`, 'success');
      setActiveTab('list');
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleQueryCNPJ = async () => {
    const cleanCnpj = formCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast('Digite um CNPJ válido com 14 dígitos para buscar.', 'error');
      return;
    }

    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${cleanCnpj}`);
      if (!res.ok) throw new Error('CNPJ não encontrado ou indisponível.');
      const data: CnpjLookup = await res.json();

      setFormTradeName(data.nome_fantasia || data.razao_social || '');
      setFormLegalName(data.razao_social || '');
      setFormPhone(formatPhone(data.ddd_telefone_1 || ''));
      setFormAddress(data.logradouro || '');
      setFormNumber(data.numero || '');
      setFormComplement(data.complemento || '');
      setFormNeighborhood(data.bairro || '');
      setFormZipCode(data.cep || '');
      toast('Dados preenchidos a partir da Receita Federal!', 'success');
    } catch (err: unknown) {
      toast('Erro ao buscar CNPJ: ' + errorMessage(err), 'error');
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleQueryCEP = async (cepOverride?: string) => {
    const cleanCep = (cepOverride ?? formZipCode).replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      if (!cepOverride) toast('Digite um CEP válido com 8 dígitos para buscar.', 'error');
      return;
    }

    setCepLoading(true);
    try {
      const res = await fetch(`/api/tools/cep?cep=${cleanCep}`);
      if (!res.ok) throw new Error('CEP não encontrado ou indisponível.');
      const data: CepLookup = await res.json();

      if (data.street) setFormAddress(data.street);
      if (data.neighborhood) setFormNeighborhood(data.neighborhood);
      toast('Endereço preenchido automaticamente pelo CEP!', 'success');
    } catch (err: unknown) {
      if (!cepOverride) toast('Erro ao consultar CEP: ' + errorMessage(err), 'error');
    } finally {
      setCepLoading(false);
    }
  };

  const handleZipCodeChange = (val: string) => {
    const formatted = formatCep(val);
    setFormZipCode(formatted);
    const clean = val.replace(/\D/g, '');
    if (clean.length === 8) {
      void handleQueryCEP(clean);
    }
  };

  const reloadAddresses = async (customerId: string) => {
    const res = await fetch(`/api/customers/${customerId}/addresses`);
    const d = await res.json();
    if (res.ok) setAddrList(d.data ?? []);
  };
  const openAddresses = async (cust: CustomerDTO) => {
    setAddrCustomer(cust);
    setAddrList([]);
    setAddrLoading(true);
    try {
      await reloadAddresses(cust.id);
    } catch {
      /* ignora */
    } finally {
      setAddrLoading(false);
    }
  };
  const addAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrCustomer) return;
    setNaSaving(true);
    try {
      const res = await fetch(`/api/customers/${addrCustomer.id}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: naLabel, address: naAddress, number: naNumber, neighborhood: naNeighborhood, city: naCity, state: naState, zipCode: naZip }),
      });
      const j: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(j, 'Erro ao adicionar endereço.'));
      setNaLabel(''); setNaAddress(''); setNaNumber(''); setNaNeighborhood(''); setNaCity(''); setNaZip('');
      await reloadAddresses(addrCustomer.id);
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setNaSaving(false);
    }
  };
  const removeAddress = async (id: string) => {
    if (!addrCustomer) return;
    const okc = await confirm({ title: 'Remover endereço', message: 'Remover este endereço de entrega?', confirmLabel: 'Remover', danger: true });
    if (!okc) return;
    try {
      const res = await fetch(`/api/customer-addresses/${id}`, { method: 'DELETE' });
      const j: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(j, 'Erro ao remover.'));
      await reloadAddresses(addrCustomer.id);
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    }
  };

  const resetCustomerForm = () => {
    setDocType('cnpj');
    setFormTradeName('');
    setFormLegalName('');
    setFormCnpj('');
    setFormCpf('');
    setFormPhone('');
    setFormAddress('');
    setFormNumber('');
    setFormComplement('');
    setFormNeighborhood('');
    setFormZipCode('');
    setFormCategory('padarias');
    setFormSellerId('');
    setFormIsRevendedor(true);
    setFormCreditLimit('0');
  };

  const openCreateCustomer = () => {
    resetCustomerForm();
    setEditCustomerId(null);
    setIsCreateModalOpen(true);
  };

  const openEditCustomer = (cust: CustomerDTO) => {
    setDocType(cust.cpf && !cust.cnpj ? 'cpf' : 'cnpj');
    setFormTradeName(cust.tradeName ?? '');
    setFormLegalName(cust.legalName ?? '');
    setFormCnpj(cust.cnpj ? formatCnpj(cust.cnpj) : '');
    setFormCpf(cust.cpf ? formatCpf(cust.cpf) : '');
    setFormPhone(formatPhone(cust.phone ?? ''));
    setFormAddress(cust.address ?? '');
    setFormNumber(cust.number ?? '');
    setFormComplement(cust.complement ?? '');
    setFormNeighborhood(cust.neighborhood ?? '');
    setFormZipCode(cust.zipCode ? formatCep(cust.zipCode) : '');
    setFormCategory(cust.category ?? 'padarias');
    setFormSellerId(cust.sellerId ?? '');
    setFormIsRevendedor(cust.isReseller);
    setFormCreditLimit(String(cust.creditLimit ?? 0));
    setEditCustomerId(cust.id);
    setIsCreateModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTradeName || !formAddress || !formNeighborhood) {
      toast('Preencha todos os campos obrigatórios (*).', 'error');
      return;
    }

    setSaving(true);
    const isEdit = Boolean(editCustomerId);
    const payload: Record<string, unknown> = {
      tradeName: formTradeName,
      legalName: formLegalName || formTradeName,
      cnpj: formCnpj.replace(/\D/g, '') || undefined,
      cpf: formCpf.replace(/\D/g, '') || undefined,
      phone: formPhone || undefined,
      address: formAddress,
      number: formNumber || 'S/N',
      complement: formComplement || undefined,
      neighborhood: formNeighborhood,
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: formZipCode.replace(/\D/g, '') || undefined,
      category: formCategory,
      sellerId: formSellerId || undefined,
      isReseller: formIsRevendedor,
      creditLimit: formCreditLimit || '0',
    };
    // Na criação fixa coordenadas padrão e status; na edição não sobrescreve o pin.
    if (!isEdit) {
      payload.latitude = -22.9068;
      payload.longitude = -43.1729;
      payload.status = 'ATIVO';
    }

    try {
      const res = await fetch(isEdit ? `/api/customers/${editCustomerId}` : '/api/customers', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        throw new Error(apiErrorMessage(data, isEdit ? 'Erro ao atualizar cliente.' : 'Erro ao cadastrar cliente.'));
      }

      toast(isEdit ? 'Cliente atualizado com sucesso!' : 'Ponto de revenda cadastrado com sucesso!', 'success');
      
      // Limpa formulário e fecha modal
      resetCustomerForm();
      setEditCustomerId(null);
      setIsCreateModalOpen(false);

      // Recarrega lista
      await loadCustomers();
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Exemplo de template JSON para ajudar o administrador
  const templateJson = `[
  {
    "tradeName": "Padaria da Esquina",
    "legalName": "Panificadora Silva Ltda",
    "cnpj": "11222333000144",
    "phone": "2122223333",
    "address": "Rua das Flores, 120",
    "neighborhood": "Tijuca",
    "city": "Rio de Janeiro",
    "state": "RJ",
    "zipCode": "20520-054",
    "latitude": -22.9248,
    "longitude": -43.2322,
    "category": "padarias",
    "notes": "Parceiro com alto movimento de manhã"
  }
]`;

  const customersFiltrados = customers.filter((c) => {
    const term = buscaCliente.trim().toLowerCase();
    const matchesSearch = !term ||
      [c.tradeName, c.legalName, c.neighborhood, c.phone, c.mobile]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)) ||
      (c.cnpj ?? '').includes(term.replace(/\D/g, '')) ||
      (c.cpf ?? '').includes(term.replace(/\D/g, ''));

    const matchesRecurrent = recurrentFilter === 'all' || c.recurrentStatus === recurrentFilter;

    return matchesSearch && matchesRecurrent;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-amber-700" />
            Pontos de Revenda (Clientes)
          </h2>
          <p className="text-xs text-stone-500 font-medium">Controle de clientes homologados e importação de bases de vendas legadas</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link 
            href="/admin/import"
            className="rounded-lg border border-stone-250 bg-white hover:bg-stone-50 px-3.5 py-2 text-stone-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Upload className="h-4 w-4 text-stone-500" />
            Importar Planilha Excel
          </Link>
          <button
            onClick={openCreateCustomer}
            className="rounded-lg bg-amber-700 px-4 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Ponto de Revenda
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2.5 text-xs font-bold border-b-2 uppercase tracking-wide cursor-pointer transition-all ${
            activeTab === 'list' 
              ? 'border-amber-700 text-amber-800' 
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Clientes Ativos ({customers.length})
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`px-6 py-2.5 text-xs font-bold border-b-2 uppercase tracking-wide cursor-pointer transition-all ${
            activeTab === 'import' 
              ? 'border-amber-700 text-amber-800' 
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Importar Base de Clientes (CSV/JSON)
        </button>
      </div>

      {/* Tab Lista de Clientes */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative max-w-md w-full">
              <input
                type="text"
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="Buscar cliente por nome, CNPJ/CPF, bairro ou telefone..."
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {buscaCliente && (<p className="mt-1 text-[10px] text-stone-400">{customersFiltrados.length} resultado(s)</p>)}
            </div>

            {/* Filtro Rápido de Status de Recompra */}
            <div className="flex flex-wrap items-center gap-1.5 bg-stone-100 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setRecurrentFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  recurrentFilter === 'all' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Todos ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => setRecurrentFilter('active')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  recurrentFilter === 'active' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                🟢 Ativos ({customers.filter((c) => c.recurrentStatus === 'active').length})
              </button>
              <button
                type="button"
                onClick={() => setRecurrentFilter('risk')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  recurrentFilter === 'risk' ? 'bg-amber-700 text-white shadow-2xs' : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                🟡 Em Risco ({customers.filter((c) => c.recurrentStatus === 'risk').length})
              </button>
              <button
                type="button"
                onClick={() => setRecurrentFilter('inactive')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  recurrentFilter === 'inactive' ? 'bg-red-700 text-white shadow-2xs' : 'text-red-800 hover:bg-red-50'
                }`}
              >
                🔴 Inativos ({customers.filter((c) => c.recurrentStatus === 'inactive').length})
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
              <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
              <p className="text-xs text-stone-500">Buscando base de clientes...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-750 text-xs text-center">{error}</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center bg-white border border-stone-200 rounded-2xl text-stone-450 italic text-xs">
              Nenhum cliente cadastrado. Use a aba de importação para carregar seus revendedores atuais da Doces Prigor!
            </div>
          ) : customersFiltrados.length === 0 ? (
            <div className="p-8 text-center bg-white border border-stone-200 rounded-2xl text-stone-450 italic text-xs">
              Nenhum cliente encontrado para “{buscaCliente}”.
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden animate-fadeIn">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="p-4">Razão Social / Nome Fantasia</th>
                      <th className="p-4">Documento (CNPJ/CPF)</th>
                      <th className="p-4 text-center">Status Recompra</th>
                      <th className="p-4">Endereço</th>
                      <th className="p-4">Telefone</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">Vendedor Vinculado</th>
                      <th className="p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {customersFiltrados.map((cust) => (
                      <tr key={cust.id} className="hover:bg-stone-50/50">
                        <td className="p-4">
                          <span className="font-bold text-stone-850 block">{cust.tradeName}</span>
                          {cust.legalName && <span className="text-[10px] text-stone-400 block">{cust.legalName}</span>}
                        </td>
                        <td className="p-4 font-mono text-stone-600">
                          {cust.cnpj ? (
                            <span className="inline-block bg-stone-100 px-1.5 py-0.5 rounded text-[11px] font-bold text-stone-800">
                              CNPJ: {formatCnpj(cust.cnpj)}
                            </span>
                          ) : cust.cpf ? (
                            <span className="inline-block bg-amber-50 border border-amber-150 px-1.5 py-0.5 rounded text-[11px] font-bold text-amber-900">
                              CPF: {formatCpf(cust.cpf)}
                            </span>
                          ) : (
                            <span className="text-stone-400 italic">Não informado</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {cust.recurrentStatus === 'active' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Ativo ({cust.daysSinceLastOrder}d)
                            </span>
                          ) : cust.recurrentStatus === 'risk' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-850">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Em Risco ({cust.daysSinceLastOrder}d)
                            </span>
                          ) : cust.recurrentStatus === 'inactive' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-extrabold text-red-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              Inativo ({cust.daysSinceLastOrder}d)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-500">
                              Sem compras
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-stone-600">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                            <span>{cust.address}, {cust.neighborhood}</span>
                          </div>
                        </td>
                        <td className="p-4 text-stone-600">{cust.phone || cust.phone || 'Não informado'}</td>
                        <td className="p-4 capitalize">
                          <span className="rounded-md border border-stone-200 bg-stone-50 text-stone-600 text-[10px] font-semibold px-2 py-0.5 inline-flex items-center gap-1">
                            <Coffee className="h-3 w-3 text-stone-400" />
                            {cust.category}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-stone-800">
                          {cust.sellerName ? (
                            <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">{cust.sellerName}</span>
                          ) : (
                            <span className="text-stone-400 font-medium italic text-[10px]">Sem Vendedor</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {cust.phone && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=55${cust.phone.replace(/\D/g, '')}&text=${encodeURIComponent(
                                  `Olá ${cust.tradeName}! Tudo bem? Passando aqui da Doces Prigor para saber como está o estoque de doces aí na sua loja. Posso separar o seu pedido desta semana? 🍬`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-850 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Enviar mensagem no WhatsApp"
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-emerald-700" />
                                WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => openEditCustomer(cust)}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-bold text-stone-600 hover:bg-amber-50 hover:text-amber-800 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Editar
                            </button>
                            <button
                              onClick={() => openAddresses(cust)}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-bold text-stone-600 hover:bg-amber-50 hover:text-amber-800 cursor-pointer"
                            >
                              <MapPin className="h-3.5 w-3.5" /> Endereços
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Importação */}
      {activeTab === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Caixa de Texto para Colar */}
          <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-1">
            <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
              <Upload className="h-4.5 w-4.5 text-amber-700" />
              Upload da Base
            </h3>
            
            <p className="text-xs text-stone-600 leading-relaxed">
              Cole abaixo sua lista de clientes atuais em formato JSON de acordo com o template de importação.
            </p>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-stone-400 uppercase">Array JSON</label>
              <textarea
                value={rawJsonData}
                onChange={(e) => setRawJsonData(e.target.value)}
                placeholder='[{"tradeName": "Padaria Imperial", ...}]'
                rows={12}
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 font-mono text-[10px] text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              onClick={handleGeneratePreview}
              disabled={previewLoading}
              className="flex w-full justify-center items-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 active:bg-amber-900 transition-all cursor-pointer"
            >
              {previewLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Carregar Preview & Validar'}
            </button>
            
            {/* Template Help Box */}
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase">
                <span>Estrutura do Template</span>
                <span className="text-amber-700 font-extrabold cursor-help" onClick={() => setRawJsonData(templateJson)}>Copiar Modelo</span>
              </div>
              <pre className="text-[9px] text-stone-400 font-mono overflow-x-auto max-h-28">
                {templateJson}
              </pre>
            </div>
          </div>

          {/* Painel de Preview à Direita */}
          <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-2">
            <h3 className="text-sm font-bold text-stone-800">Preview de Pré-Importação</h3>

            {/* Sumário do Preview */}
            {previewSummary && (
              <div className="grid grid-cols-5 gap-3 text-center border-b border-stone-100 pb-4">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-150">
                  <span className="block text-[9px] text-stone-400 font-bold uppercase">Total Linhas</span>
                  <span className="text-lg font-black text-stone-800">{previewSummary.total}</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="block text-[9px] text-emerald-800 font-bold uppercase">Válidos</span>
                  <span className="text-lg font-black text-emerald-950">{previewSummary.valid}</span>
                </div>
                <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                  <span className="block text-[9px] text-yellow-800 font-bold uppercase">Duplicados</span>
                  <span className="text-lg font-black text-yellow-950">{previewSummary.duplicates}</span>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                  <span className="block text-[9px] text-red-800 font-bold uppercase">Conflitos CNPJ</span>
                  <span className="text-lg font-black text-red-950">{previewSummary.conflicts}</span>
                </div>
                <div className="p-3 bg-red-100 rounded-xl border border-red-200">
                  <span className="block text-[9px] text-red-900 font-bold uppercase">Campos Inválidos</span>
                  <span className="text-lg font-black text-red-950">{previewSummary.invalid}</span>
                </div>
              </div>
            )}

            {/* Listagem do Preview */}
            {previewRows.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto max-h-[350px] border border-stone-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-450 font-bold uppercase tracking-wider">
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Bairro / Endereço</th>
                        <th className="p-3">Status Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-[11px]">
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          <td className="p-3">
                            <span className="font-bold text-stone-800 block">{row.row.tradeName}</span>
                            {row.row.cnpj && <span className="font-mono text-[9px] text-stone-400">CNPJ: {row.row.cnpj}</span>}
                          </td>
                          <td className="p-3 text-stone-600">
                            <span className="block">{row.row.address}</span>
                            <span className="text-[10px] text-stone-400">Bairro: {row.row.neighborhood}</span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded font-bold px-2 py-0.5 text-[9px] uppercase border ${
                              row.status === 'VALID' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
                              row.status === 'DUPLICATE' ? 'bg-yellow-50 text-yellow-800 border-yellow-100' :
                              row.status === 'CONFLICT' ? 'bg-orange-50 text-orange-850 border-orange-100' :
                              'bg-red-50 text-red-800 border-red-100'
                            }`}>
                              {row.status === 'VALID' && <Check className="h-3 w-3" />}
                              {row.status !== 'VALID' && <AlertCircle className="h-3 w-3" />}
                              {row.status}
                            </span>
                            <span className="block text-[9px] text-stone-400 mt-0.5">{row.message}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Confirmar Botão */}
                <button
                  onClick={handleConfirmImport}
                  disabled={importLoading || previewSummary?.valid === 0}
                  className="flex w-full justify-center items-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-800 active:bg-emerald-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {importLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Confirmar Importação de Válidos ({previewSummary?.valid || 0})
                </button>
              </div>
            ) : (
              <div className="p-16 text-center border border-dashed border-stone-300 rounded-2xl text-stone-450 italic text-xs">
                Nenhum preview gerado. Cole os dados na caixa ao lado e clique em &quot;Carregar Preview&quot;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Endereços de Entrega */}
      {addrCustomer && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0 bg-stone-50/50">
              <div>
                <h3 className="font-extrabold text-stone-950 text-sm">Endereços de Entrega</h3>
                <p className="text-[10px] text-stone-400 font-semibold mt-0.5">{addrCustomer.tradeName}</p>
              </div>
              <button type="button" onClick={() => setAddrCustomer(null)} className="p-1 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="rounded-lg bg-stone-50 border border-stone-150 p-3 text-[11px] text-stone-600">
                <span className="font-bold text-stone-700">Faturamento (principal):</span> {addrCustomer.address ?? '—'}{addrCustomer.neighborhood ? `, ${addrCustomer.neighborhood}` : ''}. Cadastre abaixo endereços de entrega diferentes; se a entrega for no mesmo do faturamento, não precisa cadastrar nada.
              </div>
              {addrLoading ? (
                <div className="flex items-center gap-2 text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
              ) : addrList.length === 0 ? (
                <p className="text-stone-400 italic">Nenhum endereço de entrega cadastrado (entrega = faturamento).</p>
              ) : (
                <div className="space-y-2">
                  {addrList.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 p-2.5">
                      <div>
                        {a.label && <span className="font-bold text-stone-800 block">{a.label}</span>}
                        <span className="text-stone-600">{a.address}{a.number ? `, ${a.number}` : ''}{a.neighborhood ? ` — ${a.neighborhood}` : ''}</span>
                        <span className="text-stone-400 block text-[10px]">{a.city}{a.state ? `/${a.state}` : ''} {a.zipCode ?? ''}</span>
                      </div>
                      <button onClick={() => removeAddress(a.id)} className="p-1 text-stone-400 hover:text-red-600 cursor-pointer shrink-0"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={addAddress} className="rounded-xl border border-stone-200 p-3 space-y-2 bg-stone-50/40">
                <span className="text-[10px] font-black text-stone-500 uppercase">Novo endereço de entrega</span>
                <input type="text" placeholder="Apelido (ex: Filial Centro)" value={naLabel} onChange={(e) => setNaLabel(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Endereço" value={naAddress} onChange={(e) => setNaAddress(e.target.value)} className="col-span-2 block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" required />
                  <input type="text" placeholder="Número" value={naNumber} onChange={(e) => setNaNumber(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Bairro" value={naNeighborhood} onChange={(e) => setNaNeighborhood(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                  <input type="text" placeholder="Cidade" value={naCity} onChange={(e) => setNaCity(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                  <input type="text" placeholder="UF" maxLength={2} value={naState} onChange={(e) => setNaState(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                </div>
                <input type="text" placeholder="CEP" value={naZip} onChange={(e) => setNaZip(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900" />
                <button type="submit" disabled={naSaving} className="w-full rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold py-2 cursor-pointer flex items-center justify-center gap-1.5"><Plus className="h-4 w-4" />{naSaving ? 'Adicionando...' : 'Adicionar endereço'}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Novo Ponto de Revenda (Cliente) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0 bg-stone-50/50">
              <div>
                <h3 className="font-extrabold text-stone-950 text-sm">{editCustomerId ? 'Editar Cliente' : 'Cadastrar Novo Ponto de Revenda'}</h3>
                <p className="text-[10px] text-stone-400 font-semibold uppercase mt-0.5">Homologação Individual de Clientes</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCreateModalOpen(false)} 
                className="p-1 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs font-semibold text-stone-700">
              
              {/* Documento: CNPJ ou CPF */}
              <div className="bg-stone-50/50 border border-stone-200 p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-stone-400 font-bold uppercase block">Tipo de Documento</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDocType('cnpj')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                        docType === 'cnpj'
                          ? 'bg-amber-700 text-white'
                          : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                      }`}
                    >
                      Pessoa Jurídica (CNPJ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocType('cpf')}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                        docType === 'cpf'
                          ? 'bg-amber-700 text-white'
                          : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                      }`}
                    >
                      Pessoa Física (CPF)
                    </button>
                  </div>
                </div>

                {docType === 'cnpj' ? (
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CNPJ</label>
                      <input 
                        type="text"
                        placeholder="00.000.000/0000-00"
                        value={formCnpj}
                        onChange={(e) => setFormCnpj(formatCnpj(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white focus:outline-none"
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleQueryCNPJ}
                      disabled={cnpjLoading}
                      className="rounded-lg bg-stone-950 hover:bg-stone-850 text-white font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px] disabled:opacity-50"
                    >
                      {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : 'Consultar CNPJ'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CPF</label>
                    <input 
                      type="text"
                      placeholder="000.000.000-00"
                      value={formCpf}
                      onChange={(e) => setFormCpf(formatCpf(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Informações Básicas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Nome / Nome Fantasia *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Padaria da Esquina ou João Silva"
                    value={formTradeName}
                    onChange={(e) => setFormTradeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Razão Social (se houver)</label>
                  <input 
                    type="text"
                    placeholder="Ex: Panificadora Silva Ltda"
                    value={formLegalName}
                    onChange={(e) => setFormLegalName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Telefone / WhatsApp</label>
                  <input 
                    type="text"
                    placeholder="(21) 99999-9999"
                    value={formPhone}
                    onChange={(e) => setFormPhone(formatPhone(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Perfil Comercial</label>
                  <select 
                    value={formIsRevendedor ? 'true' : 'false'}
                    onChange={(e) => setFormIsRevendedor(e.target.value === 'true')}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none text-stone-850"
                  >
                    <option value="true">Revendedor (Atacado)</option>
                    <option value="false">Consumidor (Varejo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Limite de Crédito (R$) — 0 = sem limite</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formCreditLimit}
                  onChange={(e) => setFormCreditLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                />
              </div>

              {/* Endereço & CEP */}
              <div className="border-t border-stone-100 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">Endereço de Entrega</span>
                  <span className="text-[9px] text-stone-400 italic">Digite o CEP para preencher o endereço automaticamente</span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CEP</label>
                    <input 
                      type="text"
                      placeholder="00000-000"
                      value={formZipCode}
                      onChange={(e) => handleZipCodeChange(e.target.value)}
                      onBlur={() => handleQueryCEP()}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => handleQueryCEP()}
                    disabled={cepLoading}
                    className="rounded-lg border border-amber-250 bg-amber-700/5 hover:bg-amber-700/10 text-amber-800 font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px] disabled:opacity-50"
                  >
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin text-amber-700" /> : 'Buscar CEP'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Endereço de Entrega *</label>
                    <input 
                      type="text"
                      required
                      placeholder="Av, Rua, etc."
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Número</label>
                    <input 
                      type="text"
                      placeholder="Ex: 123"
                      value={formNumber}
                      onChange={(e) => setFormNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Bairro *</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: São Cristóvão"
                      value={formNeighborhood}
                      onChange={(e) => setFormNeighborhood(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Ponto de Referência / Complemento</label>
                    <input 
                      type="text"
                      placeholder="Ex: Próximo ao mercado"
                      value={formComplement}
                      onChange={(e) => setFormComplement(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Relações Comerciais */}
              <div className="border-t border-stone-100 pt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Categoria de Revenda</label>
                  <select 
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none text-stone-850"
                  >
                    <option value="padarias">Padarias</option>
                    <option value="cafeterias">Cafeterias</option>
                    <option value="confeitarias">Confeitarias</option>
                    <option value="lanchonetes">Lanchonetes</option>
                    <option value="açaiterias">Açaiterias</option>
                    <option value="conveniências">Conveniências</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Vendedor Vinculado (Carteira)</label>
                  <select 
                    value={formSellerId}
                    onChange={(e) => setFormSellerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none text-stone-850"
                  >
                    <option value="">Nenhum (Carteira Livre)</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-stone-250 hover:bg-stone-50 px-4 py-2 font-bold cursor-pointer transition-all text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving || !formTradeName || !formAddress || !formNeighborhood}
                  className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-white font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50 text-xs"
                >
                  {saving ? 'Salvando...' : (editCustomerId ? 'Salvar Alterações' : 'Homologar Cliente')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

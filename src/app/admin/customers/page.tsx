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
  X
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
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

export default function AdminCustomersPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');
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
  const [formTradeName, setFormTradeName] = useState('');
  const [formLegalName, setFormLegalName] = useState('');
  const [formCnpj, setFormCnpj] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formNeighborhood, setFormNeighborhood] = useState('');
  const [formZipCode, setFormZipCode] = useState('');
  const [formCategory, setFormCategory] = useState('padarias');
  const [formSellerId, setFormSellerId] = useState('');
  const [formIsRevendedor, setFormIsRevendedor] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

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
      alert('Por favor, insira os dados em formato de lista (Array JSON) para preview.');
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
      alert(errorMessage(err));
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
      alert(`Importação concluída! ${json.summary?.imported} clientes novos foram importados com sucesso.`);
      setActiveTab('list');
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setImportLoading(false);
    }
  };

  const handleQueryCNPJ = async () => {
    const cleanCnpj = formCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      alert('Digite um CNPJ válido com 14 dígitos para buscar.');
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
      alert('Dados cadastrais preenchidos a partir da Receita Federal!');
    } catch (err: unknown) {
      alert('Erro ao buscar CNPJ: ' + errorMessage(err));
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleQueryCEP = async () => {
    const cleanCep = formZipCode.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      alert('Digite um CEP válido com 8 dígitos para buscar.');
      return;
    }

    setCepLoading(true);
    try {
      const res = await fetch(`/api/tools/cep?cep=${cleanCep}`);
      if (!res.ok) throw new Error('CEP não encontrado ou indisponível.');
      const data: CepLookup = await res.json();

      setFormAddress(data.street || '');
      setFormNeighborhood(data.neighborhood || '');
      alert('Endereço do CEP carregado!');
    } catch (err: unknown) {
      alert('Erro ao consultar CEP: ' + errorMessage(err));
    } finally {
      setCepLoading(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTradeName || !formAddress || !formNeighborhood) {
      alert('Por favor, preencha todos os campos obrigatórios (*).');
      return;
    }

    setSaving(true);
    const payload = {
      tradeName: formTradeName,
      legalName: formLegalName || formTradeName,
      cnpj: formCnpj.replace(/\D/g, '') || undefined,
      phone: formPhone || undefined,
      address: formAddress,
      number: formNumber || 'S/N',
      complement: formComplement || undefined,
      neighborhood: formNeighborhood,
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: formZipCode.replace(/\D/g, '') || undefined,
      latitude: -22.9068, // Fábrica default
      longitude: -43.1729,
      category: formCategory,
      sellerId: formSellerId || undefined,
      isReseller: formIsRevendedor,
      status: 'ATIVO'
    };

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        throw new Error(apiErrorMessage(data, 'Erro ao cadastrar cliente.'));
      }

      alert('🎉 Ponto de revenda cadastrado com sucesso!');
      
      // Limpa formulário e fecha modal
      setFormTradeName('');
      setFormLegalName('');
      setFormCnpj('');
      setFormPhone('');
      setFormAddress('');
      setFormNumber('');
      setFormComplement('');
      setFormNeighborhood('');
      setFormZipCode('');
      setFormSellerId('');
      setIsCreateModalOpen(false);

      // Recarrega lista
      await loadCustomers();
    } catch (err: unknown) {
      alert(errorMessage(err));
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
            onClick={() => setIsCreateModalOpen(true)}
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
          ) : (
            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden animate-fadeIn">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="p-4">Razão Social / Nome Fantasia</th>
                      <th className="p-4">CNPJ</th>
                      <th className="p-4">Endereço</th>
                      <th className="p-4">Telefone</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">Vendedor Vinculado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {customers.map((cust) => (
                      <tr key={cust.id} className="hover:bg-stone-50/50">
                        <td className="p-4">
                          <span className="font-bold text-stone-850 block">{cust.tradeName}</span>
                          {cust.legalName && <span className="text-[10px] text-stone-400 block">{cust.legalName}</span>}
                        </td>
                        <td className="p-4 font-mono text-stone-600">{cust.cnpj || 'Não informado'}</td>
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

      {/* Modal de Cadastro de Novo Ponto de Revenda (Cliente) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0 bg-stone-50/50">
              <div>
                <h3 className="font-extrabold text-stone-950 text-sm">Cadastrar Novo Ponto de Revenda</h3>
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
              
              {/* CNPJ + Busca Automática */}
              <div className="grid grid-cols-3 gap-2 items-end bg-stone-50/50 border border-stone-200 p-3 rounded-xl">
                <div className="col-span-2">
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CNPJ (Opcional - Recomendado)</label>
                  <input 
                    type="text"
                    placeholder="Sem pontuação"
                    value={formCnpj}
                    onChange={(e) => setFormCnpj(e.target.value)}
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

              {/* Informações Básicas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Nome Fantasia *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Padaria da Esquina"
                    value={formTradeName}
                    onChange={(e) => setFormTradeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Razão Social</label>
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

              {/* Endereço & CEP */}
              <div className="border-t border-stone-100 pt-3 space-y-3">
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">Endereço de Entrega</span>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CEP</label>
                    <input 
                      type="text"
                      placeholder="Sem traço"
                      value={formZipCode}
                      onChange={(e) => setFormZipCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={handleQueryCEP}
                    disabled={cepLoading}
                    className="rounded-lg border border-amber-250 bg-amber-700/5 hover:bg-amber-700/10 text-amber-800 font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px] disabled:opacity-50"
                  >
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin text-amber-700" /> : 'Consultar CEP'}
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
                  {saving ? 'Cadastrando...' : 'Homologar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

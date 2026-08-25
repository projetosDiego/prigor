'use client';

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Upload, 
  Check, 
  AlertCircle, 
  HelpCircle, 
  Loader2, 
  FileText,
  MapPin,
  Coffee,
  CheckCircle2
} from 'lucide-react';

interface Customer {
  id: string;
  tradeName: string;
  legalName?: string;
  cnpj?: string;
  phone?: string;
  address: string;
  neighborhood: string;
  category: string;
  seller?: { name: string } | null;
}

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

export default function AdminCustomersPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de importação
  const [rawJsonData, setRawJsonData] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<any>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/customers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar clientes.');
      setCustomers(data.customers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!rawJsonData.trim()) {
      alert('Por favor, insira os dados em formato de lista (Array JSON) para preview.');
      return;
    }

    setPreviewLoading(true);
    setPreviewSummary(null);
    setPreviewRows([]);
    setImportSummary(null);

    try {
      // Tentar parsear JSON na mão para testar validade
      let rows;
      try {
        rows = JSON.parse(rawJsonData);
      } catch (err) {
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

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao processar preview.');

      setPreviewSummary(json.summary);
      setPreviewRows(json.preview || []);
    } catch (err: any) {
      alert(err.message);
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

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao realizar importação.');

      setImportSummary(json.summary);
      setPreviewRows([]);
      setPreviewSummary(null);
      setRawJsonData('');
      
      // Recarregar clientes
      await loadCustomers();
      alert(`Importação concluída! ${json.summary.imported} clientes novos foram importados com sucesso.`);
      setActiveTab('list');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImportLoading(false);
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
      <div>
        <h2 className="text-2xl font-black text-stone-900 tracking-tight">Pontos de Revenda (Clientes)</h2>
        <p className="text-xs text-stone-500 font-medium">Controle de clientes homologados e importação de bases de vendas legadas</p>
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
                          {cust.seller ? (
                            <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">{cust.seller.name}</span>
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
                Nenhum preview gerado. Cole os dados na caixa ao lado e clique em "Carregar Preview".
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

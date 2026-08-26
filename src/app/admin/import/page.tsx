'use client';

import React, { useState } from 'react';
import { 
  Upload, 
  FileText, 
  Package, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  Info
} from 'lucide-react';

export default function AdminImportPage() {
  // Estados para Clientes
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerResult, setCustomerResult] = useState<any | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Estados para Produtos
  const [productFile, setProductFile] = useState<File | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productResult, setProductResult] = useState<any | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  const handleImportCustomers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerFile) return;

    setCustomerLoading(true);
    setCustomerError(null);
    setCustomerResult(null);

    const formData = new FormData();
    formData.append('file', customerFile);

    try {
      const res = await fetch('/api/admin/import/customers', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao importar clientes.');
      }

      setCustomerResult(data);
      setCustomerFile(null);
      // Reset input element
      const input = document.getElementById('customer-file-input') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err: any) {
      setCustomerError(err.message);
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleImportProducts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFile) return;

    setProductLoading(true);
    setProductError(null);
    setProductResult(null);

    const formData = new FormData();
    formData.append('file', productFile);

    try {
      const res = await fetch('/api/admin/import/products', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao importar produtos.');
      }

      setProductResult(data);
      setProductFile(null);
      // Reset input element
      const input = document.getElementById('product-file-input') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err: any) {
      setProductError(err.message);
    } finally {
      setProductLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
          <Upload className="h-5.5 w-5.5 text-amber-700" />
          Carga de Dados e Importação de Planilhas
        </h2>
        <p className="text-xs text-stone-500 font-semibold mt-0.5">
          Atualize a carteira de clientes ou os produtos do sistema carregando arquivos Excel (.xlsx) ou CSV.
        </p>
      </div>

      {/* Info Card de Instruções */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-xs font-semibold text-blue-800 flex gap-3">
        <Info className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-extrabold text-blue-900 block">Dica de Arquivos Locais:</span>
          <p>
            Você pode encontrar as planilhas prontas para teste no seu computador em:
          </p>
          <ul className="list-disc pl-4 mt-1 font-bold space-y-0.5">
            <li>Clientes: <code className="bg-blue-100 px-1 py-0.5 rounded text-stone-800">C:\projetos\leed-doces-prigor\ListaClientes (1).xlsx</code></li>
            <li>Produtos: <code className="bg-blue-100 px-1 py-0.5 rounded text-stone-800">C:\projetos\leed-doces-prigor\Produtos (1).xlsx</code></li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Importar Clientes */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-stone-100">
            <div className="p-2 rounded-xl bg-amber-700/10 text-amber-800">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-950 text-sm">Importar Clientes</h3>
              <p className="text-[10px] text-stone-400 font-semibold">Tabela de Leads / Carteira de Clientes</p>
            </div>
          </div>

          <form onSubmit={handleImportCustomers} className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
                Suporta planilhas contendo as colunas: <strong>CNPJ</strong>, <strong>Nome Fantasia</strong>, <strong>Telefone</strong>, <strong>Endereço</strong>, <strong>Bairro</strong> e <strong>CEP</strong>.
              </p>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-stone-200 rounded-xl p-6 bg-stone-50 hover:bg-stone-100/50 transition-all cursor-pointer relative">
                <input 
                  id="customer-file-input"
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="h-8 w-8 text-stone-400 mb-2" />
                <span className="text-[11px] text-stone-600 font-bold text-center">
                  {customerFile ? customerFile.name : 'Selecionar planilha de clientes'}
                </span>
                <span className="text-[9px] text-stone-400 mt-1">Excel (.xlsx) ou CSV de até 10MB</span>
              </div>

              {/* Feedbacks de Resultado */}
              {customerError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-700 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{customerError}</span>
                </div>
              )}

              {customerResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-[11px] font-semibold text-green-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-extrabold text-green-950 mb-1">
                    <CheckCircle className="h-4 w-4" />
                    Importação Concluída!
                  </div>
                  <p>Registros Processados: <strong>{customerResult.totalProcessed}</strong></p>
                  <p>Clientes Novos: <strong>{customerResult.inserted}</strong></p>
                  <p>Clientes Atualizados: <strong>{customerResult.updated}</strong></p>
                  {customerResult.skipped > 0 && <p className="text-amber-800">Linhas ignoradas: {customerResult.skipped}</p>}
                </div>
              )}
            </div>

            <button 
              type="submit"
              disabled={customerLoading || !customerFile}
              className="w-full rounded-xl bg-amber-700 hover:bg-amber-800 py-2.5 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {customerLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Enviar Planilha de Clientes</span>
              )}
            </button>
          </form>
        </div>

        {/* Card Importar Produtos */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-stone-100">
            <div className="p-2 rounded-xl bg-amber-700/10 text-amber-800">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-950 text-sm">Importar Produtos</h3>
              <p className="text-[10px] text-stone-400 font-semibold">Tabela de Produtos e Insumos do ERP</p>
            </div>
          </div>

          <form onSubmit={handleImportProducts} className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
                Suporta planilhas contendo: <strong>Descrição (Nome)</strong>, <strong>Código Interno (SKU)</strong>, <strong>Preço de Custo</strong>, <strong>Venda Varejo/Atacado</strong>, <strong>Ativo</strong> e <strong>Estoque</strong>.
              </p>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-stone-200 rounded-xl p-6 bg-stone-50 hover:bg-stone-100/50 transition-all cursor-pointer relative">
                <input 
                  id="product-file-input"
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setProductFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="h-8 w-8 text-stone-400 mb-2" />
                <span className="text-[11px] text-stone-600 font-bold text-center">
                  {productFile ? productFile.name : 'Selecionar planilha de produtos'}
                </span>
                <span className="text-[9px] text-stone-400 mt-1">Excel (.xlsx) ou CSV de até 10MB</span>
              </div>

              {/* Feedbacks de Resultado */}
              {productError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-700 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{productError}</span>
                </div>
              )}

              {productResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-[11px] font-semibold text-green-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-extrabold text-green-950 mb-1">
                    <CheckCircle className="h-4 w-4" />
                    Importação Concluída!
                  </div>
                  <p>Registros Processados: <strong>{productResult.totalProcessed}</strong></p>
                  <p>Produtos Novos: <strong>{productResult.inserted}</strong></p>
                  <p>Produtos Atualizados: <strong>{productResult.updated}</strong></p>
                  {productResult.skipped > 0 && <p className="text-amber-800">Linhas ignoradas: {productResult.skipped}</p>}
                </div>
              )}
            </div>

            <button 
              type="submit"
              disabled={productLoading || !productFile}
              className="w-full rounded-xl bg-amber-700 hover:bg-amber-800 py-2.5 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {productLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Enviar Planilha de Produtos</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

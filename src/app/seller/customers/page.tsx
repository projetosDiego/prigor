'use client';

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  X, 
  Loader2, 
  RefreshCw, 
  UserPlus, 
  Phone, 
  MapPin, 
  Building2, 
  Navigation
} from 'lucide-react';

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

interface Cliente {
  id: string;
  nome: string;
  is_revendedor: boolean;
  cnpj?: string;
  cpf?: string;
  phone?: string;
  endereco?: string;
  bairro?: string;
  city?: string;
}

export default function SellerCustomersPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);

  // Form Fields
  const [nome, setNome] = useState('');
  const [isRevendedor, setIsRevendedor] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('Rio de Janeiro');
  const [estado, setEstado] = useState('RJ');
  const [cep, setCep] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Estados de busca
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/erp/clientes');
      if (!res.ok) throw new Error('Falha ao buscar carteira de clientes.');
      const data = await res.json();
      setClientes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Consulta CNPJ na Receita via BrasilAPI
  const handleQueryCNPJ = async () => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      alert('Digite um CNPJ válido com 14 dígitos para buscar.');
      return;
    }

    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${cleanCnpj}`);
      if (!res.ok) throw new Error('CNPJ não encontrado ou indisponível.');
      const data = await res.json();

      // Preenche os campos do formulário
      setNome(data.nome_fantasia || data.razao_social || '');
      setPhone(data.ddd_telefone_1 || '');
      setEmail(data.email || '');
      setEndereco(`${data.logradouro}, ${data.numero}${data.complemento ? ' - ' + data.complemento : ''}`);
      setBairro(data.bairro || '');
      setCidade(data.municipio || 'Rio de Janeiro');
      setEstado(data.uf || 'RJ');
      setCep(data.cep || '');
      
      alert('Dados cadastrais preenchidos a partir da Receita Federal!');
    } catch (err: any) {
      alert('Erro ao consultar CNPJ: ' + err.message);
    } finally {
      setCnpjLoading(false);
    }
  };

  // Captura o GPS local em tempo real
  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada no seu dispositivo.');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        alert('Coordenadas de GPS capturadas com sucesso!');
      },
      (err) => {
        console.error(err);
        alert('Permissão de GPS negada.');
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return;

    setSaving(true);
    const payload = {
      nome,
      is_revendedor: isRevendedor,
      cnpj: cnpj || undefined,
      cpf: cpf || undefined,
      phone: phone || undefined,
      email: email || undefined,
      endereco: endereco || undefined,
      bairro: bairro || undefined,
      cidade: cidade || undefined,
      estado: estado || undefined,
      cep: cep || undefined,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      ativo: true
    };

    try {
      const res = await fetch('/api/erp/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Erro ao cadastrar cliente.');
      }

      setIsModalOpen(false);
      // Reset Form
      setNome('');
      setIsRevendedor(false);
      setCnpj('');
      setCpf('');
      setPhone('');
      setEmail('');
      setEndereco('');
      setBairro('');
      setCep('');
      setLatitude('');
      setLongitude('');
      
      fetchClientes();
      alert('🎉 Novo parceiro cadastrado com sucesso na base do Doces Prigor OS!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtro local de busca
  const filtered = clientes.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cnpj && c.cnpj.includes(searchTerm)) ||
    (c.bairro && c.bairro.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4 max-w-md mx-auto text-xs font-semibold text-stone-700">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <Users className="h-5.5 w-5.5 text-amber-700" />
            Meus Clientes
          </h2>
          <p className="text-[10px] text-stone-500 font-semibold">Gerencie e cadastre parceiros na sua carteira</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-amber-700 px-3.5 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <UserPlus className="h-4 w-4" />
          Novo Parceiro
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <input 
          type="text"
          placeholder="Buscar cliente, bairro ou CNPJ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none"
        />
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-700" /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 border border-red-200 rounded-xl text-center">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 p-4">
          <Users className="h-10 w-10 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-500 text-xs font-bold">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs flex justify-between items-start">
              <div className="min-w-0 pr-3">
                <span className="text-stone-850 font-bold text-sm block truncate">{c.nome}</span>
                {c.cnpj && <span className="text-[10px] text-stone-400 font-mono block mt-0.5">CNPJ: {c.cnpj}</span>}
                <span className="text-[10px] text-stone-450 block font-medium mt-1">
                  📍 {c.endereco || 'Campo de São Cristóvão'} • Bairro: {c.bairro || 'Centro'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-500 transition-all">
                    <Phone className="h-4 w-4 text-amber-750" />
                  </a>
                )}
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                  c.is_revendedor ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-stone-50 text-stone-700'
                }`}>
                  {c.is_revendedor ? 'Revendedor' : 'Varejo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-4.5 py-3.5 border-b border-stone-100 shrink-0">
              <h3 className="font-extrabold text-stone-900 text-sm flex items-center gap-1.5">
                <UserPlus className="h-4.5 w-4.5 text-amber-700" />
                Cadastrar Novo Cliente
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-4.5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-3.5">
                
                {/* Busca CNPJ */}
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CNPJ do Estabelecimento</label>
                    <input 
                      type="text"
                      placeholder="Ex: 64.189.960/0001-24"
                      value={cnpj}
                      onChange={(e) => setCnpj(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={handleQueryCNPJ}
                    disabled={cnpjLoading}
                    className="rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px]"
                  >
                    {cnpjLoading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Building2 className="h-4.5 w-4.5" />}
                    <span className="ml-1">Buscar CNPJ</span>
                  </button>
                </div>

                <div className="border-t border-stone-100 pt-3 space-y-3">
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Nome Fantasia / Razão Social *</label>
                    <input 
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: Padaria do Bairro"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CPF (Opcional)</label>
                      <input 
                        type="text"
                        value={cpf}
                        onChange={(e) => setCpf(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Perfil Comercial</label>
                      <select 
                        value={isRevendedor ? 'true' : 'false'}
                        onChange={(e) => setIsRevendedor(e.target.value === 'true')}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      >
                        <option value="false">Consumidor (Varejo)</option>
                        <option value="true">Revendedor (Atacado)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Telefone / WhatsApp</label>
                      <input 
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">E-mail</label>
                      <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                <div className="border-t border-stone-100 pt-3 space-y-3">
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Endereço Completo</label>
                    <input 
                      type="text"
                      placeholder="Ex: Av. Principal, 123"
                      value={endereco}
                      onChange={(e) => setEndereco(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Bairro</label>
                      <input 
                        type="text"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CEP</label>
                      <input 
                        type="text"
                        value={cep}
                        onChange={(e) => setCep(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* GPS */}
                <div className="border-t border-stone-100 pt-3 grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-[8px] text-stone-400 font-bold uppercase block mb-0.5">Latitude</label>
                      <input 
                        type="text"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                        placeholder="-22.9068"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-stone-400 font-bold uppercase block mb-0.5">Longitude</label>
                      <input 
                        type="text"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                        placeholder="-43.1729"
                      />
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={handleCaptureGPS}
                    className="rounded-lg border border-amber-250 bg-amber-700/5 hover:bg-amber-700/10 text-amber-800 font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px]"
                  >
                    <Navigation className="h-4 w-4" />
                    <span className="ml-1">GPS Atual</span>
                  </button>
                </div>

              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-stone-250 hover:bg-stone-50 px-4 py-2 font-bold cursor-pointer transition-all text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving || !nome}
                  className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-white font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50 text-xs"
                >
                  {saving ? 'Cadastrando...' : 'Salvar Cadastro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

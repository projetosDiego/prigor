'use client';

/**
 * Scanner de Produção — movimentação de estoque por código de barras.
 *
 * Tela operada em pé, no chão de fábrica, com leitor de código de barras e
 * teclado numérico. Quem opera está de mãos ocupadas: o mouse não é uma opção
 * e o campo de código precisa estar sempre pronto para receber a próxima
 * bipada, sem clique nenhum.
 *
 * O fluxo é o mesmo do scanner do sistema antigo (FastAPI), em três etapas:
 *
 *   1. OPERAÇÃO  — teclas 1–4 pré-selecionam o tipo de movimento, Enter ativa.
 *   2. CÓDIGO    — o leitor digita o código e manda Enter; busca o produto.
 *   3. QUANTIDADE— quantidade (já vem 1) e Enter grava o movimento.
 *
 * Depois de gravar, volta para a etapa 2 com a mesma operação ativa: uma
 * jornada de produção é dezenas de bipadas do mesmo tipo seguidas.
 *
 * As teclas 1–4 só são capturadas na etapa 1, quando o campo de código está
 * desabilitado. Capturá-las com o campo focado (como fazia a primeira versão
 * do scanner antigo) engolia o primeiro dígito de qualquer código começado em
 * 1, 2, 3 ou 4.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScanLine,
  ArrowDownCircle,
  ArrowUpCircle,
  ShoppingCart,
  PackagePlus,
  Volume2,
  VolumeX,
  Loader2,
  AlertTriangle,
  History,
  Keyboard,
  RotateCcw,
} from 'lucide-react';
import { apiErrorMessage } from '@/lib/errors';
import type { StockLookupDTO, MovementResultDTO, MovementHistoryDTO } from '@/lib/api-types';

/** Os quatro tipos de movimento, amarrados ao que o servidor aceita. */
type TipoMovimento = MovementResultDTO['type'];

type Etapa = 'operacao' | 'codigo' | 'quantidade';

interface ModoConfig {
  tipo: TipoMovimento;
  tecla: '1' | '2' | '3' | '4';
  titulo: string;
  linha1: string;
  linha2: string;
  direcao: 'entrada' | 'saida';
  Icone: React.ComponentType<{ className?: string }>;
  /** Classes do cartão quando o modo está ativo. */
  ativo: string;
  /** Classes do cartão quando o modo está apenas pré-selecionado. */
  preSelecionado: string;
  /** Cor do texto/ícone em estado neutro. */
  cor: string;
  /** Etiqueta compacta usada no histórico. */
  etiqueta: string;
  badge: string;
}

const MODOS: readonly ModoConfig[] = [
  {
    tipo: 'baixa_insumo',
    tecla: '1',
    titulo: 'Baixa de Insumo',
    linha1: 'Baixa de',
    linha2: 'Insumo',
    direcao: 'saida',
    Icone: ArrowDownCircle,
    ativo: 'border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-600/30',
    preSelecionado: 'border-rose-500 bg-rose-50 text-rose-800 ring-4 ring-rose-200',
    cor: 'text-rose-600',
    etiqueta: 'BAIXA INS',
    badge: 'bg-rose-100 text-rose-700',
  },
  {
    tipo: 'entrada_recheio',
    tecla: '2',
    titulo: 'Entrada de Recheio',
    linha1: 'Entrada de',
    linha2: 'Recheio',
    direcao: 'entrada',
    Icone: ArrowUpCircle,
    ativo: 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/30',
    preSelecionado: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-4 ring-emerald-200',
    cor: 'text-emerald-600',
    etiqueta: 'ENT. REC',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    tipo: 'entrada_produto',
    tecla: '3',
    titulo: 'Entrada de Brownie',
    linha1: 'Entrada de',
    linha2: 'Brownie',
    direcao: 'entrada',
    Icone: PackagePlus,
    ativo: 'border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-600/30',
    preSelecionado: 'border-sky-500 bg-sky-50 text-sky-800 ring-4 ring-sky-200',
    cor: 'text-sky-600',
    etiqueta: 'ENT. BRW',
    badge: 'bg-sky-100 text-sky-700',
  },
  {
    tipo: 'saida_venda',
    tecla: '4',
    titulo: 'Saída / Venda (PDV)',
    linha1: 'Saída /',
    linha2: 'Venda',
    direcao: 'saida',
    Icone: ShoppingCart,
    ativo: 'border-amber-600 bg-amber-600 text-white shadow-lg shadow-amber-600/30',
    preSelecionado: 'border-amber-500 bg-amber-50 text-amber-800 ring-4 ring-amber-200',
    cor: 'text-amber-600',
    etiqueta: 'VENDA PDV',
    badge: 'bg-amber-100 text-amber-700',
  },
];

function modoDe(tipo: TipoMovimento | null): ModoConfig | null {
  if (!tipo) return null;
  return MODOS.find((m) => m.tipo === tipo) ?? null;
}

/** O histórico devolve `type` como string solta; aqui ele vira etiqueta. */
function etiquetaDe(tipo: string): { etiqueta: string; badge: string } {
  const modo = MODOS.find((m) => m.tipo === tipo);
  if (modo) return { etiqueta: modo.etiqueta, badge: modo.badge };
  return { etiqueta: tipo.toUpperCase(), badge: 'bg-stone-100 text-stone-600' };
}

// ─── Áudio ────────────────────────────────────────────────────────────────────
// Sem arquivo externo: osciladores da Web Audio API. O chão de fábrica é
// barulhento, então o retorno sonoro é o que confirma a bipada para quem está
// de costas para a tela.

type Bip = 'selecao' | 'confirma' | 'ok' | 'erro' | 'alerta';

interface Nota {
  freq: number;
  duracao: number;
  tipo: OscillatorType;
  volume: number;
  atraso: number;
}

const NOTAS: Readonly<Record<Bip, readonly Nota[]>> = {
  selecao: [{ freq: 620, duracao: 45, tipo: 'sine', volume: 0.18, atraso: 0 }],
  confirma: [
    { freq: 880, duracao: 55, tipo: 'sine', volume: 0.22, atraso: 0 },
    { freq: 1100, duracao: 55, tipo: 'sine', volume: 0.22, atraso: 0.06 },
  ],
  ok: [
    { freq: 1000, duracao: 80, tipo: 'sine', volume: 0.25, atraso: 0 },
    { freq: 1400, duracao: 60, tipo: 'sine', volume: 0.25, atraso: 0.09 },
  ],
  erro: [{ freq: 200, duracao: 300, tipo: 'sawtooth', volume: 0.2, atraso: 0 }],
  alerta: [{ freq: 320, duracao: 120, tipo: 'triangle', volume: 0.2, atraso: 0 }],
};

// ─── Formatação ───────────────────────────────────────────────────────────────

function formatarQtd(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatarHora(iso: string | null): string {
  if (!iso) return '--:--';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '--:--';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function StockScannerPage() {
  const [preSelecionado, setPreSelecionado] = useState<TipoMovimento | null>(null);
  const [modo, setModo] = useState<TipoMovimento | null>(null);
  const [produto, setProduto] = useState<StockLookupDTO | null>(null);

  const [codigo, setCodigo] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  const [buscando, setBuscando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<MovementResultDTO | null>(null);

  const [historico, setHistorico] = useState<MovementHistoryDTO[]>([]);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  const [som, setSom] = useState(true);
  const [relogio, setRelogio] = useState('');

  /** Incrementado sempre que o foco precisa voltar para o campo da etapa. */
  const [focoSeq, setFocoSeq] = useState(0);

  const codigoRef = useRef<HTMLInputElement>(null);
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const etapa: Etapa = modo === null ? 'operacao' : produto === null ? 'codigo' : 'quantidade';
  const modoAtivo = modoDe(modo);
  const modoPre = modoDe(preSelecionado);

  const devolverFoco = useCallback(() => {
    setFocoSeq((n) => n + 1);
  }, []);

  // ── som ────────────────────────────────────────────────────────────────────
  const bipar = useCallback(
    (nome: Bip) => {
      if (!som) return;
      try {
        if (!audioRef.current) audioRef.current = new AudioContext();
        const ctx = audioRef.current;
        if (ctx.state === 'suspended') void ctx.resume();

        for (const nota of NOTAS[nome]) {
          const inicio = ctx.currentTime + nota.atraso;
          const fim = inicio + nota.duracao / 1000;
          const osc = ctx.createOscillator();
          const ganho = ctx.createGain();
          osc.connect(ganho);
          ganho.connect(ctx.destination);
          osc.type = nota.tipo;
          osc.frequency.value = nota.freq;
          ganho.gain.setValueAtTime(nota.volume, inicio);
          ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
          osc.start(inicio);
          osc.stop(fim);
        }
      } catch {
        // Sem áudio disponível no navegador: a tela continua operando normalmente.
      }
    },
    [som],
  );

  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close();
      ref.current = null;
    };
  }, []);

  // ── relógio ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setRelogio(new Date().toLocaleTimeString('pt-BR'));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── histórico ──────────────────────────────────────────────────────────────
  const carregarHistorico = useCallback(async () => {
    try {
      const res = await fetch('/api/stock/movements?range=today&limit=30');
      const payload: unknown = await res.json();
      if (!res.ok) {
        setErroHistorico(apiErrorMessage(payload, 'Não foi possível carregar o histórico.'));
        return;
      }
      setErroHistorico(null);
      setHistorico(payload as MovementHistoryDTO[]);
    } catch {
      setErroHistorico('Não foi possível carregar o histórico.');
    }
  }, []);

  useEffect(() => {
    // Fora do corpo síncrono do efeito, para não encadear renders.
    void (async () => {
      await carregarHistorico();
    })();
  }, [carregarHistorico]);

  // ── foco ───────────────────────────────────────────────────────────────────
  // O requisito central da tela: depois de qualquer operação o campo da etapa
  // atual volta a receber o teclado sem que ninguém precise clicar.
  useEffect(() => {
    if (etapa === 'codigo') {
      codigoRef.current?.focus();
    } else if (etapa === 'quantidade') {
      quantidadeRef.current?.focus();
      quantidadeRef.current?.select();
    }
  }, [etapa, focoSeq]);

  // ── transições ─────────────────────────────────────────────────────────────
  const preSelecionar = useCallback(
    (tipo: TipoMovimento) => {
      setPreSelecionado(tipo);
      setErro(null);
      bipar('selecao');
    },
    [bipar],
  );

  const ativarModo = useCallback(
    (tipo: TipoMovimento) => {
      setModo(tipo);
      setPreSelecionado(tipo);
      setProduto(null);
      setCodigo('');
      setQuantidade('1');
      setErro(null);
      setRecibo(null);
      bipar('confirma');
      devolverFoco();
    },
    [bipar, devolverFoco],
  );

  const reiniciar = useCallback(() => {
    setModo(null);
    setPreSelecionado(null);
    setProduto(null);
    setCodigo('');
    setQuantidade('1');
    setErro(null);
    setRecibo(null);
    bipar('alerta');
  }, [bipar]);

  /** Volta para a etapa de bipar mantendo a operação ativa. */
  const cancelarProduto = useCallback(() => {
    setProduto(null);
    setCodigo('');
    setQuantidade('1');
    setErro(null);
    devolverFoco();
  }, [devolverFoco]);

  // ── busca do código ────────────────────────────────────────────────────────
  const buscarCodigo = useCallback(async () => {
    const alvo = codigo.trim();
    if (!alvo || buscando) return;

    setBuscando(true);
    setErro(null);
    setRecibo(null);

    try {
      const res = await fetch(`/api/products/lookup/${encodeURIComponent(alvo)}`);
      const payload: unknown = await res.json();

      if (!res.ok) {
        const fallback =
          res.status === 404
            ? `Código "${alvo}" não encontrado no cadastro.`
            : 'Falha ao consultar o código.';
        setErro(res.status === 404 ? fallback : apiErrorMessage(payload, fallback));
        setCodigo('');
        bipar('erro');
        devolverFoco();
        return;
      }

      const encontrado = payload as StockLookupDTO;

      // Produto sem controle de estoque seria recusado só no POST, depois de a
      // pessoa já ter digitado a quantidade. Barra aqui.
      if (!encontrado.trackStock) {
        setErro(`"${encontrado.name}" não movimenta estoque.`);
        setCodigo('');
        bipar('erro');
        devolverFoco();
        return;
      }

      setProduto(encontrado);
      setQuantidade('1');
      bipar('ok');
      devolverFoco();
    } catch {
      setErro('Sem conexão com o servidor. Verifique a rede e bipe de novo.');
      bipar('erro');
      devolverFoco();
    } finally {
      setBuscando(false);
    }
  }, [codigo, buscando, bipar, devolverFoco]);

  // ── gravação do movimento ──────────────────────────────────────────────────
  const confirmarMovimento = useCallback(async () => {
    if (!produto || !modo || gravando) return;

    const valor = Number(quantidade.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('Informe uma quantidade maior que zero.');
      bipar('alerta');
      devolverFoco();
      return;
    }

    setGravando(true);
    setErro(null);

    try {
      const res = await fetch('/api/stock/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: produto.id,
          type: modo,
          quantity: valor,
          observation: 'Scanner de produção',
        }),
      });
      const payload: unknown = await res.json();

      if (!res.ok) {
        setErro(apiErrorMessage(payload, 'Não foi possível registrar o movimento.'));
        bipar('erro');
        devolverFoco();
        return;
      }

      setRecibo(payload as MovementResultDTO);
      // Volta para a bipagem com a mesma operação ativa.
      setProduto(null);
      setCodigo('');
      setQuantidade('1');
      bipar('ok');
      devolverFoco();
      await carregarHistorico();
    } catch {
      setErro('Sem conexão com o servidor. O movimento NÃO foi registrado.');
      bipar('erro');
      devolverFoco();
    } finally {
      setGravando(false);
    }
  }, [produto, modo, gravando, quantidade, bipar, devolverFoco, carregarHistorico]);

  // ── teclado ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      // Esc e * (numpad) reiniciam de qualquer etapa.
      if (evento.key === 'Escape' || evento.key === '*') {
        evento.preventDefault();
        reiniciar();
        return;
      }

      if (etapa === 'operacao') {
        const modoTecla = MODOS.find((m) => m.tecla === evento.key);
        if (modoTecla) {
          evento.preventDefault();
          preSelecionar(modoTecla.tipo);
          return;
        }
        if (evento.key === 'Enter' && preSelecionado) {
          evento.preventDefault();
          ativarModo(preSelecionado);
        }
        return;
      }

      // Teclado disparado com o foco fora dos campos (alguém clicou na tela,
      // o leitor bipou cedo demais): devolve o foco sem engolir o caractere.
      const alvo = evento.target;
      const foraDeCampo =
        !(alvo instanceof HTMLElement) ||
        !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(alvo.tagName);
      if (foraDeCampo && evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey) {
        if (etapa === 'codigo') codigoRef.current?.focus();
        else quantidadeRef.current?.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [etapa, preSelecionado, reiniciar, preSelecionar, ativarModo]);

  // ── render ─────────────────────────────────────────────────────────────────
  const IconeModoAtivo = modoAtivo?.Icone ?? ScanLine;
  const reciboModo = modoDe(recibo?.type ?? null);
  const reciboEntrada = reciboModo?.direcao === 'entrada';

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-amber-700" />
            Scanner de Produção
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Movimentação de estoque por código de barras — operação por teclado
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-black text-stone-700 tabular-nums shadow-sm">
            {relogio || '--:--:--'}
          </span>
          <button
            type="button"
            onClick={() => {
              setSom((v) => !v);
              devolverFoco();
            }}
            aria-pressed={som}
            className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              som
                ? 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                : 'border-stone-300 bg-stone-200 text-stone-500 hover:bg-stone-300'
            }`}
          >
            {som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {som ? 'Som ligado' : 'Som mudo'}
          </button>
          <button
            type="button"
            onClick={() => {
              reiniciar();
              devolverFoco();
            }}
            className="rounded-lg border border-stone-200 bg-white hover:bg-stone-50 px-3.5 py-2 text-stone-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <RotateCcw className="h-4 w-4 text-stone-500" />
            Reiniciar (Esc)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Coluna operacional */}
        <div className="space-y-5">
          {/* Seleção de operação */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {MODOS.map((m) => {
              const estaAtivo = modo === m.tipo;
              const estaPre = !estaAtivo && preSelecionado === m.tipo;
              const classes = estaAtivo
                ? m.ativo
                : estaPre
                  ? m.preSelecionado
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50';
              return (
                <button
                  key={m.tipo}
                  type="button"
                  onClick={() => {
                    if (preSelecionado === m.tipo) ativarModo(m.tipo);
                    else preSelecionar(m.tipo);
                  }}
                  className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${classes}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-black leading-none tabular-nums">{m.tecla}</span>
                    <m.Icone
                      className={`h-7 w-7 ${estaAtivo ? 'text-white/90' : m.cor}`}
                    />
                  </div>
                  <div className="mt-3 text-[11px] font-black uppercase tracking-widest leading-tight">
                    {m.linha1}
                    <br />
                    {m.linha2}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Painel de operação */}
          <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6 md:p-8 space-y-6">
            {/* Etapa 1: escolher operação */}
            {etapa === 'operacao' ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-3xl md:text-4xl font-black uppercase tracking-tight text-stone-800">
                  {modoPre ? modoPre.titulo : 'Selecione a operação'}
                </p>
                <p className="text-sm font-bold text-stone-500">
                  {modoPre ? (
                    <>
                      Pressione <span className="text-stone-900">ENTER</span> para ativar esta
                      operação
                    </>
                  ) : (
                    'Pressione 1, 2, 3 ou 4 no teclado'
                  )}
                </p>
              </div>
            ) : (
              <>
                {/* Operação ativa, bem visível de longe */}
                <div className="flex items-center justify-center gap-3">
                  <IconeModoAtivo className={`h-8 w-8 ${modoAtivo?.cor ?? 'text-stone-400'}`} />
                  <span
                    className={`text-3xl md:text-4xl font-black uppercase tracking-tight ${modoAtivo?.cor ?? 'text-stone-800'}`}
                  >
                    {modoAtivo?.titulo}
                  </span>
                </div>

                {/* Etapa 2: código de barras */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void buscarCodigo();
                  }}
                  className="space-y-2"
                >
                  <label
                    htmlFor="scanner-codigo"
                    className="text-[10px] font-black text-stone-500 uppercase tracking-widest block"
                  >
                    Código de barras / SKU — bipe ou digite e pressione Enter
                  </label>
                  <div className="relative">
                    <input
                      id="scanner-codigo"
                      ref={codigoRef}
                      type="text"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      disabled={etapa !== 'codigo'}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="▶  bipe aqui"
                      className="w-full rounded-xl border-2 border-stone-200 bg-stone-50 px-5 py-4 text-center text-3xl font-black text-stone-900 tabular-nums tracking-wider outline-none transition-all focus:border-amber-600 focus:bg-white focus:ring-4 focus:ring-amber-200 disabled:opacity-40 placeholder:font-bold placeholder:text-stone-300"
                    />
                    {buscando ? (
                      <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-6 w-6 animate-spin text-amber-700" />
                    ) : null}
                  </div>
                </form>

                {/* Etapa 3: produto encontrado + quantidade */}
                {produto ? (
                  <div
                    className={`rounded-2xl border-l-8 bg-stone-50 p-5 md:p-6 space-y-5 ${
                      modoAtivo?.direcao === 'entrada'
                        ? 'border-l-emerald-600 border border-stone-200'
                        : 'border-l-rose-600 border border-stone-200'
                    }`}
                  >
                    <div>
                      <p className="text-3xl md:text-4xl font-black text-stone-900 leading-tight">
                        {produto.name}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-stone-500">
                        {produto.type === 'venda' ? 'Produto acabado' : 'Insumo'}
                        {produto.category ? ` · ${produto.category}` : ''} · Unidade:{' '}
                        {produto.unit}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-end gap-6 border-t border-stone-200 pt-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 block">
                          Estoque atual
                        </span>
                        <span className="text-4xl md:text-5xl font-black text-stone-900 tabular-nums">
                          {formatarQtd(produto.stock)}
                        </span>
                        <span className="ml-2 text-lg font-bold text-stone-500">
                          {produto.unit}
                        </span>
                      </div>
                      {produto.minStock > 0 && produto.stock <= produto.minStock ? (
                        <span className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-amber-800">
                          <AlertTriangle className="h-4 w-4" />
                          Abaixo do mínimo ({formatarQtd(produto.minStock)} {produto.unit})
                        </span>
                      ) : null}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void confirmarMovimento();
                      }}
                      className="space-y-3"
                    >
                      <label
                        htmlFor="scanner-quantidade"
                        className="text-[10px] font-black text-stone-500 uppercase tracking-widest block"
                      >
                        Quantidade em {produto.unit} — digite e pressione Enter
                      </label>
                      <input
                        id="scanner-quantidade"
                        ref={quantidadeRef}
                        type="text"
                        inputMode="decimal"
                        value={quantidade}
                        onChange={(e) => setQuantidade(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        autoComplete="off"
                        className="w-full rounded-xl border-2 border-stone-300 bg-white px-5 py-4 text-center text-4xl font-black text-stone-900 tabular-nums outline-none transition-all focus:border-amber-600 focus:ring-4 focus:ring-amber-200"
                      />
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={gravando}
                          className={`flex-1 rounded-xl px-5 py-4 text-lg font-black uppercase tracking-widest text-white transition-all cursor-pointer disabled:opacity-60 ${
                            modoAtivo?.direcao === 'entrada'
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          {gravando ? 'Gravando…' : 'Confirmar [Enter]'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelarProduto}
                          className="rounded-xl border-2 border-stone-200 bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </>
            )}

            {/* Erro — legível de longe */}
            {erro ? (
              <div
                role="alert"
                className="rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-4 flex items-center gap-3"
              >
                <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
                <span className="text-xl md:text-2xl font-black text-red-800 leading-tight">
                  {erro}
                </span>
              </div>
            ) : null}

            {/* Recibo do último movimento: saldo antes → depois */}
            {recibo && !erro ? (
              <div
                role="status"
                className={`rounded-2xl border-2 px-5 py-4 ${
                  reciboEntrada
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-rose-300 bg-rose-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {reciboEntrada ? (
                    <ArrowUpCircle className="h-5 w-5 text-emerald-700" />
                  ) : (
                    <ArrowDownCircle className="h-5 w-5 text-rose-700" />
                  )}
                  <span
                    className={`text-xs font-black uppercase tracking-widest ${
                      reciboEntrada ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {reciboModo?.titulo ?? 'Movimento'} registrada — {formatarQtd(recibo.quantity)}{' '}
                    {recibo.unit}
                  </span>
                </div>
                <p className="mt-1 text-xl font-black text-stone-900 truncate">
                  {recibo.productName}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl md:text-4xl font-black text-stone-400 tabular-nums line-through decoration-2">
                    {formatarQtd(recibo.stockBefore)}
                  </span>
                  <span
                    className={`text-3xl font-black ${reciboEntrada ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    →
                  </span>
                  <span
                    className={`text-5xl md:text-6xl font-black tabular-nums ${
                      reciboEntrada ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatarQtd(recibo.stockAfter)}
                  </span>
                  <span className="text-xl font-bold text-stone-500">{recibo.unit}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Ajuda de teclado */}
          <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-bold text-stone-500">
            <span className="flex items-center gap-1.5 text-stone-700">
              <Keyboard className="h-4 w-4 text-stone-400" />
              Teclado
            </span>
            <span>
              <b className="text-stone-800">1–4</b> escolhe a operação
            </span>
            <span>
              <b className="text-stone-800">Enter</b> ativa a operação, busca o código e confirma a
              quantidade
            </span>
            <span>
              <b className="text-stone-800">Esc</b> ou <b className="text-stone-800">*</b> reinicia
              tudo
            </span>
          </div>
        </div>

        {/* Histórico do dia */}
        <aside className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden xl:sticky xl:top-4">
          <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-600">
              <History className="h-4 w-4 text-amber-700" />
              Movimentações de hoje
            </span>
            <span className="rounded-md bg-stone-200 px-2 py-0.5 text-[10px] font-black text-stone-600 tabular-nums">
              {historico.length}
            </span>
          </div>

          <div className="max-h-[26rem] xl:max-h-[calc(100vh-11rem)] overflow-y-auto divide-y divide-stone-100">
            {erroHistorico ? (
              <p className="px-4 py-6 text-xs font-bold text-red-700">{erroHistorico}</p>
            ) : historico.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs font-bold text-stone-400">
                Nenhuma movimentação hoje.
              </p>
            ) : (
              historico.map((item) => {
                const { etiqueta, badge } = etiquetaDe(item.type);
                return (
                  <div key={item.id} className="px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${badge}`}
                      >
                        {etiqueta}
                      </span>
                      <span className="text-[10px] font-bold text-stone-400 tabular-nums">
                        {formatarHora(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-stone-800">
                      {item.productName}
                    </p>
                    <p className="text-[11px] font-bold text-stone-500 tabular-nums">
                      {formatarQtd(item.quantity)} {item.unit} · saldo{' '}
                      {formatarQtd(item.stockBefore)} → {formatarQtd(item.stockAfter)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

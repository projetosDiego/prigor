import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="container-x flex min-h-[60vh] flex-col items-start justify-center py-14">
      <p className="eyebrow">Página não encontrada</p>
      <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-medium text-cocoa md:text-6xl">Esse brownie saiu do forno antes da hora.</h1>
      <p className="mt-5 max-w-lg text-lg text-muted">O endereço que você procurou não existe ou mudou de lugar.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="btn btn-primary">Ir para o início</Link>
        <Link href="/onde-encontrar" className="btn btn-outline">Onde encontrar</Link>
      </div>
    </section>
  );
}

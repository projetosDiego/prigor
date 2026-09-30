import ConsultarClient from './ConsultarClient';

export const metadata = {
  title: 'Consultar Pedidos | Doces Prigor',
  description: 'Consulte o status do seu pedido e baixe a 2ª via ou espelho em PDF.',
};

export default function ConsultarPage() {
  return <ConsultarClient />;
}

import { redirect } from 'next/navigation';

/** A projeção por vendedor agora fica dentro do Relatório de Vendedores. */
export default function SellerProjectionRedirect() {
  redirect('/admin/reports/sellers');
}

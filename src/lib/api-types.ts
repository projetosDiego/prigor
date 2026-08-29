/**
 * Tipos das respostas da API, para uso nas telas.
 *
 * Existe porque cada tela declarava a própria interface do que a API devolve.
 * Quando o servidor mudava, o TypeScript não tinha como saber — e a
 * divergência só aparecia em runtime, como `Cannot read properties of
 * undefined`. Reexportando os DTOs de verdade, qualquer mudança no servidor
 * quebra a compilação da tela que a consome, que é onde o erro deve aparecer.
 *
 * São reexportações **somente de tipo**: nada de código de servidor vai para o
 * navegador.
 */
export type {
  ProductDTO,
  RecipeLineDTO,
  OrderDTO,
  OrderItemDTO,
  CustomerDTO,
  TransactionDTO,
  Paginated,
} from '@/server/services/serializers';

export type { SellerDTO } from '@/server/services/sellers';
export type { DashboardStats } from '@/server/services/dashboard';
export type { StockLookupDTO, MovementResultDTO, MovementHistoryDTO } from '@/server/services/stock';

/** Envelope de erro devolvido por todas as rotas. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; traceId?: string };
  detail: string;
}

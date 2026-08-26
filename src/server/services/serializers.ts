/**
 * Conversão de linha do banco para DTO da API.
 *
 * Colunas Decimal chegam como objeto Decimal e datas como `Date`. A API expõe
 * `number` para dinheiro/quantidade e `YYYY-MM-DD` para data civil, que é o
 * que o front consome. A conversão fica concentrada aqui, e não espalhada em
 * cada rota.
 */
import { toNumber, type NumericInput } from '../domain/money';

/**
 * Converte para número na fronteira da API.
 * Aceita `unknown` de propósito: o que chega do driver do banco não é tipado
 * quando se usa agregação, e `dec()` já trata nulo e lixo como zero.
 */
export function num(value: unknown): number {
  return toNumber(value as NumericInput);
}

/** Data civil (sem hora) no formato AAAA-MM-DD. */
export function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Instante completo em ISO 8601. */
export function timestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface RecipeLineDTO {
  id: string;
  ingredientId: string;
  ingredientName: string | null;
  ingredientUnit: string | null;
  ingredientCost: number | null;
  quantity: number;
  observation: string | null;
}

export interface ProductDTO {
  id: string;
  sku: string | null;
  barCode: string | null;
  internalCode: string | null;
  name: string;
  storeName: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  type: 'venda' | 'insumo';
  unit: string;
  salePrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  priceFrom: number;
  priceTo: number;
  cost: number;
  stock: number;
  minStock: number;
  trackStock: boolean;
  ncm: string | null;
  cfop: string | null;
  tags: string | null;
  image: string | null;
  commissionPct: number | null;
  active: boolean;
  createdAt: string | null;
  recipe: RecipeLineDTO[];
}

interface RecipeRow {
  id: string;
  ingredientId: string;
  quantity: NumericInput;
  observation: string | null;
  ingredient?: { name: string; unit: string; cost: NumericInput } | null;
}

interface ProductRow {
  id: string;
  sku: string | null;
  barCode: string | null;
  internalCode: string | null;
  name: string;
  storeName: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  type: 'venda' | 'insumo';
  unit: string;
  salePrice: NumericInput;
  wholesalePrice: NumericInput;
  minWholesaleQty: NumericInput;
  priceFrom: NumericInput;
  priceTo: NumericInput;
  cost: NumericInput;
  stock: NumericInput;
  minStock: NumericInput;
  trackStock: boolean;
  ncm: string | null;
  cfop: string | null;
  tags: string | null;
  image: string | null;
  commissionPct: NumericInput;
  active: boolean;
  createdAt: Date | string;
  ingredients?: RecipeRow[];
}

export function toProductDTO(row: ProductRow): ProductDTO {
  return {
    id: row.id,
    sku: row.sku,
    barCode: row.barCode,
    internalCode: row.internalCode,
    name: row.name,
    storeName: row.storeName,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    type: row.type,
    unit: row.unit,
    salePrice: num(row.salePrice),
    wholesalePrice: num(row.wholesalePrice),
    minWholesaleQty: num(row.minWholesaleQty),
    priceFrom: num(row.priceFrom),
    priceTo: num(row.priceTo),
    cost: num(row.cost),
    stock: num(row.stock),
    minStock: num(row.minStock),
    trackStock: row.trackStock,
    ncm: row.ncm,
    cfop: row.cfop,
    tags: row.tags,
    image: row.image,
    commissionPct: row.commissionPct === null || row.commissionPct === undefined ? null : num(row.commissionPct),
    active: row.active,
    createdAt: timestamp(row.createdAt),
    recipe: (row.ingredients ?? []).map((line) => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient?.name ?? null,
      ingredientUnit: line.ingredient?.unit ?? null,
      ingredientCost: line.ingredient ? num(line.ingredient.cost) : null,
      quantity: num(line.quantity),
      observation: line.observation,
    })),
  };
}

export interface OrderItemDTO {
  id: string;
  productId: string;
  productName: string | null;
  quantity: number;
  unitPrice: number;
  discountItem: number;
  subtotal: number;
}

export interface OrderDTO {
  id: string;
  numero: number;
  customerId: string;
  customerName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  status: string;
  paymentMethod: string;
  orderDate: string | null;
  deliveryDate: string | null;
  billingDate: string | null;
  dueDate: string | null;
  discount: number;
  shipping: number;
  otherCosts: number;
  subtotal: number;
  total: number;
  commissionVal: number;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: OrderItemDTO[];
  /** Endereço do cliente, para a tela de logística não precisar de N+1. */
  deliveryAddress?: {
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
  };
}

interface OrderRow {
  id: string;
  numero: number;
  customerId: string;
  sellerId: string | null;
  status: string;
  paymentMethod: string;
  orderDate: Date | string;
  deliveryDate: Date | string | null;
  billingDate: Date | string | null;
  dueDate: Date | string | null;
  discount: NumericInput;
  shipping: NumericInput;
  otherCosts: NumericInput;
  subtotal: NumericInput;
  total: NumericInput;
  commissionVal: NumericInput;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  customer?: {
    tradeName: string;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
    mobile: string | null;
  } | null;
  seller?: { name: string } | null;
  items?: Array<{
    id: string;
    productId: string;
    quantity: NumericInput;
    unitPrice: NumericInput;
    discountItem: NumericInput;
    subtotal: NumericInput;
    product?: { name: string } | null;
  }>;
}

export function toOrderDTO(row: OrderRow, options: { withAddress?: boolean } = {}): OrderDTO {
  const dto: OrderDTO = {
    id: row.id,
    numero: row.numero,
    customerId: row.customerId,
    customerName: row.customer?.tradeName ?? null,
    sellerId: row.sellerId,
    sellerName: row.seller?.name ?? null,
    status: row.status,
    paymentMethod: row.paymentMethod,
    orderDate: dateOnly(row.orderDate),
    deliveryDate: dateOnly(row.deliveryDate),
    billingDate: dateOnly(row.billingDate),
    dueDate: dateOnly(row.dueDate),
    discount: num(row.discount),
    shipping: num(row.shipping),
    otherCosts: num(row.otherCosts),
    subtotal: num(row.subtotal),
    total: num(row.total),
    commissionVal: num(row.commissionVal),
    notes: row.notes,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    items: (row.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name ?? null,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      discountItem: num(item.discountItem),
      subtotal: num(item.subtotal),
    })),
  };

  if (options.withAddress && row.customer) {
    dto.deliveryAddress = {
      address: row.customer.address,
      number: row.customer.number,
      complement: row.customer.complement,
      neighborhood: row.customer.neighborhood,
      city: row.customer.city,
      latitude: row.customer.latitude,
      longitude: row.customer.longitude,
      phone: row.customer.mobile ?? row.customer.phone,
    };
  }

  return dto;
}

export interface CustomerDTO {
  id: string;
  tradeName: string;
  legalName: string | null;
  cnpj: string | null;
  cpf: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  sellerId: string | null;
  sellerName: string | null;
  regionId: string | null;
  neighborhoodId: string | null;
  status: string;
  notes: string | null;
  isReseller: boolean;
  active: boolean;
  createdAt: string | null;
}

interface CustomerRow extends Omit<CustomerDTO, 'sellerName' | 'createdAt'> {
  createdAt: Date | string;
  seller?: { name: string } | null;
}

export function toCustomerDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    tradeName: row.tradeName,
    legalName: row.legalName,
    cnpj: row.cnpj,
    cpf: row.cpf,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    latitude: row.latitude,
    longitude: row.longitude,
    category: row.category,
    sellerId: row.sellerId,
    sellerName: row.seller?.name ?? null,
    regionId: row.regionId,
    neighborhoodId: row.neighborhoodId,
    status: row.status,
    notes: row.notes,
    isReseller: row.isReseller,
    active: row.active,
    createdAt: timestamp(row.createdAt),
  };
}

export interface TransactionDTO {
  id: string;
  type: string;
  description: string;
  category: string | null;
  value: number;
  issueDate: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  orderId: string | null;
  orderNumber: number | null;
  notes: string | null;
  createdAt: string | null;
}

interface TransactionRow {
  id: string;
  type: string;
  description: string;
  category: string | null;
  value: NumericInput;
  issueDate: Date | string;
  dueDate: Date | string | null;
  paymentDate: Date | string | null;
  status: string;
  orderId: string | null;
  notes: string | null;
  createdAt: Date | string;
  order?: { numero: number } | null;
}

export function toTransactionDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    category: row.category,
    value: num(row.value),
    issueDate: dateOnly(row.issueDate),
    dueDate: dateOnly(row.dueDate),
    paymentDate: dateOnly(row.paymentDate),
    status: row.status,
    orderId: row.orderId,
    orderNumber: row.order?.numero ?? null,
    notes: row.notes,
    createdAt: timestamp(row.createdAt),
  };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

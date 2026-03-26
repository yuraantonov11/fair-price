export interface ProductData {
  externalId: string;
  name: string;
  url: string;
  price: number;        // Ціна в копійках
  regularPrice: number | null;
  promoName?: string | null;
  isAvailable: boolean;
  hydrationData?: any;  // Дані з Next.js/React
}

export interface IPriceAdapter {
  getStoreDomain(): string;
  isApplicable(): boolean;

  getProductID(): string | null;
  getCurrentPrice(): number | null;
  getOriginalPrice(): number | null;
  getHydrationData(): any | null;
  getStockStatus(): boolean;

  parseProductPage(): Promise<ProductData | null> | ProductData | null;

  isProductPage(): boolean;
  isCatalogPage(): boolean;
  parseCatalogPage(): Promise<ProductData[]> | ProductData[];

  getUIAnchor(): Element | null;
  getUIInsertMethod(): ContentScriptAppendMode;
}
export interface ProductData {
  externalId: string;
  name: string;
  url: string;
  price: number;
  regularPrice: number | null;
  promoName: string | null;
  isAvailable: boolean;
  hydrationData: any | null;
  category?: string;
  /** V2: how reliably this data was extracted */
  sourceConfidence?: 'dom' | 'hydration';
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
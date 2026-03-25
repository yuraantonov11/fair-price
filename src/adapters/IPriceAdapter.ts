export interface ProductData {
  externalId: string;
  name: string;
  url: string;
  price: number;
  regularPrice: number | null;
  promoName?: string | null;
  isAvailable: boolean;
}

export interface IPriceAdapter {
  isApplicable(): boolean;
  injectProvider?(): Promise<void>;

  injectProvider?(): Promise<void> | void;

  getStoreDomain(): string;
  isProductPage(): boolean;
  parseProductPage(): Promise<ProductData | null> | ProductData | null;
  isCatalogPage(): boolean;
  parseCatalogPage(): Promise<ProductData[]> | ProductData[];
  getUIAnchor(): Element | null;

  getUIInsertMethod(): ContentScriptAppendMode;
}
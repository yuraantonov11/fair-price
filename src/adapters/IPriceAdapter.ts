export interface ProductData {
  externalId: string;
  name: string;
  url: string;
  price: number;        // Ціна в копійках
  regularPrice: number | null; // Стара ціна в копійках
  promoName?: string | null;   // НОВЕ ПОЛЕ
  isAvailable: boolean;
}

export interface IPriceAdapter {
  getStoreDomain(): string;
  isApplicable(): boolean;
  injectProvider?(): Promise<void> | void;

  isProductPage(): boolean;
  parseProductPage(): Promise<ProductData | null> | ProductData | null;
  isCatalogPage(): boolean;
  parseCatalogPage(): Promise<ProductData[]> | ProductData[];
  getUIAnchor(): Element | null;
  getUIInsertMethod(): ContentScriptAppendMode;
}
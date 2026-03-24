export interface IPriceAdapter {
  isApplicable(): boolean;
  getProductID(): string | null;
  getTitle(): string | null;
  getCurrentPrice(): number | null;
  getOriginalPrice(): number | null;
  getStockStatus(): boolean;
}
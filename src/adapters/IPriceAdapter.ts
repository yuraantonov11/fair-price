export interface IPriceAdapter {
  getProductID(): string | null;
  getCurrentPrice(): number | null;
  getOriginalPrice(): number | null;
  getHydrationData(): any;
  getStockStatus(): boolean;
}
export interface IPriceAdapter {
    /**
     * Перевіряє, чи підходить цей адаптер для поточного відкритого сайту.
     */
    isApplicable(): boolean;

    /**
     * Повертає унікальний ідентифікатор товару (SKU або ID).
     */
    getProductID(): string | null;

    /**
     * Повертає назву товару.
     */
    getTitle(): string | null;

    /**
     * Повертає поточну актуальну ціну товару.
     */
    getCurrentPrice(): number | null;

    /**
     * Повертає стару (закреслену) ціну товару, якщо є знижка.
     */
    getOriginalPrice(): number | null;

    /**
     * Перевіряє, чи є товар в наявності.
     */
    getStockStatus(): boolean;
}
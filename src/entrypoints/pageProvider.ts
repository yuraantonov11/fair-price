export default defineUnlistedScript(() => {
    console.log("[FairPrice] PageProvider: Script initialized in Main World");

    document.addEventListener('GET_PAGE_DATA', (event: any) => {
        const varName = event.detail.varName;
        const data = (window as any)[varName];

        console.log(`[FairPrice] PageProvider: Requested ${varName}, found:`, data);

        document.dispatchEvent(new CustomEvent('RECEIVE_PAGE_DATA', {
            detail: {
                varName,
                // Якщо дані undefined, повертаємо null явно для стабільності
                value: JSON.parse(JSON.stringify(data))
            }
        }));
    });
});
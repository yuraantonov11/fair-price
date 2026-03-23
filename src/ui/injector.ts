/**
 * Injects the Fair Price UI into the current page using Shadow DOM.
 */
export function injectUI(score: { score: number, message: string }, history: any[]) {
  console.log('FairPrice: Injecting UI...', score);

  const existingRoot = document.getElementById('fair-price-root');
  if (existingRoot) return;

  const container = document.createElement('div');
  container.id = 'fair-price-root';
  // Вставляємо в body
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: 'open' });

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      font-size: 14px;
      z-index: 2147483647; /* Max z-index */
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e7eb;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-sizing: border-box;
      color: #1f2937;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .title {
      font-weight: 700;
      color: #111827;
      font-size: 16px;
    }
    .score-badge {
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 600;
      color: #fff;
      font-size: 12px;
    }
    .score-good { background-color: #10b981; }
    .score-bad { background-color: #ef4444; }
    .score-neutral { background-color: #f59e0b; }
    
    .chart-container {
      height: 100px;
      background: #f3f4f6;
      border-radius: 8px;
      display: flex;
      align-items: flex-end;
      padding: 8px 4px 0 4px;
      gap: 2px;
      margin-top: 8px;
    }
    .chart-bar {
      flex: 1;
      background-color: #d1d5db;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s ease, background-color 0.2s;
      min-height: 2px;
    }
    .chart-bar:hover {
      background-color: #6b7280;
    }
    .message {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.5;
    }
    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      cursor: pointer;
      font-size: 18px;
      color: #9ca3af;
      border: none;
      background: none;
      padding: 0;
    }
    .close-btn:hover {
      color: #4b5563;
    }
  `;
  shadow.appendChild(style);

  // Content
  const content = document.createElement('div');
  
  // Determine score class
  let scoreClass = 'score-neutral';
  if (score.score > 80) scoreClass = 'score-good';
  if (score.score < 50) scoreClass = 'score-bad';

  content.innerHTML = `
    <button class="close-btn" id="close-widget">×</button>
    <div class="header">
      <span class="title">Fair Price 🇺🇦</span>
      <span class="score-badge ${scoreClass}">${score.score}% Чесності</span>
    </div>
    <div class="message">${score.message}</div>
    <div class="chart-container" id="chart-area" title="Історія цін за останні 60 днів">
      <!-- Bars will be injected here via JS -->
    </div>
  `;
  
  shadow.appendChild(content);

  // Close Button Logic
  shadow.getElementById('close-widget')?.addEventListener('click', () => {
    container.remove();
  });

  // Simple Chart Logic
  const chartArea = shadow.getElementById('chart-area');
  if (chartArea && history.length > 0) {
      const prices = history.map((h: any) => h.price);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const range = maxPrice - minPrice || 1; // avoid divide by zero

      history.forEach((point: any) => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        
        // Normalize height between 10% and 100%
        const heightPercent = 10 + ((point.price - minPrice) / range) * 90;
        bar.style.height = `${heightPercent}%`;
        
        const dateStr = new Date(point.date).toLocaleDateString();
        bar.title = `${dateStr}: ${point.price} ₴`;
        
        chartArea.appendChild(bar);
      });
  } else if (chartArea) {
      chartArea.textContent = "Немає історії цін";
      chartArea.style.alignItems = "center";
      chartArea.style.justifyContent = "center";
      chartArea.style.color = "#9ca3af";
      chartArea.style.fontSize = "12px";
  }
}
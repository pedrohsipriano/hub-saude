// Configuração do Google Maps Platform (chave e ID de mapa), lida do .env.local (fora do git).
// Sem chave, o app usa o OpenStreetMap e não oferece o ajuste às ruas.

// Chave da Maps JavaScript API (a mesma chave serve para a Roads API, se ela estiver liberada na chave).
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

// ID de mapa (Google Cloud → Gerenciamento de mapas), exigido pelos marcadores avançados.
// Sem ele, usa o DEMO_MAP_ID do Google, que serve só para testes.
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

// Ponto de entrada: estilos globais, persistência do hub e renderização do React.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App.jsx'
import { startPersistence } from './hub/hub.js'
import { applyStoredTheme } from './theme/theme.js'

// Tema salvo (claro/escuro) aplicado antes de desenhar, para não piscar no tema errado.
applyStoredTheme()

// Liga a gravação automática das medições no banco local (uma vez por carregamento).
startPersistence()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

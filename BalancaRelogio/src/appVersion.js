// Versão do app e hora do build (vite.config.js), para conferir qual versão está instalada no celular.
const build = import.meta.env.VITE_APP_BUILD ? new Date(import.meta.env.VITE_APP_BUILD) : null

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

/** "versão 1.1.0 · gerada em 17/10/2026 00:45". */
export const APP_VERSION_LABEL = `versão ${APP_VERSION}${
  build ? ` · gerada em ${build.toLocaleDateString('pt-BR')} ${build.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''
}`

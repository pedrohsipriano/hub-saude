// Estrutura comum a todas as telas: cabeçalho (nome do app + usuário atual),
// barra de abas (embaixo no celular, no topo no PC), conteúdo e rodapé.
import Icon from '../Icon/Icon.jsx'
import styles from './Layout.module.css'

/**
 * @param {object} props
 * @param {Array<{ id: string, label: string, icon: string }>} props.tabs - abas principais
 * @param {string} props.current - aba ativa
 * @param {(id: string) => void} props.onNavigate - troca de aba
 * @param {string | null} props.userName - usuário atual (mostrado no cabeçalho)
 * @param {() => void} props.onOpenUser - abre o perfil/troca de usuário
 * @param {'light' | 'dark'} props.theme - tema efetivo
 * @param {() => void} props.onToggleTheme - alterna entre claro e escuro
 * @param {import('react').ReactNode} props.children - conteúdo da tela
 */
export default function Layout({ tabs, current, onNavigate, userName, onOpenUser, theme, onToggleTheme, children }) {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <h1 className={styles.brand}>Hub de Saúde</h1>

          {/* Abas: no PC ficam aqui; no celular o CSS fixa embaixo da tela. */}
          <nav className={styles.tabbar} aria-label="Navegação principal">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tab} ${tab.id === current ? styles.active : ''}`}
                aria-current={tab.id === current ? 'page' : undefined}
                onClick={() => onNavigate(tab.id)}
              >
                <Icon name={tab.icon} />
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Alterna claro/escuro (o automático fica em Mais → Aparência). */}
          <button
            type="button"
            className={styles.themeButton}
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>

          <button type="button" className={styles.userChip} onClick={onOpenUser}>
            <Icon name="user" />
            <span className={styles.userName}>{userName ?? 'Criar perfil'}</span>
          </button>
        </div>
      </header>

      <main className={`${styles.container} ${styles.main}`}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.container}>Hub de Saúde · balança + relógio · os dados ficam neste aparelho</div>
      </footer>
    </div>
  )
}

// Controle segmentado (sub-abas dentro de uma aba), rolável no celular.
import styles from './SubNav.module.css'

/**
 * @param {object} props
 * @param {Array<{ id: string, label: string }>} props.items
 * @param {string} props.current
 * @param {(id: string) => void} props.onChange
 * @param {string} props.label - nome do grupo (acessibilidade)
 */
export default function SubNav({ items, current, onChange, label }) {
  return (
    <div className={styles.subnav} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === current}
          className={`${styles.item} ${item.id === current ? styles.active : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

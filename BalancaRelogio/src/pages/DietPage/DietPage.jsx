// Aba Dieta: refeições de hoje (feita / não fiz corretamente), histórico da adesão (gráfico),
// plano (importar/editar), lista de compras e orientações da nutricionista.
import { useState } from 'react'
import SubNav from '../../components/SubNav/SubNav.jsx'
import { mealsOfDay, nextMeal } from '../../diet/dietPlan.js'
import { useDiet } from '../../hooks/useDiet.js'
import { useNow } from '../../hooks/useNow.js'
import { usePersistentState } from '../../hooks/usePersistentState.js'
import ui from '../../styles/controls.module.css'
import { formatTime } from '../../utils/format.js'
import DietHistory from './DietHistory.jsx'
import DietPlans from './DietPlans.jsx'
import WaterView from './WaterView.jsx'
import styles from './DietPage.module.css'

const SECTIONS = [
  { id: 'today', label: 'Hoje' },
  { id: 'water', label: 'Água' },
  { id: 'history', label: 'Histórico' },
  { id: 'plan', label: 'Plano' },
  { id: 'shopping', label: 'Compras' },
  { id: 'guidelines', label: 'Orientações' },
]

/** Refeições do dia, com os itens, as substituições e a marcação (feita / não fiz corretamente). */
function DietToday({ plan, doneIds, statuses, onStatus }) {
  const now = useNow()
  const entries = mealsOfDay(plan, now, doneIds, statuses)
  const upcoming = nextMeal(plan, now, doneIds)

  return (
    <ol className={styles.timeline}>
      {entries.map((entry) => {
        const isNext = upcoming && upcoming.meal.id === entry.meal.id && upcoming.at === entry.at
        return (
          <li
            key={entry.meal.id}
            className={`${ui.card} ${styles.meal} ${isNext ? styles.next : ''} ${entry.status === 'done' ? styles.done : ''} ${entry.status === 'off' ? styles.off : ''}`}
          >
            <div className={styles.mealHeader}>
              <span className={styles.time}>{formatTime(entry.at)}</span>
              <h3 className={styles.mealName}>{entry.meal.name}</h3>
              {entry.status && (
                <span className={`${styles.statusChip} ${entry.status === 'off' ? styles.chipOff : styles.chipDone}`}>
                  {entry.status === 'off' ? 'Fora do plano' : 'Feita ✓'}
                </span>
              )}
            </div>

            {/* Marcação: seguiu o plano ou não fez a refeição corretamente (vai para o Histórico e o relatório). */}
            <div className={styles.mealActions}>
              {entry.status ? (
                <button type="button" className={styles.undo} onClick={() => onStatus(entry, null)}>
                  Desfazer
                </button>
              ) : (
                <>
                  <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => onStatus(entry, 'done')}>
                    Fiz ✓
                  </button>
                  <button type="button" className={`${ui.button} ${styles.offButton}`} onClick={() => onStatus(entry, 'off')}>
                    Não fiz corretamente
                  </button>
                </>
              )}
            </div>
            {entry.meal.reminderText && <p className={ui.hint}>{entry.meal.reminderText}</p>}

            {/* Cada opção (ex.: Jantar opção 1 / opção 2) com os itens e as substituições. */}
            {entry.meal.options.map((option) => (
              <details key={option.label} className={styles.option} open={isNext && entry.meal.options.length === 1}>
                <summary className={styles.optionTitle}>
                  {entry.meal.options.length > 1 ? option.label : 'O que comer'} ({option.items.length} itens)
                </summary>
                <ul className={styles.items}>
                  {option.items.map((item) => (
                    <li key={item.main}>
                      <span className={styles.itemMain}>{item.main}</span>
                      {item.substitutes.length > 0 && (
                        <span className={styles.substitutes}>ou: {item.substitutes.join(' · ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {option.notes && <p className={ui.hint}>{option.notes}</p>}
              </details>
            ))}
          </li>
        )
      })}
    </ol>
  )
}

/** Lista de compras com marcação (guardada neste aparelho). */
function ShoppingList({ items, userId }) {
  const [checked, setChecked] = usePersistentState(`hubSaude.shopping.${userId}`, [])
  const toggle = (item) =>
    setChecked((previous) => (previous.includes(item) ? previous.filter((other) => other !== item) : [...previous, item]))

  return (
    <div className={ui.card}>
      <div className={styles.listHeader}>
        <h3 className={ui.cardTitle}>Lista de compras</h3>
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setChecked([])} disabled={!checked.length}>
          Desmarcar tudo
        </button>
      </div>
      <ul className={styles.shopping}>
        {items.map((item) => (
          <li key={item}>
            <label className={`${styles.check} ${checked.includes(item) ? styles.checked : ''}`}>
              <input type="checkbox" checked={checked.includes(item)} onChange={() => toggle(item)} />
              {item}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.user - usuário atual
 */
export default function DietPage({ user }) {
  const [section, setSection] = useState('today')
  const diet = useDiet(user.userId)
  const plan = diet.plan

  return (
    <section>
      <h2 className={ui.pageTitle}>Dieta</h2>
      <SubNav items={SECTIONS} current={section} onChange={setSection} label="Seções da dieta" />

      {!diet.loaded && <p>Carregando…</p>}

      {/* Água não depende do plano alimentar. */}
      {section === 'water' && <WaterView user={user} />}

      {diet.loaded && !plan && section !== 'plan' && section !== 'water' && (
        <div className={ui.card}>
          <p>Nenhum plano alimentar cadastrado ainda.</p>
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => setSection('plan')}>
            Adicionar o PDF da nutricionista
          </button>
        </div>
      )}

      {plan && section === 'today' && (
        <DietToday plan={plan} doneIds={diet.doneIds} statuses={diet.statuses} onStatus={diet.setMealStatus} />
      )}

      {plan && section === 'history' && <DietHistory plan={plan} userId={user.userId} />}

      {diet.loaded && section === 'plan' && <DietPlans diet={diet} />}

      {plan && section === 'shopping' &&
        (plan.shoppingList.length ? (
          <ShoppingList items={plan.shoppingList} userId={user.userId} />
        ) : (
          <p className={ui.card}>O plano não tem lista de compras.</p>
        ))}

      {plan && section === 'guidelines' && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Orientações</h3>
          {plan.guidelines.length ? (
            <ul className={styles.guidelines}>
              {plan.guidelines.map((guideline) => (
                <li key={guideline}>{guideline}</li>
              ))}
            </ul>
          ) : (
            <p className={ui.hint}>O plano não tem orientações.</p>
          )}
          {(plan.prescribedBy || plan.prescribedAt) && (
            <p className={ui.hint}>
              Prescrito{plan.prescribedBy && ` por ${plan.prescribedBy}`}
              {plan.prescribedAt && ` em ${plan.prescribedAt}`}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

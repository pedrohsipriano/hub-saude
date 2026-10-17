// Dieta → Água: registro dos copos, quantidade livre, copos de hoje, gráfico de 7 dias
// e como a meta foi calculada (altura, peso e treino do dia).
import { useState } from 'react'
import WaterChart from '../../components/WaterChart/WaterChart.jsx'
import WaterQuickAdd from '../../components/WaterQuickAdd/WaterQuickAdd.jsx'
import { useWater } from '../../hooks/useWater.js'
import ui from '../../styles/controls.module.css'
import { formatNumber, formatTime } from '../../utils/format.js'
import { formatWater } from '../../water/water.js'
import styles from './DietPage.module.css'

/**
 * @param {object} props
 * @param {object} props.user - usuário atual (altura do perfil)
 */
export default function WaterView({ user }) {
  const water = useWater(user)
  const [custom, setCustom] = useState('')
  const { goal } = water

  /** Registra a quantidade digitada. */
  const addCustom = (event) => {
    event.preventDefault()
    const ml = Number(custom)
    if (ml > 0 && ml <= 3000) {
      water.add(ml)
      setCustom('')
    }
  }

  return (
    <div>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Água hoje</h3>
        <WaterQuickAdd water={water} />
        <form className={styles.customWater} onSubmit={addCustom}>
          <label className={ui.label} htmlFor="water-ml">
            Outra quantidade (ml)
          </label>
          <div className={styles.customRow}>
            <input
              id="water-ml"
              className={ui.input}
              type="number"
              inputMode="numeric"
              min="1"
              max="3000"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
            <button type="submit" className={`${ui.button} ${ui.buttonSecondary}`}>
              Adicionar
            </button>
          </div>
        </form>
        {water.drinks.length > 0 && (
          <ul className={styles.offList}>
            {[...water.drinks].reverse().map((drink) => (
              <li key={drink.id}>
                {formatTime(drink.at)} · {formatWater(drink.ml)}{' '}
                <button type="button" className={styles.undo} onClick={() => water.remove(drink)}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Últimos 7 dias</h3>
        <WaterChart days={water.days} goalMl={goal.goalMl} />
      </div>

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Como a meta é calculada</h3>
        {goal.estimated ? (
          <p>Pese-se na balança para calcular a sua meta. Até lá, a meta é de 2 L por dia.</p>
        ) : (
          <ul className={styles.offList}>
            <li>Pelo peso: 35 ml por kg = {formatWater(goal.byWeightMl)}</li>
            {goal.byBodySurfaceMl ? (
              <li>
                Pela altura e pelo peso: 1,5 L por m² de superfície corporal ({formatNumber(goal.bodySurfaceM2, 2)} m²) ={' '}
                {formatWater(goal.byBodySurfaceMl)}
              </li>
            ) : (
              <li>Preencha a altura no perfil para usar também a superfície corporal.</li>
            )}
            {goal.trainingMl > 0 && <li>Treino de hoje: + {formatWater(goal.trainingMl)}</li>}
            <li>
              <strong>Meta: {formatWater(goal.goalMl)}</strong> (média das duas contas + treino)
            </li>
          </ul>
        )}
        <p className={ui.hint}>
          Orientação geral para adultos saudáveis. Quem tem doença renal ou cardíaca deve seguir a quantidade indicada
          pelo médico.
        </p>
      </div>
    </div>
  )
}

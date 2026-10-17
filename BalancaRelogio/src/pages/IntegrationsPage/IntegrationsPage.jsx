// Página de integrações: Health Connect (que leva os dados ao Samsung Health e ao Google).
import ui from '../../styles/controls.module.css'
import styles from './IntegrationsPage.module.css'
import ConnectionStatus from './ConnectionStatus.jsx'
import SyncStatus from './SyncStatus.jsx'

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useHealthConnect.js').useHealthConnect>} props.healthConnect
 */
export default function IntegrationsPage({ healthConnect, users, owner, onOwnerChange }) {
  const { native, availability, permissions, settings, message } = healthConnect
  const authorized = (permissions?.writeAuthorized?.length ?? 0) > 0 || (permissions?.readAuthorized?.length ?? 0) > 0

  return (
    <section>
      {/* Status bem visível: conectado, em parte ou não conectado, com o botão de conectar. */}
      <ConnectionStatus healthConnect={healthConnect} />

      {/* O Health Connect pertence a quem é dono do celular: só os dados dessa pessoa vão para lá. */}
      {users.length > 1 && (
        <label className={ui.field}>
          <span className={ui.label}>Dono deste celular (Health Connect e lembretes)</span>
          <select className={ui.input} value={owner?.userId ?? ''} onChange={(event) => onOwnerChange(event.target.value)}>
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.name || 'Sem nome'}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Health Connect · Samsung Health · Google</h3>

        {!native && (
          <p>
            O Health Connect fica no celular: esta integração funciona só no <strong>app Android</strong> do Hub de
            Saúde. No PC, os dados continuam no banco local.
          </p>
        )}

        {native && availability.checking && <p>Verificando o Health Connect…</p>}

        {native && availability.available === false && !availability.checking && (
          <p className={ui.error}>
            Health Connect indisponível: {availability.reason ?? 'instale o "Health Connect" pela Play Store.'}
          </p>
        )}

        {native && availability.available && (
          <>
            <div className={ui.actions}>
              <button
                type="button"
                className={`${ui.button} ${ui.buttonSecondary}`}
                onClick={healthConnect.importNow}
                disabled={!authorized}
              >
                Importar agora
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={healthConnect.openSettings}>
                Abrir o Health Connect
              </button>
            </div>

            <fieldset className={styles.options}>
              <legend className={ui.label}>O que sincronizar</legend>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.exportScale}
                  onChange={(event) => healthConnect.setSettings({ exportScale: event.target.checked })}
                />
                Enviar as pesagens: peso, % de gordura e TMB (estimativas)
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.exportWatch}
                  onChange={(event) => healthConnect.setSettings({ exportWatch: event.target.checked })}
                />
                Enviar os dados do relógio: passos por hora, FC, SpO2, pressão e sono
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.exportWorkout}
                  onChange={(event) => healthConnect.setSettings({ exportWorkout: event.target.checked })}
                />
                Enviar os treinos: distância e calorias (peça a autorização de novo para liberar esses tipos)
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.exportWater}
                  onChange={(event) => healthConnect.setSettings({ exportWater: event.target.checked })}
                />
                Enviar a água bebida (hidratação)
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={settings.importEnabled}
                  onChange={(event) => healthConnect.setSettings({ importEnabled: event.target.checked })}
                />
                Importar passos, FC e sono de outros apps ao abrir (para os cruzamentos)
              </label>
            </fieldset>
          </>
        )}

        {message && <p className={ui.hint}>{message}</p>}
      </div>

      {/* Confirmação: o que chegou ao Health Connect e quem mais grava lá (Samsung Health, Google Fit). */}
      {native && availability.available && authorized && <SyncStatus healthConnect={healthConnect} />}

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Como os dados chegam aos outros apps</h3>
        <ol className={styles.steps}>
          <li>
            <strong>Samsung Health:</strong> no app Samsung Health, abra Configurações → <em>Health Connect</em> (o
            nome do menu pode variar com a versão) e ative a sincronização. A partir daí ele lê o que este app grava.
          </li>
          <li>
            <strong>Google:</strong> os apps do Google que usam o Health Connect leem os mesmos dados. A API antiga do
            Google Fit não aceita apps novos.
          </li>
          <li>
            <strong>Evite duplicar:</strong> se o MActivePro já envia passos, FC ou sono ao Health Connect, desligue
            &quot;Enviar os dados do relógio&quot; aqui.
          </li>
        </ol>
      </div>
    </section>
  )
}

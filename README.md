# Hub de Saúde BLE (Balança + Smartwatch)

App único (hub) de saúde que recebe dados via BLE de dois dispositivos OEM chineses e os guarda num banco local comum para cruzar métricas (peso × passos × sono).
- **Módulo 1, balança Original Line** (app oficial OKOK): peso + composição corporal.
- **Módulo 2, smartwatch Microwear** (app oficial MActivePro): FC, passos, sono, SpO2 e bateria.

Ordem de implementação: balança primeiro (mais simples), depois o relógio.

**Estado atual:** o protótipo está em `BalancaRelogio/`, com os dois módulos:
- **Balança:** leitura (Web Bluetooth ou simulador), composição corporal, perfil, histórico e Relatório de Progresso em PDF.
- **Relógio:** conexão GATT (Web Bluetooth ou simulador), hora, bateria, FC/SpO2/pressão do dia, passos e sono.
- **Integração:** cada pesagem envia o peso ao relógio, e o relatório cruza o peso com passos, sono e FC de repouso.
- **App Android** (Capacitor, pasta `BalancaRelogio/android/`): o mesmo código, com Bluetooth nativo e **Health Connect**. Grava pesagens e dados do relógio e importa passos, FC e sono de outros apps. É por ele que os dados chegam ao Samsung Health e ao Google.
- **Ainda não confirmados contra o relógio real:** passos por hora (`4A`) e sono (`4F`), que seguem o formato do SDK.
- **Uso diário (ver "Uso diário"):**
  - tela inicial com o resumo do dia;
  - tendência de peso (média de 7 dias e ritmo semanal) e metas com projeção;
  - plano alimentar com lembretes, lista de compras e orientações;
  - vários usuários na mesma balança;
  - medidas com fita métrica (relação cintura-quadril);
  - relatório por período, resumo semanal e avisos;
  - **treinos no estilo Strava**: vários exercícios, cronômetro, GPS com mapa e trajeto, parciais por km;
  - visual pensado para celular.
- **Ainda não testados num aparelho:** o app Android, o Health Connect, as notificações e o GPS dos treinos. Os testes cobrem só a lógica, e o visual não foi conferido no navegador.

**No GitHub:** o código, o projeto Android, as ferramentas e esta documentação. Ficam **fora** do repositório (ver `.gitignore`): os APKs oficiais, os logs HCI e bugreports (têm o texto das notificações), os prints das pesagens, o plano alimentar e os relatórios em PDF, e o `.env.local` com a chave do Google Maps. Nos quadros de teste, os **endereços MAC** e a **data de nascimento** gravada no relógio foram trocados por valores fictícios.

## Como fazer o mesmo com a sua balança ou relógio

Este é o caminho usado aqui para descobrir os dois protocolos sem documentação do fabricante. Ele serve para outras balanças e relógios OEM parecidos.

**Do que você precisa:**
- celular Android com as opções do desenvolvedor ligadas;
- o app **nRF Connect** (para a balança);
- o **adb** (Android platform-tools) no PC e o **Node 20+** (para `tools/btsnoop.mjs`);
- opcionais: o **jadx** (para abrir o APK do app oficial) e o **Wireshark**.

### Balança (dados no anúncio Bluetooth)
1. **Descubra se ela só anuncia.** No nRF Connect, aba SCANNER e sem filtros, suba na balança: ela só anuncia acordada. Um aparelho sem nome ("N/A"), com sinal forte e **sem botão CONNECT**, é broadcast-only: os dados vêm no anúncio e não há conexão.
2. **Ache os bytes.** Toque no aparelho e abra o **RAW**. A estrutura do tipo `0xFF` é o *manufacturer data*, e os 2 primeiros bytes são o *company ID* em little-endian.
3. **Pese coisas de peso conhecido e anote o display.** Compare o hex de cada pacote com a tabela das variantes OKOK do openScale (seção "Módulo 1"). Aqui, o byte baixo do company ID é sempre `0xC0`, o que indica a variante C0; o byte alto é um contador que muda a cada pacote.
4. **Mapeie os campos:**
   - peso = `u16 big-endian ÷ 100`, conferido com o display;
   - atributo `bit0` = pesagem final;
   - o **MAC da balança** nos bytes 7–12 serve para reconhecer a sua (no navegador, o Web Bluetooth não mostra o MAC).
5. **Teste a impedância.** Pese de meia e com os pés molhados. Se o valor não muda, ele é fixo. Aqui ele foi sempre `0x1770`, ou seja, 600,0 Ω.
6. **Ache as fórmulas de composição.**
   - Baixe o APK do app oficial (pelo nome do pacote no APKPure) e abra no jadx.
   - Procure a classe do algoritmo; no OKOK é `com.chipsea.code.algorithm.CsAlgoBuilder`.
   - Confira com a tela do app oficial usando o mesmo peso e o mesmo perfil.
7. **Prove com testes.** Transforme os pacotes em *fixtures* (`src/devices/scale/fixtures.js`) e escreva testes que reproduzam os números do app oficial (`bodyComposition.test.js`, `standards.test.js`).

### Relógio (conexão GATT)
1. **Liste os serviços e características** (nRF Connect → CONNECT, ou o Bluetooth LE Explorer no Windows). Não pareie o relógio com o PC: isso pode desfazer o pareamento com o celular.
2. **Grave o tráfego do app oficial:**
   - em Opções do desenvolvedor, ligue o "Log de rastreamento HCI Bluetooth" (em **Ativado**, não "Filtrado") e desligue e religue o Bluetooth;
   - use o app oficial **uma ação por vez**, anotando a hora de cada uma: sincronizar, medir FC, mudar altura ou peso, meta de passos, receber uma notificação…
3. **Extraia o log** com `adb bugreport bugreport.zip`. O `btsnoop_hci.log` fica dentro do zip; na Samsung, em `FS/data/log/bt/`.
4. **Liste as operações:** `node tools/btsnoop.mjs <log> <MAC do relógio> --out att.txt` mostra cada escrita e notificação ATT com o horário. Cruze com as suas anotações.
5. **Descubra o formato do quadro.** Aqui é `BC <cmd> <controle> <tamanho> <dados> <soma dos dados>`. Procure também um SDK público do fabricante: o [NJJBle](https://github.com/SoarY/NJJBle) deu o nome de vários comandos.
6. **Valide:** os seus geradores de quadro devem sair **byte a byte iguais** aos do app oficial (`src/devices/watch/njjProtocol.test.js`).

**Dicas que custaram caro:**
- **Um app por vez:** o relógio aceita um app conectado de cada vez. Feche o app oficial e tire dele a permissão "Dispositivos próximos".
- **Pareamento:** pareie o relógio no Bluetooth do celular. Assim o Android mantém a ligação sozinho, e o relógio para de anunciar quando já está ligado.
- **Batimento:** o app oficial manda `AA 21 00 00 F0 F0 F0 F0` a cada ~1 min. Sem ele, a conexão pode cair.
- **Hora do log:** o log HCI do Android grava a hora local; formate com `getUTC*`.
- **APK protegido:** o MActivePro é protegido pelo 360 Jiagu e não abre no jadx. O protocolo saiu só do log.
- **Ícones de notificação:** os números de ícone do firmware podem não bater com o SDK. O app tem um "Testar ícones" para descobrir.

### Privacidade ao publicar
- Logs HCI e bugreports contêm o **texto das suas notificações e mensagens**: nunca publique.
- Quadros reais podem trazer o seu perfil: o `0x41`/`0x4E` deste relógio tem sexo, altura, peso, idade e **data de nascimento**. Anonimize antes, recalculando a soma do quadro.
- Prints com peso e composição corporal ficaram fora daqui; os números que importam estão nas tabelas abaixo.

## Stack

- React 19 + Vite 8 + **CSS Modules**, escolhidos para facilitar o port futuro para celular. Testes com Vitest e lint com ESLint 10 (inclui as regras do React Compiler em `eslint-plugin-react-hooks` 7).
- Estilos: cores, fontes e espaçamentos ficam como variáveis CSS em `src/styles/tokens.css`. Botões, cartões e campos compartilhados ficam em `src/styles/controls.module.css`, e os demais `*.module.css` só usam essas variáveis.
- Alvos:
  - **PC:** página Web Bluetooth no Chrome/Edge. O shell desktop (Electron, Tauri etc.) **ainda não foi escolhido**.
  - **Android:** **Capacitor 8** (`capacitor.config.json`, appId `com.hubsaude.app`, minSdk 26), com os plugins `@capacitor-community/bluetooth-le` (Bluetooth nativo), `@capgo/capacitor-health` (Health Connect) e `@capacitor/local-notifications` (lembretes diários; o manifesto do plugin já declara as permissões `POST_NOTIFICATIONS` e `SCHEDULE_EXACT_ALARM`) e `@capacitor-community/background-geolocation` (GPS dos treinos como serviço em primeiro plano, que continua com a tela apagada; o manifesto do plugin declara `FOREGROUND_SERVICE_LOCATION`), além de `@capacitor/share` + `@capacitor/filesystem` (compartilhar o vídeo ou a imagem do treino pelo menu do Android).
  - **Tela de ponta a ponta (Galaxy S24 Ultra, 384 × 832 pontos CSS):** em `capacitor.config.json`, `plugins.SystemBars` usa `insetsHandling: native` e `initialViewportFitValueHint: cover`, com o `viewport-fit=cover` do `index.html`. As áreas da câmera e da barra de gestos vêm em `env(safe-area-inset-*)`.
  - **Barras do sistema** (`theme/systemBars.js`): ícones claros na barra de status (cabeçalho azul) e, na barra de gestos, cor conforme o tema.
  - **Telas de até 420 px:** cartões com menos margem interna; não há rolagem lateral nem o "puxar e voltar".
  - **Para ver no PC como no celular:** no Chrome DevTools (F12) → modo dispositivo → "Editar…" → adicione "Galaxy S24 Ultra" com 384 × 832 e proporção de pixels 3,75.
- **Mapa dos treinos:** **Google Maps** (Maps JavaScript API) quando existe a chave `VITE_GOOGLE_MAPS_API_KEY` no `.env.local`. Sem chave, ou se o Google recusar a chave, usa o Leaflet 1.9 com o OpenStreetMap. Os dois precisam de internet para as imagens do mapa (o trajeto é gravado sem internet) e são carregados só quando um mapa aparece. Ver "Google Maps (opcional)".
- **Leitura de PDF:** `pdfjs-dist` 6, carregado só ao importar um plano. **Testes do banco:** `fake-indexeddb` (só em desenvolvimento).
- `src/platform.js` (`isNativeApp()`) decide o adapter: no app Android usa os adapters nativos; no navegador, o Web Bluetooth.

## Comandos

```bash
cd BalancaRelogio
npm install
npm run dev       # roda em localhost (contexto seguro, exigido pelo Web Bluetooth)
npm test          # todos os testes (Vitest)
npx vitest run src/devices/scale/okokC0Parser.test.js   # um arquivo de teste
npx vitest run -t "rótulos do OKOK"                      # testes pelo nome
npm run lint
npm run build
npm run preview

# App Android (precisa do Android Studio com o SDK instalado)
npm run android:sync   # build web + copia para android/ (rodar sempre que o código mudar)
# APK pela linha de comando (Gradle 8.14 precisa do Java 21; o Java 25 do Android Studio não serve)
cd android && JAVA_HOME="$HOME/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug
# → C:\Users\<você>\.hubsaude-build\app\outputs\apk\debug\app-debug.apk (build fora do OneDrive)
# Instalar no celular pelo cabo (depuração USB), mantendo os dados:
adb install -r "<caminho acima>"
# No Android Studio: depois de mudar arquivos .gradle, "Sync Project with Gradle Files" antes do ▶ Run
# (sem isso ele pode instalar um APK antigo). A cada APK novo, suba versionCode/versionName
# (android/app/build.gradle) e a versão do package.json: a tela do Relógio e Mais → Aparência
# mostram "versão X · gerada em …" para conferir o que está instalado.
npm run android:open   # abre o projeto no Android Studio (botão Run → celular no USB)
npm run android:run    # build + sync + instala direto no celular conectado

# Lê um PDF de plano alimentar com os leitores do app (para testar um modelo novo de PDF)
npm run diet:pdf -- "<arquivo.pdf>" [saida.json]

# Gera os sons dos alarmes do Android (res/raw/hub_*.wav) a partir de src/reminders/alarmPatterns.js
npm run alarm:sounds

# Captura do relógio (Android com o log HCI Bluetooth em "Ativado", não "Filtrado")
adb bugreport bugreport.zip   # no Samsung o log fica em FS/data/log/bt/btsnoop_hci.log dentro do zip
# No Git Bash, use MSYS_NO_PATHCONV=1 antes de "adb pull /data/..." para o caminho não ser convertido

# Lista as operações ATT de um aparelho (sem Wireshark); rodar na raiz do projeto
node tools/btsnoop.mjs capturas/relogio/btsnoop_hci.log 11:22:33:44:55:66 --out capturas/relogio/att.txt
```

**Balança real:** use Chrome ou Edge com a flag `chrome://flags/#enable-experimental-web-platform-features` ligada, suba na balança para acordá-la e clique em "Conectar balança". Sem a balança por perto, o botão "Simular pesagem" reproduz a pesagem real capturada (70,05 kg ± 0,5).

**Relógio real:** desligue o Bluetooth do celular (o relógio aceita uma conexão por vez) e clique em "Conectar relógio" na página Relógio. Não precisa de flag nem de pareamento. O botão "Simular relógio" responde com os quadros reais dos logs HCI.

## Estrutura do código (`BalancaRelogio/src`)

O fluxo de uma pesagem é: adapter BLE → sessão → hub → banco → telas.
1. `ble/`: os adapters BLE.
   - **Balança (scan):** `start(onAdvertisement, { onEnd })` / `stop()`, em `webBluetoothScanner.js` e `simulatedScanner.js`.
   - **Relógio (GATT):** `connect()`, em `webBluetoothWatchConnector.js` e `simulatedWatchConnector.js`. O simulado responde com os quadros reais e atualiza o próprio perfil quando recebe um `41`.
   - **Android, balança:** `nativeScanner.js`, com a mesma interface, sobre o `BleClient`, mais o `nativeBle.js` (inicialização e conversão de DataView). No Android, a chave do manufacturer data é o company ID em decimal, e os bytes já vêm sem ele.
   - **Android, relógio:** `watchServiceConnector.js`, sobre o **serviço nativo `WatchService`** (ver "Segundo plano e notificações no relógio"). O app só "pega carona" na conexão do serviço: `write` vira `HubBackground.watchWrite` e as notificações do relógio chegam pelo evento `watchData`, com a mesma interface dos outros adapters, mais `onState` e `detach`.
2. `devices/scale/`: lógica pura da balança, sem React nem BLE.
   - `okokC0Parser.js` decodifica um pacote.
   - `scaleSession.js` elimina os pacotes repetidos e emite uma pesagem final por vez.
   - `bodyComposition.js` tem as fórmulas do OKOK.
   - `weighings.js` converte uma pesagem em linhas do banco e as linhas de volta em pesagens.
   - `fixtures.js` guarda os pacotes reais usados nos testes e no simulador.
3. `devices/watch/`: lógica pura do relógio, sem React nem BLE.
   - `njjProtocol.js` monta e lê os quadros `BC`. Os testes conferem que hora, perfil e meta saem byte a byte iguais aos do app oficial.
   - `watchSession.js` mantém uma fila de pedidos, liga cada pedido à sua resposta e separa os eventos espontâneos. Também tem `syncAll()` e `syncUserWeight()`, que lê o perfil do relógio e regrava só o peso.
   - `watchMeasurements.js` converte a sincronização em métricas com horário próprio (posições de 30 min, passos do dia, sono).
   - `fixtures.js` guarda os quadros reais dos logs, sem o texto das notificações.
4. `hub/`: barramento de eventos (`hub.emit('measurement')`).
   - `startPersistence()` grava cada medição no banco e emite `measurements:changed`.
   - Cada métrica pode ter o próprio `timestamp`.
   - A chave da linha é `userId|device|metric|timestamp`, então sincronizar de novo atualiza em vez de duplicar.
   - **Integração:** o `useWatch` escuta as `measurement` da balança e envia o peso ao relógio. Os módulos não se importam.
5. `storage/db.js`: o único ponto de acesso ao IndexedDB. Grava com `put`. Na versão 2, que migra sozinha, ganhou a tabela `exports`, com as chaves já enviadas ao Health Connect.
   - `integrations/healthConnect/`:
     - `healthConnectMapping.js` (puro, testado) converte os eventos do hub em amostras do plugin, cada uma com uma `key` estável, e converte o que foi lido em métricas com origem `healthconnect`;
     - `healthConnectClient.js` é o único arquivo que chama o plugin.
6. `hooks/`: os hooks do app.
   - `useScale` e `useWatch` ficam no `App`, para as conexões sobreviverem à troca de página.
   - `useHealthConnect`, também no `App`, cuida das permissões e escuta as `measurement` do hub. Ele grava só o que ainda não foi enviado e importa os últimos 7 dias ao abrir o app.
   - `useUsers` (perfis; ver o item 12).
   - `useMeasurementRows` traz todas as linhas e recarrega no `measurements:changed`.
   - `useWeighings` monta as pesagens a partir das linhas.
7. `report/`: lógica pura do relatório.
   - `crossMetrics.js` faz os cruzamentos balança × relógio: passos do dia anterior, sono que terminou até 18 h antes da pesagem e FC de repouso (a menor FC nas 24 h anteriores).
   - `standards.js` tem as faixas de referência do OKOK (`StandardUtil`).
   - `metricCatalog.js` define rótulos, unidades e casas decimais.
   - `buildProgressReport.js` monta o modelo do relatório e o nome do arquivo.
8. `pages/` e `components/`:
   - as 6 abas (`HomePage`, `DevicesPage`, `DietPage`, `WorkoutPage`, `ProgressPage`, `MorePage`) e as telas que elas reúnem;
   - os componentes visuais em SVG puro, sem biblioteca: gráficos (`LineChart`, `TrendChart`), barras (`RangeBar`, `ProgressBar`), ícones (`Icon`), sub-abas (`SubNav`) e a miniatura do trajeto (`RouteThumbnail`);
   - a única exceção é o mapa, carregado sob demanda por `LazyRouteMap`, que escolhe entre `GoogleRouteMap` (Google Maps, com `googleMapsLoader.js`) e `RouteMap` (Leaflet). Os dois usam `routeLines.js`, e as cores dos traços e marcadores vêm do CSS.
9. `utils/`: formatação pt-BR e conversão hex.
10. Fora do app, em `tools/btsnoop.mjs` na raiz: o leitor de log HCI.
11. **Uso diário**: módulos puros, todos com testes.
    - `report/trend.js`: média móvel de 7 dias, ritmo em kg/semana (regressão linear) e projeção até o peso-alvo.
      - Antes da média, as pesagens **fora da curva** são ignoradas: mais de max(3 kg, 4 %) longe da mediana das vizinhas de ±7 dias, com pelo menos 2 vizinhas.
      - Várias pesagens no mesmo dia viram **um ponto** (a mediana do dia).
      - O gráfico mostra as fora da curva como círculo vazado e usa a hora no eixo quando tudo é do mesmo dia.
      - O Histórico marca essas pesagens e permite **apagar** uma pesagem (`deleteMeasurementsAt`).
    - `report/insights.js`: frases do resumo semanal e avisos informativos.
    - `report/bodyMeasurements.js`: medidas com origem `manual` e RCQ.
    - `devices/scale/assignUser.js`: decide de quem é a pesagem.
    - `diet/dietPlan.js`: formato, validação, agenda do dia, próxima refeição e lembretes.
    - `reminders/reminders.js`: lembretes no formato do plugin.
    - `utils/date.js`: idade pela data de nascimento e horários HH:MM.
12. **Hooks do uso diário:**
    - `useUsers` substitui o antigo `useProfile`: cuida da lista, do usuário atual e da idade derivada.
    - `useDiet` carrega o plano e registra as refeições feitas como linhas `diet`/`mealDone:<id>`.
    - `useReminders` agenda as notificações no Android.
    - `usePersistentState` guarda preferências deste aparelho no localStorage.
    - `useNow` é um relógio compartilhado que atualiza a cada 30 s.
13. **Banco:** tabela `diets`, com `{ userId, plans: [...], activeId }`, e funções `getDietRecord`/`saveDietRecord`, `listProfiles`, `deleteProfile`, `listAllMeasurements` e `deleteMeasurement`.
    - **Autorreparo:** o banco abre na versão atual. Se faltar alguma tabela de `REQUIRED_STORES`, ele sobe a versão sozinho e cria a tabela.
    - **Por que existe:** a recarga do Vite no meio de uma edição deixou o banco na versão 3 sem `diets` ("One of the specified object stores was not found"). O teste `storage/db.test.js`, com `fake-indexeddb`, reproduz esse caso.
    - **Formato antigo:** um registro `{ userId, plan }` vira um plano "principal".
14. **Importação de PDF da dieta:** `diet/pdf/` e `diet/importers/` (ver "Dieta e lembretes").
15. **Treinos (`workouts/`, ver "Treinos"):** módulos puros com testes, mais o adapter do GPS.
    - `activityTypes.js`: tipos de exercício, com GPS ou não, MET e velocidade máxima plausível.
    - `geo.js`: distância (haversine), limpeza de pontos ruins, velocidade recente, parciais por km, subida acumulada e projeção para SVG.
    - `recording.js`: gravação (iniciar, pausar, retomar, finalizar), resumo, evento do hub (origem `workout`) e ids das linhas.
    - `format.js`: tempo, km, ritmo e velocidade.
    - `replay.js`: percurso animado (distância acumulada, trecho percorrido até uma fração, suavização e redução de pontos). É usado pelo mapa e pelo vídeo.
    - `share/` (fora de `workouts/`, porque usa o navegador): `shareCard.js` desenha o cartão 9:16 num canvas (imagem PNG e vídeo pelo `MediaRecorder`), e `shareFile.js` compartilha (Android: Filesystem + Share; navegador: Web Share com arquivos ou download).
    - `locationSource.js`: o único arquivo que lê o GPS (plugin nativo no Android, `navigator.geolocation` no navegador).
    - Hooks: `useWorkoutRecorder` (no `App`, para continuar gravando ao trocar de aba), `useWorkouts` (lista), `useClock` (cronômetro de 1 s só na tela de gravação) e `useRouteReplay` (animação do percurso, ~25 quadros/s).
    - Banco: tabela `workouts` (`saveWorkout`, `listWorkouts`, `deleteWorkout`), criada pelo autorreparo.
16. **Dieta seguida, água e alarmes:** módulos puros, todos com testes.
    - `diet/adherence.js`: situação de cada refeição (feita = 1, "não fiz corretamente" = −1), adesão por dia e a lista das fora do plano.
    - `report/weeklyCross.js`: semanas de peso × dieta × treinos × passos e as conclusões.
    - `water/water.js`: copos (device `water`, métrica `waterMl`), total por dia e meta.
    - `reminders/reminders.js`: lembretes, canal de alarme, botões das notificações, adiar e o "despertador" do navegador.
    - `reminders/alarmPatterns.js` + `alarmSound.js`: os sons.
    - Hooks: `useWater`, `useReminders` (alarme na tela, ações e testes), `useTheme`.
    - Componentes: `AlarmOverlay` (alarme em tela cheia), `AdherenceChart`, `WaterChart` e `WaterQuickAdd`.
17. **Espaço no celular:**
    - **Trajeto dos treinos** (`workouts/trackCodec.js`): simplificado por Douglas–Peucker (2 m; o traço ajustado às ruas, 1 m) e guardado em binário (lat/lon Int32 em microgrus, altitude Int16 em dm, horário Uint32 em 0,1 s, trecho Uint8): ~15 bytes por ponto, contra ~100 do objeto.
      - A distância, as parciais e a subida são calculadas antes, com o trajeto inteiro.
      - Treinos antigos são convertidos na primeira leitura (`listWorkouts`).
      - O treino em andamento vai para o localStorage no mesmo formato, já limpo.
    - **Linhas de medição:** não guardam mais `unit`, que é fixa por métrica e nunca era lida, nem a bateria do relógio, que só aparece ao vivo.
    - **Registros de envio ao Health Connect:** os com mais de 45 dias são apagados ao abrir o app (`pruneExports`).
    - **Código:** as abas, exceto Início, são carregadas sob demanda (`React.lazy`). O pacote inicial caiu de 443 KB para 297 KB (95 KB compactado).
18. **Segundo plano e notificações no relógio (código nativo, `android/app/src/main/java/com/hubsaude/app/`):**
    - **`WatchService`** é um serviço em primeiro plano (`connectedDevice`), com a notificação fixa "Conectado ao relógio".
      - Mantém a conexão GATT com o relógio lembrado mesmo com o app **fechado e fora dos recentes** (`stopWithTask=false`, `START_STICKY`).
      - Liga as notificações do FF03 e, a cada conexão, manda o tipo de celular e a hora.
      - **Reconecta sozinho:** depois de uma queda, `gatt.connect()` espera o relógio voltar ao alcance; depois de erro, tenta de novo em 5 s → 5 min; reconecta quando o Bluetooth é religado (`ACTION_STATE_CHANGED`). As escritas passam por uma fila.
      - **Pareado no Bluetooth do celular** (o caminho preferido):
        - Com o relógio pareado (`BOND_BONDED`), a conexão usa o modo automático do Android (`connectGatt(autoConnect = true)`): o Android mantém e refaz a ligação mesmo sem o relógio anunciar (muitos relógios param de anunciar quando já estão ligados) e se junta à ligação que o celular já tiver.
        - Sem pareamento, a conexão é direta e precisa do relógio anunciando.
        - Os avisos do sistema `ACL_CONNECTED`/`ACL_DISCONNECTED` e `BOND_STATE_CHANGED` do relógio fazem o app entrar no canal de dados na hora.
      - **Robustez:** 600 ms de espera depois de conectar; o MTU é pedido e, se o Android não responder em 2 s, os serviços são lidos assim mesmo; o código de cada etapa vai para o registro. Trocar o endereço do relógio refaz a conexão.
      - **Batimento:** manda `AA 21 00 00 F0 F0 F0 F0` no FF02 a cada 60 s enquanto conectado, como o MActivePro faz a cada 30–100 s nos logs. Sem ele, o relógio pode encerrar a conexão por inatividade.
      - **Registro da conexão:** os últimos 40 eventos (conectou, desconectou com o código do Android, tentativas, Bluetooth), mostrados em Relógio → "Diagnóstico da conexão" (`ConnectionLogCard`), com "Copiar".
    - **`BootReceiver`:** volta a conectar depois de reiniciar o celular ou atualizar o app.
    - **`HubNotificationListener`** é o `NotificationListenerService`, liberado pelo usuário em "Acesso a notificações". Ele repassa cada notificação ao relógio direto no nativo, com o app fechado.
      - Ignora resumos de grupo, notificações fixas (exceto chamadas), as do próprio app e repetições da mesma mensagem.
      - Chamada tocando vai como tipo 1 ("Chamada").
      - O texto não é gravado em lugar nenhum; só a contagem de notificações por app.
    - **`NjjFrames`:** quadros `BC` em Java (notificação `0x0B`, hora `0x43`, tipo de celular `0x67`), iguais aos de `njjProtocol.js`.
    - **`WatchPrefs`** (SharedPreferences): relógio lembrado, "manter conectado", notificações ligadas, texto ou só o nome do app, apps bloqueados, ícone de cada app e a lista de apps que já notificaram.
    - **`HubBackgroundPlugin`** (registrado em `MainActivity`): é a ponte com o JS.
      - Relógio: `watchStart`, `watchStop`, `watchStatus` (também `bond`, `bonded`, `systemConnected` e `log`), `watchWrite` e os eventos `watchState`/`watchData`.
      - Bluetooth do celular: `bondedDevices` (pareados, com tipo LE/clássico/duplo e se estão ligados), `pairWatch` (janela de pareamento do Android) e `openBluetoothSettings`.
      - Notificações: `configureNotifications`, `notificationApps`, `notificationAccess`/`openNotificationAccessSettings` e o evento `notificationPosted`.
      - Bateria: `batteryStatus`/`requestIgnoreBatteryOptimizations`.
    - **Manifesto:** `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `RECEIVE_BOOT_COMPLETED` e `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
    - **Escolha do relógio** (`watchServiceConnector`): primeiro o relógio pareado no Bluetooth do celular (nome com "watch", que não seja só clássico, de preferência o já ligado). Se não houver, vem a busca do Android, e depois o app pede o pareamento ao celular. O cartão "Bluetooth do celular" (`PhoneBluetoothCard`) mostra se o relógio está pareado e ligado, lista os pareados ("Usar este") e tem "Parear pelo Bluetooth do celular" e "Abrir Bluetooth do celular".
    - **JS:** `useWatch` reconecta ao serviço quando o app abre e mostra "Procurando o relógio…" / "Bluetooth desligado"; também tem "Trocar de relógio" e "Esquecer relógio".
      - Para não perder o aviso de "conectado" que chega antes de o app começar a escutar, o conector confere o estado real (`watchStatus`) a cada 2 s na conexão, e o `useWatch` confere a cada 5 s enquanto espera. `useWatchNotifications` e `WatchNotificationsCard` cuidam das preferências, da lista de apps com o ícone de cada um, do teste, do "Testar ícones (0 a 31)" e da bateria. As regras puras ficam em `devices/watch/notificationTypes.js`.
    - **Limites:** "Forçar parada" nas configurações do app desliga tudo até abrir de novo. A economia de bateria da Samsung pode fechar o serviço; por isso a tela tem o botão "Liberar da economia de bateria" e a dica de "Apps que nunca são suspensos". O relógio aceita uma conexão por vez, então o MActivePro precisa ficar fechado.
    - **Build:** as pastas de compilação ficam em `~/.hubsaude-build/` (`allprojects` em `android/build.gradle`). Dentro do OneDrive, o build falhava com "Unable to delete directory", e o caminho com "ç" pede `android.overridePathCheck=true`.

## Relatório de Progresso (PDF)

- O modelo foi um relatório Bioeasy (PDF pessoal, fora do repositório). Para cada métrica o relatório mostra:
  - o valor atual, com carinha e rótulo da faixa;
  - a barra de faixas de referência;
  - uma tabela com as últimas 4 pesagens;
  - um gráfico de evolução.
- A página de segmentos (braços, pernas, tronco) ficou de fora porque exige balança de 8 eletrodos.
- O botão "Gerar PDF" chama `window.print()`. O CSS de `@media print` esconde o menu e formata a página em A4, e o título da página vira o nome do arquivo: `NOMERelatorioProgressoDDMMAAAA`.
- No shell desktop, o mesmo HTML pode virar PDF direto, sem a janela de impressão (ex.: `webContents.printToPDF` no Electron).
- As faixas reproduzem os rótulos do print do OKOK, e isso é verificado em `report/standards.test.js`.
- No fim do relatório, a seção **"Cruzamentos: relógio, treinos e dieta"** mostra, para as últimas 7 pesagens, os passos do dia anterior, o sono da noite anterior, a FC de repouso, os **minutos de treino da véspera** e a **dieta da véspera** (% das refeições feitas e quantas ficaram fora do plano).
- A seção **"Semanas: peso × dieta × treinos"** mostra as últimas 8 semanas, de 7 dias terminando hoje: peso médio (do peso de cada dia, sem as pesagens fora da curva), variação em relação à semana anterior, % da dieta seguida, refeições fora do plano, treinos (quantidade, minutos, km) e passos por dia.
  - **Conclusões:** comparam a variação média do peso nas semanas com dieta ≥ 80 % e com ≥ 150 min de treino (meta da OMS) com as demais, quando há pelo menos 2 semanas de cada lado. É uma comparação simples, não prova causa.
- **Período:** 30 dias, 3 meses, 6 meses ou tudo. Cada métrica mostra a "variação no período" desde a primeira pesagem dele. O bloco de dados do usuário inclui a medida mais recente de cintura e quadril e a RCQ.

## Uso diário

**Abas** (no celular, numa barra fixa embaixo da tela; no PC, no topo):

| Aba | O que tem |
|---|---|
| Início | o resumo do dia (detalhes abaixo) |
| Aparelhos | Balança e Relógio |
| Dieta | Hoje, Água, Histórico, Plano, Compras, Orientações |
| Treino | Gravar, Atividades |
| Progresso | Tendência, Histórico, Medidas, Relatório |
| Mais | Perfis, Metas, Lembretes, Integrações, Aparência |

A tela inicial mostra:
- a pesagem pendente, quando o app não sabe de quem é;
- o peso, com a média de 7 dias, o ritmo semanal e a projeção da meta;
- a atividade de hoje: passos, sono, FC de repouso e minutos de treino, com barras de meta;
- a água de hoje, com a meta e os botões de copo;
- a próxima refeição, com os botões "Fiz ✓" e "Não fiz corretamente";
- o resumo da semana e os avisos.

**Visual:**
- mobile-first: botões e áreas de toque de pelo menos 44 px (`--tap-size`);
- margem para o notch e a barra do sistema (`env(safe-area-inset-*)` e `viewport-fit=cover`);
- campos com fonte de 16 px ou mais, para o celular não dar zoom;
- tokens novos em `tokens.css`: `--color-accent`, `--color-*-soft`, `--radius-sm` e `--nav-height`.
- **Modo claro e escuro:** em Mais → Aparência há Automático (igual ao sistema), Claro e Escuro, e o botão de sol/lua no cabeçalho alterna entre os dois.
  - A escolha fica em `settings.theme` e vira `data-theme` no `<html>` (`theme/theme.js` e `hooks/useTheme.js`). O `main.jsx` aplica o tema salvo antes de desenhar, para a tela não piscar.
  - O `tokens.css` tem as cores escuras em `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` e em `:root[data-theme='dark']`.
  - O PDF sai sempre claro, e o Google Maps abre no tema do app.

**Vários usuários:**
- **Quem é o dono da pesagem:** o app compara com o último peso de cada pessoa. Ele atribui sozinho se o mais próximo estiver a até 5 kg e pelo menos 2 kg mais perto que o segundo. Senão, aparece o cartão "De quem é esta pesagem?".
- **Dono do relógio:** recebe os dados do relógio, e só as pesagens dele vão para o perfil do relógio.
- **Dono do celular:** os dados dele vão para o Health Connect, e o plano alimentar dele gera os lembretes.
- **Padrão:** sem escolha, o dono do relógio e o do celular é o primeiro usuário.
- **Idade:** sai da data de nascimento, calculada a cada uso.

**Metas:**
- peso-alvo, passos por dia e horas de sono ficam em `profile.goals`;
- a meta de passos vai para o relógio automaticamente (comando `0x49`).

**Sincronização automática com o relógio** (`useWatch`):
- **App → relógio:**
  - Ao salvar o **Perfil** ou as **Metas** e sempre que o relógio conecta ou reconecta, vão sozinhos ao relógio a altura, o sexo, o nascimento, a idade e o último peso da balança (`0x41`), além da meta de passos (`0x49`).
  - O app lê o perfil do relógio antes e só regrava se algo mudou (`mergeUserInfo`); o tom de pele fica como está.
  - O peso de cada pesagem nova também vai sozinho (`syncUserWeight`), e a hora é acertada a cada conexão (serviço nativo).
- **Relógio → app:** FC, SpO2, pressão, passos por hora, resumo do dia e sono são lidos ao conectar, a cada reconexão e **a cada 15 min** com o app aberto.
  - Com o app fechado, os dados ficam no relógio até o app abrir. O FC/SpO2/pressão do dia vêm em 48 posições de 30 min do dia atual, então vale abrir o app ao menos uma vez por dia.
- **Na tela:** o Perfil e as Metas mostram "✓ Relógio atualizado às HH:MM" (`WatchSyncStatus`); o botão manual "Enviar meta ao relógio" saiu.

**Dieta e lembretes:**
- **Formato do plano:** `{ prescribedBy, prescribedAt, guidelines[], shoppingList[], meals: [{ id, name, time "HH:MM", reminderText?, options: [{ label, items: [{ main, substitutes[] }], notes? }] }] }`. Cada linha da tabela da nutricionista vira um item, com a opção principal e as substituições.
- **Vários planos por pessoa:** um deles é o **principal**, e é ele que alimenta a agenda de hoje, a tela inicial e os lembretes. Em Dieta → Plano dá para adicionar planos, tornar um deles o principal, editar, renomear e excluir.
- **Importar PDF:** o app lê o PDF sozinho, com o pdf.js carregado só nessa hora.
  - `diet/pdf/extractPdfText.js` extrai o texto com posição e tamanho da fonte.
  - `diet/pdf/layout.js` monta as linhas e separa as colunas.
  - `diet/importers/index.js` escolhe o leitor, completa os horários e valida o plano.
- **Leitor WebDiet (modelo principal, `importers/webDiet.js`):** calibrado com o PDF real.
  - Títulos de refeição em ~13,5 pt; tabela em 7,5 pt, com a coluna de substituição em x≈302.
  - Cada substituição vai para o item principal mais próximo na vertical. Linhas que atravessam as duas colunas não recebem substituição.
  - "Jantar - Opção 2" vira a 2ª opção do Jantar.
  - "• Opções de substituição para X" é dividido em "- ou -".
  - Observações curtas viram nota da refeição; as longas, orientações.
  - "Após o almoço, tomar …" vira o lembrete do almoço.
  - Também lê a lista de compras ("◯"), o profissional (cabeçalho) e a data (rodapé).
  - **Conferência:** no PDF real, o resultado ficou idêntico à transcrição manual (itens, substituições e compras).
- **Outros formatos:** o leitor genérico (`importers/simpleText.js`) reconhece "12:30 Almoço" ou nomes de refeição e lê cada linha como item ("A ou B", "A | B"). Para aceitar um formato novo, crie um leitor `{ id, label, detect(pages), parse(pages) }` e coloque-o em `DIET_IMPORTERS` **antes** do genérico. O `npm run diet:pdf` mostra o que cada PDF gera.
- **Horários (`importers/mealTimes.js`):** o WebDiet não imprime horários. Em ordem de prioridade, o horário vem:
  1. do próprio arquivo;
  2. da refeição de mesmo nome no plano principal atual;
  3. de uma sugestão pelo nome.

  A ordem das refeições é mantida.
- **Arquivos do usuário:** o PDF e a transcrição (`plano-alimentar.json`) estão em `capturas/dieta/`, fora do git porque são dados pessoais. Os dois podem ser importados.
- **Lembretes:**
  - **Android:** notificações diárias (`schedule.on`) no horário de cada refeição, com os itens principais, além do lembrete opcional de pesagem e do de água. São reagendados sempre que o plano ou as preferências mudam.
  - **Navegador:** não há notificação agendada. Um "despertador" confere a cada 20 s, com a página aberta, e mostra o alarme na tela e a notificação do Windows, se permitida.
  - **Alarme** (Mais → Lembretes):
    - **Estilo "alarme":** canal do Android com importância máxima (5), em que a notificação aparece por cima da tela, toca e vibra; visível na tela bloqueada e com luz.
    - **Estilo "notificação comum":** importância 3.
    - **Som:** alarme, suave, bipe ou só vibrar. Os arquivos ficam em `res/raw/hub_*.wav`, gerados por `npm run alarm:sounds`.
    - **Volume:** vale para o alarme na tela; com o app fechado, vale o volume de notificações do celular.
    - Também dá para ligar ou desligar a vibração e a luz e escolher o tempo de "adiar".
    - Como o Android não deixa alterar um canal, cada combinação de ajustes cria o seu (`hub-lembretes-…`), e os antigos são apagados.
  - **Botões na notificação:** água → "Bebi um copo" / "Adiar"; refeição → "Fiz ✓" / "Não fiz corretamente" / "Adiar"; pesagem → "Adiar". O adiar reagenda em N minutos (ids 3000–3019).
  - **Alarme em tela cheia** (`AlarmOverlay`): com o app aberto, o lembrete cobre a tela piscando, com som no volume escolhido, vibração e os mesmos botões. Há também "Testar alarme na tela" e "Testar notificação (10 s)".
  - **Limite:** o plugin não tem "tela cheia sobre a tela bloqueada", como o do despertador do sistema, porque isso exigiria código nativo próprio.
- **Refeição feita × "Não fiz corretamente":**
  - Em Dieta → Hoje, cada refeição tem "Fiz ✓", "Não fiz corretamente" e "Desfazer". A mesma linha `mealDone:<id>` grava 1 ou −1.
  - **Dieta → Histórico:** gráfico de 14 dias (feitas, fora do plano, sem registro), % seguida em 7 e 30 dias e a lista das fora do plano. Contam só as refeições cujo horário já passou, a partir do primeiro dia marcado.
- **Água** (Dieta → Água e cartão na tela inicial):
  - copos de 200, 250 ou 500 ml, quantidade livre, desfazer e lista do dia;
  - gráfico de 7 dias com a meta;
  - lembrete de X em X minutos entre dois horários.
  - **Meta:** média de 35 ml × peso com 1,5 L × superfície corporal (Mosteller: √(altura × peso ÷ 3600)), mais 500 ml por hora de treino do dia. Sem pesagem, a meta é 2 L. É orientação geral, não médica.
  - Cada copo vai ao Health Connect como hidratação (`dietaryWater`, em litros) 5 min depois, para dar tempo de desfazer.
- **Lista de compras:** a marcação fica no localStorage deste aparelho.

**Treinos (aba Treino, estilo Strava):**
- **Exercícios:** com GPS (corrida, caminhada, trilha, pedalada) gravam o trajeto, a distância, o ritmo (min/km) ou a velocidade (km/h) e a subida. Sem GPS (musculação, **Muay Thai** (MET 10,3), esteira, natação, yoga, outro), contam só o tempo e as calorias.
- **Finalizar:** pausa o cronômetro e o GPS enquanto pergunta "Salvar / Continuar / Descartar". "Continuar" volta a gravar se estava gravando.
- **Gravando:** cronômetro do tempo em movimento (a pausa não conta), distância, ritmo atual (últimos 30 s) e médio, estado do GPS e mapa seguindo a posição. Cada pausa fecha um trecho, e o trajeto não liga os trechos.
- **GPS:**
  - **Android:** continua com a tela apagada, como serviço com notificação ("Gravando o treino").
  - **Navegador:** para quando a tela apaga, então serve só para testar.
    - Se o GPS demorar ("Timeout expired") ou a localização estiver indisponível, a gravação não para: o app avisa, recomeça a busca sozinho e usa a posição aproximada (Wi-Fi/rede) para centralizar o mapa.
    - **No PC**, o Chrome/Edge usa a localização do Windows (Configurações → Privacidade e segurança → Localização, com "Permitir que aplicativos da área de trabalho acessem sua localização" ligado), que vem do Wi-Fi. PC só no cabo costuma não ter posição, e a precisão (±50 m ou pior) não basta para o trajeto.
    - **"Simular trajeto"** (só no navegador, para os exercícios com GPS): faz uma volta de 1,3 km com 9 m de subida (`workouts/simulatedRoute.js`) na velocidade típica do exercício (`simSpeed`), um ponto por segundo. Serve para testar a tela, o mapa, as parciais e o salvamento sem GPS. O treino fica salvo com "(simulado)" no nome.
  - **Limpeza dos pontos:** são descartados os pontos com precisão pior que 30 m e os saltos mais rápidos que 1,5 × a velocidade máxima do exercício.
- **Treino em andamento:** fica no localStorage a cada 10 s e em cada pausa, e é retomado se o app recarregar. Em outras abas aparece a faixa "gravando · toque para voltar".
- **Ao finalizar:** o treino é salvo na tabela `workouts` e publicado no hub como `workoutDistance` (m), `workoutDuration` (s) e `workoutCalories` (kcal). Esses números entram no resumo da semana, na tela inicial e no Health Connect (distância e calorias ativas; é preciso autorizar de novo para liberar esses tipos).
- **Calorias:** MET do exercício × último peso da balança × horas em movimento. Sem pesagem, o app usa 70 kg e avisa.
- **Percurso animado (estilo flyover do Strava):** depois de "Salvar treino", o detalhe abre e o ponto percorre o trajeto até o fim em ~10 s, com a câmera seguindo (zoom 15). Os controles são Pausar/Continuar, "Pular para o fim" e "Rever percurso". Os dois mapas atualizam o traço e os marcadores no lugar, sem recriar, para a animação ficar leve.
- **Compartilhar** (cartão no detalhe do treino):
  - **Vídeo do percurso:** formato story (720 × 1280), com o trajeto sendo desenhado sobre o trajeto inteiro em tom claro, o ponto com brilho na ponta e o nome, a data, a distância, o tempo, o ritmo/velocidade e as calorias.
    - Leva ~9 s: 7 s de animação e 2 s no quadro final.
    - O formato é MP4 quando o navegador grava MP4, senão WebM.
    - Ele é gerado primeiro, com prévia, e compartilhado num segundo clique, porque o navegador só abre o menu de compartilhar logo depois de um clique.
  - **Imagem:** o mesmo cartão, em PNG.
  - **Sem as imagens do mapa:** o cartão desenha só o trajeto, porque copiar o mapa do Google para um vídeo esbarra nos termos de uso.
  - **Onde vai parar:** no Android abre o menu de compartilhar (WhatsApp, Instagram…); no PC, o compartilhar do Windows; sem suporte, o arquivo é baixado.
  - As cores vêm dos tokens `--share-*` e `--color-route`.
- **Atividades:** totais dos últimos 7 dias e a lista com a miniatura do trajeto. O detalhe mostra o mapa, os números e as parciais por km com barra de comparação, e permite renomear e apagar (apagar também remove as linhas do banco de medições).
- **Google Maps (opcional):**
  1. No Google Cloud, ative a **Maps JavaScript API** (o mapa) e, se quiser o ajuste às ruas, a **Roads API**. As duas precisam estar **no mesmo projeto** da chave e do ID de mapa. Elas exigem uma conta de faturamento, mas há uma cota grátis por mês. Crie um alerta de orçamento para não ter surpresa.
  2. Em **APIs e serviços → Credenciais**, crie uma **chave de API** e restrinja:
     - **Sites:** `http://localhost:5173/*` (desenvolvimento) e `https://localhost/*` (app Android, a origem do Capacitor);
     - **APIs:** Maps JavaScript API e Roads API.
  3. Opcional: em **Google Maps Platform → Gerenciamento de mapas**, crie um **ID de mapa** do tipo JavaScript, **Vetor**. Sem ele, o app usa o `DEMO_MAP_ID`, só para testes.
  4. Copie `BalancaRelogio/.env.example` para `BalancaRelogio/.env.local`, preencha a chave (e o ID) e reinicie o `npm run dev`. O `.env.local` fica fora do git (`*.local`).
  - A chave vai dentro do app (é assim com toda API de mapa no navegador), por isso as restrições são obrigatórias.
  - Mapa/satélite no canto do mapa e tema escuro junto com o sistema.
  - **Ajustar trajeto às ruas** (detalhe do treino, só com a chave): `integrations/google/roads.js`.
    - Envia o trajeto à Roads API (`snapToRoads` com interpolação), com pontos a cada ~20 m, até 100 por pedido e cada pedido emendado no anterior.
    - Guarda o resultado em `workout.snappedPoints`. O GPS original continua salvo e dá para alternar entre "Ajustado às ruas" e "GPS original".
    - A distância e as parciais continuam as do GPS.
    - Se o Google recusar (ex.: a Roads API não está liberada na chave), a mensagem dele aparece na tela.
  - A chave e o ID ficam em `integrations/google/googleConfig.js` (lidos do `.env.local`).
- **Treinos do relógio:** ainda não são lidos. O relógio tem modos de exercício próprios, mas o comando de sincronização deles ainda precisa ser capturado (ver "O que ainda falta" no Módulo 2).

## Arquitetura pretendida

Os dois dispositivos usam BLE de modos diferentes. A camada de transporte precisa atender aos dois, e a UI nunca chama a API BLE diretamente.
1. **Transporte BLE (adapter):**
   - **Modo scan (balança):** `scan(onAdvertisement)` / `stop()`, em que o callback recebe `{ name, companyId, data: Uint8Array, rssi }`. `data` já chega sem os 2 bytes do company ID.
   - **Modo conexão GATT (relógio):** `connect()`, que devolve `{ name, write(bytes), subscribe(listener) → cancelar, onDisconnect(listener), disconnect() }`. O adapter já escolhe o canal de dados (`FF02`/`FF03`), então quem chama só troca bytes.
   - Implementações: Web Bluetooth (protótipo), nativa desktop e, no futuro, mobile.
2. **Protocolo por dispositivo:** módulos puros, sem DOM nem BLE, testados com os bytes capturados.
   - Balança: parser `(companyId, data) → { weightKg, impedance?, stable, final } | null`.
   - Relógio: encoders de comando (hora, notificação, alarme) e decoders de notificação (FC, passos, sono, SpO2, bateria).
3. **Composição corporal:** funções puras `(weightKg, impedance, perfil) → métricas`.
4. **Banco local comum:** séries temporais `{ userId, device, metric, timestamp, value, unit }`. Fica atrás de um adapter (IndexedDB agora, trocável por SQLite no nativo ou no mobile).
5. **Hub de integração:** liga os dois módulos (regras abaixo).
6. **UI React:** medição da balança em tempo real, painel do relógio, perfil do usuário, histórico e painel de cruzamentos.

### Integração balança ↔ relógio

Os dois módulos precisam trocar dados e ter suas medições cruzadas. Regras:
- **Desacoplamento:** um módulo nunca importa o outro. Cada um publica medições normalizadas como eventos `measurement` num barramento do hub. O hub grava no banco e repassa o evento aos interessados.
- **Perfil único:** idade, altura, sexo e peso atual ficam num perfil compartilhado.
  - A balança usa o perfil para calcular a composição corporal.
  - Quando chega uma pesagem nova, o hub atualiza o peso do perfil e o envia ao relógio, que usa esse dado em calorias e passada. Comando confirmado: `0x41` (peso em kg inteiro; ver Módulo 2).
- **Base de tempo única:** todos os timestamps ficam em UTC (epoch ms).
  - A balança não tem relógio, então a pesagem recebe a hora em que o pacote chegou.
  - O relógio grava os dados com a hora dele. Por isso o hub **envia a hora ao conectar, antes de ler o histórico**; sem isso, as séries não se alinham.
- **Conexões simultâneas:** o scan da balança tem que funcionar com o relógio conectado.
- **Pesagem ao vivo:** se o relógio estiver conectado durante a pesagem, grave junto com ela a FC daquele instante. **Ainda não implementado:** falta descobrir qual comando dispara a medição de FC (candidatos: `7E`/`1D`).
- **Cruzamentos:** funções puras sobre o banco, que agregam os dados por "dia do usuário". Uma pesagem feita de manhã se liga:
  - ao sono que terminou naquela manhã;
  - aos passos do dia anterior;
  - à FC de repouso do período.

  Exemplos de cruzamento: tendência de peso × média de passos dos últimos 7 dias, peso × horas de sono, composição corporal × FC de repouso.
- **Dono da pesagem:** os dados do relógio pertencem a um único `userId`. Se houver mais de um perfil na balança, atribua a pesagem pelo peso mais próximo do último registrado de cada perfil e peça confirmação ao usuário.

### Integrações externas: Google e Samsung Health (pesquisa de 16/10/2026; implementado via Health Connect)

| Serviço | Situação | Do PC? |
|---|---|---|
| **Google Fit APIs** | Fechadas para cadastro de apps novos desde 01/05/2024; suportadas só até o fim de 2026. O Google indica Health Connect (no aparelho) ou Google Health API (nuvem) | não |
| **Google Health API** (`health.googleapis.com/v4`) | Lançada em 24/03/2026, sucessora da Fitbit Web API. Grava `weight`, `body-fat`, `height`, `sleep` e `exercise` (`users.dataTypes.dataPoints.create`); `heart-rate` e `oxygen-saturation` são só leitura; pressão não aparece na documentação. Escopos "Restricted" (ex.: `googlehealth.health_metrics_and_measurements.writeonly`); sem verificação, o app fica limitado a 100 usuários. Não aceita IDs definidos pelo app, então é preciso guardar o ID que o servidor devolve. Se o que se grava ali chega ao Health Connect, a documentação não diz | sim (REST + OAuth) |
| **Samsung Health** | Sem API na nuvem. O Samsung Health Data SDK é só para Android, e gravar exige parceria aprovada. Sincroniza com o Health Connect (Samsung Health 6.22.5+) | não |
| **Health Connect** | Armazenamento de saúde no próprio Android (Android 14+ já vem com ele). Só um app rodando no celular grava. Leituras limitadas a ~30 dias, a menos que o usuário dê permissão de histórico | não |

**Consequência:** para chegar ao Samsung Health, o caminho é a versão Android do app, via **Capacitor** + plugin de Health Connect, gravando no Health Connect. Dá para usar o `@capgo/capacitor-health`, que declara escrita de peso, passos, FC e sono, ou o `@capawesome-team/capacitor-health`, que grava peso e pressão. O plugin oficial `@capacitor/health-fitness` só grava peso, altura, % gordura e TMB no Android.

O MActivePro talvez já envie os dados do relógio para lá. Se enviar, gravar os mesmos dados pelo nosso app duplicaria.

**Decisão: app Android + Health Connect, com o `@capgo/capacitor-health`.**

| Sentido | Dados | Detalhes |
|---|---|---|
| Grava (balança) | `weight`, `bodyFat`, `basalCalories` (TMB) | % gordura e TMB são as estimativas do OKOK; precisam do perfil |
| Grava (relógio) | `steps`, `heartRate`, `oxygenSaturation`, `bloodPressure`, `sleep` | passos em intervalos de 1 h, só de horas já terminadas; o total do dia não é enviado, para não contar em dobro |
| Grava (treinos e água) | `distance`, `calories`, `dietaryWater` | distância e calorias ativas de cada treino; cada copo de água em litros |
| Lê | `steps` (somado por dia), `heartRate`, `sleep` | ignora o que o próprio app gravou (`sourceId` = `com.hubsaude.app`); entra no banco com origem `healthconnect` e serve de reserva nos cruzamentos (o relógio tem prioridade) |

- **Sem duplicar:** o plugin não aceita ID próprio, então cada amostra leva uma chave (`tipo|timestamp`), registrada na tabela `exports` depois de gravada.
- **Só com o app na tela:** sem a permissão `READ_HEALTH_DATA_IN_BACKGROUND`, o Health Connect recusa leituras com o app fora da tela ("must be in foreground"), e o serviço do relógio mantém o JS rodando em segundo plano.
  - Por isso a importação e a confirmação esperam o app voltar (`appState.js`, `whenAppActive`, com o plugin `@capacitor/app`), e o envio só roda com o app na tela; o pendente vai pela recuperação.
  - Ao voltar para o app, ele importa, manda o pendente e confere, no máximo a cada 10 min.
- **Só valores finais:** o plugin não corrige nem apaga um registro já gravado.
  - Passos: só horas terminadas.
  - FC, SpO2 e pressão: só meias horas terminadas.
  - Sono: só 30 min depois de acordar.
  - Apagar uma pesagem ou um treino no app **não** apaga no Health Connect.
- **Envio de recuperação** (`catchUpEvents` + `exportPending`): ao abrir o app e no botão "Enviar pendentes", o app manda o que ficou para trás nos últimos 30 dias, como pesagens feitas no PC, o período sem permissão e valores que só agora são finais.
- **Confirmação** (Integrações → "Confirmação da sincronização", `buildSyncReport`):
  - mostra o último envio e a última importação;
  - lê de volta 30 dias de cada tipo que o app grava e mostra, por tipo, quantos foram enviados, quantos estão no Health Connect com a origem `com.hubsaude.app` e de quais outros apps vieram dados;
  - Samsung Health (`com.sec.android.app.shealth`) ou Google Fit (`com.google.android.apps.fitness`) como origem prova que a ponte deles com o Health Connect está ligada;
  - o que esses apps mostram por dentro o Hub não consegue ver;
  - confere sozinha ao abrir o app;
  - para ler de volta, o app pede leitura de todos os tipos que grava, então é preciso tocar em "Revisar permissões" uma vez.
- **Configuração:** a página **Integrações** traz as permissões, quatro chaves liga/desliga (balança, relógio, treinos, importação), "Importar agora", o atalho para o Health Connect e a confirmação acima.
- **Cartão de status** (topo de Integrações, `ConnectionStatus.jsx` + `connectionState`):
  - **✓ Conectado** (verde), com todas as permissões de `PERMISSION_SCOPES` e a data da última confirmação;
  - **! Conectado em parte** (laranja), dizendo quais permissões faltam;
  - **✕ Não conectado** (vermelho), também mostrado no PC, onde o Health Connect não existe;
  - "Health Connect não encontrado", quando falta instalar.
  - O botão **"Conectar ao Health Connect"** abre direto a tela de permissões do Health Connect ("Permitir tudo").
- **Exigências do Health Connect:**
  - a política de privacidade fica em `public/privacypolicy.html`, que o Capacitor copia para `android/app/src/main/assets/public/`;
  - a tela de justificativa das permissões e as permissões de saúde vêm do manifesto do plugin;
  - as permissões de Bluetooth estão em `android/app/src/main/AndroidManifest.xml`.
- **Samsung Health:** o usuário liga a sincronização com o Health Connect dentro do próprio Samsung Health.

---

## Módulo 1: Balança (Original Line / OKOK)

A balança transmite o **peso** e um valor de impedância **fixo**: `0x1770` = 600,0 Ω, igual de meia ou com os pés úmidos.
- O app OKOK usa esse valor como se fosse medido e calcula a composição corporal com as fórmulas do `CsAlgoBuilder` (ver "Fórmulas do OKOK").
- Como o Z é constante, os resultados dependem só de peso, altura, idade e sexo. São **estimativas**, não bioimpedância real, e o app deve rotulá-los assim.

### Protocolo esperado (referência: openScale)

O repositório github.com/oliexdev/openScale (Kotlin, branch `master`) tem os arquivos de referência abaixo, todos em `android_app/app/src/main/java/com/health/openscale/core/bluetooth/`:
- `scales/OkOkHandler.kt`: parser das balanças OKOK
- `libs/OkOkV2Lib.kt`: fórmulas de composição corporal (o código cita `Alchives/reverse-engineering`, branch `okok-c0`)
- `ScaleFactory.kt`: mapeia o nome BLE para o driver

As balanças OKOK são **broadcast-only**: os dados chegam no *manufacturer specific data* do advertising. Não há conexão GATT nem UUID de service/characteristic. Nomes BLE reconhecidos: `ADV`, `Chipsea-BLE`, `Yoda0*`, `Yoda1*`, ou nome vazio (o openScale chama de `OKOK Nameless`).

Os offsets abaixo **não contam** os 2 bytes do company ID. É assim no Android e no `manufacturerData` do Web Bluetooth. Se a biblioteca BLE entregar o buffer com o company ID incluso, some 2 a cada offset. `u16be[a,b]` = `(data[a] << 8) | data[b]`.

| Company ID | Tamanho | Peso bruto | Divisor do peso | Impedância | Validação |
|---|---|---|---|---|---|
| `0x20CA` (V20) | 19 | `u16be[8,9]` | 100 se `data[6] & 0x04`, senão 10 | `u16be[10,11] / 10` | final = `data[6] & 0x01`; `0x20 ^ data[0..11]` (XOR) == `data[12]` |
| `0x11CA` (V11) | 23 | `u16be[3,4]` | res = `(data[9]>>1)&3` | não tem | `(0xCA^0x11) ^ data[0..15]` (XOR) == `data[16]`; unidade = `(data[9]>>3)&3` |
| `0xF0FF` (VF0) | ≥ 4 | `u16be[3,2]` (bytes invertidos) | 10 | não tem | nenhuma |
| byte baixo `0xC0` (C0) | ≥ 13 | `u16be[0,1]` | res = `(data[6]>>1)&3` | `u16be[2,3] / 10` | estável = `data[6] & 0x01` (se não estiver estável, descarta); unidade = `(data[6]>>3)&3` |

- res: 0 → ÷10, 1 → ÷1, 2 → ÷100, 3 → ÷10.
- Unidade: 0 = kg, 1 = jin (÷2), 2 = lb (÷2.204623), 3 = st/lb.
- No openScale, só a variante C0 calcula composição corporal (exige idade > 5 e impedância ≠ 0).
- **A captura confirmou que a Original Line usa a variante C0** (ver "Dados capturados").
- **Bug provável em `OkOkV2Lib.kt`** (achado lendo o código, não executado): vários clamps estão com `min`/`max` invertidos. Por exemplo, `min(20f, max(x, 85f))` sempre retorna 20. Afeta `getWater`, `getBodyFat`, `getVisceralFat`, `getMuscle` e `getBoneMass`. Ao portar, use `max(lo, min(x, hi))` em vez de copiar o código como está.
- O mesmo pacote de advertising se repete muitas vezes em uma pesagem. Elimine as repetições e grave no banco só o pacote final/estável.

### Restrição: advertising × Web Bluetooth

O fluxo normal do Web Bluetooth (`requestDevice` → GATT) não recebe nada de uma balança broadcast-only. Para ler o advertising é preciso:
- `device.watchAdvertisements()`, que só funciona com a flag `chrome://flags/#enable-experimental-web-platform-features` ligada;
- `optionalManufacturerData: [<company IDs>]` no `requestDevice`, senão o navegador não expõe os bytes.

Isso basta para o protótipo. Para o app Windows final, prefira um scanner BLE nativo (ex.: Tauri + `btleplug`, que usa WinRT) atrás do mesmo adapter de transporte.

### Como capturar

Com o nRF Connect (Android), aba SCANNER, sem filtros:
1. Suba na balança: ela só anuncia quando está acordada. Procure um nome da lista acima ou um dispositivo sem nome (N/A) com RSSI forte bem perto do celular.
2. Toque no dispositivo e abra o **RAW**. Ele mostra estruturas no formato `len type value`. O tipo `0xFF` é o manufacturer data, e os 2 primeiros bytes dele são o company ID em little-endian (ex.: `CA 20` = `0x20CA`).
3. Espere o peso estabilizar no display e anote o hex junto com o peso exibido. Repita com 2 ou 3 pesos diferentes (ex.: segurando um objeto) e sempre descalço, porque sem contato dos pés não há impedância.
4. Se não houver manufacturer data e o dispositivo aparecer como CONNECTABLE: conecte, liste os services/characteristics, ative o notify e capture os pacotes durante a pesagem.

### Dados capturados (2026-10-16; prints só no PC, fora do repositório; MAC trocado por um fictício)

- **Aparelho:** sem nome BLE (aparece como N/A), MAC `AA:BB:CC:DD:EE:01`. Não é conectável (não tem botão CONNECT), o que confirma que só faz broadcast.
- **Variante C0:** o byte baixo do company ID é sempre `0xC0`. O byte alto é o `measureSeqNo` (nome usado no código do OKOK): começa em `0x01` quando a balança acorda e sobe a cada pacote durante a medição. No pacote final ele para (valores vistos: `0x07`, `0x09`, `0x0A`, `0x0D`).
  - Para reconhecer a balança, use `companyId & 0xFF == 0xC0` + o MAC nos bytes `[7..12]`. Nunca use um company ID fixo nem o nome.
  - Para eliminar pacotes repetidos, compare os 13 bytes de dados, não o company ID.
  - No Web Bluetooth, o `optionalManufacturerData` precisa listar os 256 IDs de `0x00C0` a `0xFFC0`. O Web Bluetooth não expõe o MAC, então use o MAC que vem no payload para saber que é esta balança.

Layout observado (13 bytes depois do company ID):

| Bytes | Exemplo | Significado |
|---|---|---|
| `[0,1]` | `1B 5D` | peso ÷ 100. **Confirmado:** 7005 → 70,05 kg, igual ao display |
| `[2,3]` | `00 00` / `17 70` | impedância × 10 (no OKOK, `r1`): 0 durante a medição; `0x1770` (600,0 Ω, fixo) no pacote final. O bit7 de `[2]` marca pacote criptografado, o que não é o caso desta balança |
| `[4,5]` | `0A 01` | `productId` = `0x0A01` (modelo da balança) |
| `[6]` | `24` / `25` | atributo (no OKOK, `scaleProperty`): bit0 = pesagem final; res = 2 (÷100); unidade = 0 (kg); bit5 sempre ligado (função desconhecida) |
| `[7..12]` | `AA BB CC DD EE 01` | MAC da balança |

Fases de uma pesagem (capturada às 16:49; display mostrou 70,05 kg):

| Fase | Atributo `[6]` | Peso | Campo `[2,3]` | Duração |
|---|---|---|---|---|
| Acordou | `24` | 0 | 0 | ~5 pacotes |
| Medindo | `24` | sobe: 68,60 → 69,50 → 69,90 → 69,95 → 70,00 → 70,05 | 0 | ~2,5 s |
| Final | `25` | 70,05 | `0x1770` | o mesmo pacote se repete a cada ~65 ms por ~13 s |

O display também mostra temperatura (26 °C), mas nenhum campo do pacote corresponde a ela até agora.

Pacotes capturados (use como fixtures dos testes; o campo `[2,3]` está em hex bruto):

| Company ID | Dados (hex) | Peso (kg) | Campo `[2,3]` | Final |
|---|---|---|---|---|
| `0x01C0` | `000000000A0124AABBCCDDEE01` | 0 | `0000` | não |
| `0x16C0` | `01A417700A0124AABBCCDDEE01` | 4,20 | `1770` (sobra da pesagem anterior) | não |
| `0x19C0` | `0D1617700A0124AABBCCDDEE01` | 33,50 | `1770` (sobra da pesagem anterior) | não |
| `0x06C0` | `1ACC00000A0124AABBCCDDEE01` | 68,60 | `0000` | não |
| `0x1DC0` | `1B5800000A0124AABBCCDDEE01` | 70,00 | `0000` | não |
| `0x25C0` | `1B5D00000A0124AABBCCDDEE01` | 70,05 | `0000` | não |
| `0x0DC0` | `1B5D17700A0125AABBCCDDEE01` | 70,05 (display: 70,05) | `1770` | sim |
| `0x07C0` / `0x09C0` / `0x0AC0` | `1B6717700A0125AABBCCDDEE01` | 70,15 | `1770` | sim |
| `0xE5C0` | `1B5317700A0124AABBCCDDEE01` | 69,95 | `1770` | não |
| `0x10C0` | `1B5317700A0125AABBCCDDEE01` | 69,95 (de meia; display: 69,95) | `1770` | sim |
| `0x25C0` | `1B3000000A0124AABBCCDDEE01` | 69,60 | `0000` | não |
| `0x13C0` | `1B3017700A0125AABBCCDDEE01` | 69,60 (pés úmidos; anotado 69,90, a confirmar) | `1770` | sim |

### Impedância: valor fixo de 600,0 Ω

- O campo `[2,3]` veio **exatamente** `0x1770` no pacote final de todas as 5 pesagens, inclusive **de meia** (sem contato) e **com os pés úmidos** (contato melhor). Uma impedância real mudaria entre esses casos, então o valor é fixo.
- No começo de uma pesagem, o campo às vezes repete o valor final da pesagem anterior.
- Nenhum outro byte do pacote varia, além do peso, do atributo e do contador. A balança não aceita conexão, então o advertising é tudo o que ela transmite.
- O parser oficial do OKOK (`okokBroadcasetV2Parser`) lê esse campo como `r1 = u16be / 10` e o usa como impedância (Z) nas fórmulas, sem verificar se o valor é plausível.
- **Regra do parser:** devolva o valor lido (`impedance = u16be[2,3] / 10`), como o OKOK faz. A UI rotula a composição corporal como estimativa.
- Não use o `OkOkV2Lib.kt` do openScale: ele vem de outro app (leaone) e não reproduz os números do OKOK. Use as fórmulas abaixo.

### Fórmulas do OKOK (APK 3.1.66, `apk/okok-3.1.66.apk`)

Fonte: `com.chipsea.code.algorithm.CsAlgoBuilder`, descompilado com jadx.
- O app tenta primeiro a biblioteca nativa `libchipsea_bias_v235.so`, pela chamada `chipsea.bias.v235.CSBiasAPI.cs_bias_v235(sexo, idade, altura, peso×100, Z×10)`. Essa biblioteca não está no APK que temos (ela fica no split por arquitetura).
- Se a biblioteca falhar, o app usa as fórmulas Java abaixo, que valem para balança de 4 eletrodos.

Variáveis: H = altura (cm), W = peso (kg), A = idade (anos), Z = impedância (Ω), S = sexo (1 = masculino, 0 = feminino). M = masculino, F = feminino.

| Métrica | Fórmula | Limites |
|---|---|---|
| IMC | W / (H/100)² | — |
| Gordura % | M: (−0,3315H + 0,6216W + 0,0183A + 0,0085Z + 22,554) / W × 100<br>F: (−0,3332H + 0,7509W + 0,0196A + 0,0072Z + 22,7193) / W × 100 | 5–45; arredonda para 2 casas |
| Massa gorda (kg) | Gordura% × W / 100 | — |
| Massa magra (LBM) | W − massa gorda | — |
| Água % (só A > 17) | M: (0,0939H + 0,3758W − 0,0032A − 0,006925Z + 0,097) / W × 100<br>F: (0,0877H + 0,2973W + 0,0128A − 0,00603Z + 0,5175) / W × 100 | 20–85; com A ≤ 17, o resultado é 0 |
| Massa muscular (kg) | M: 0,2867H + 0,3894W − 0,0408A − 0,01235Z − 15,7665<br>F: 0,3186H + 0,1934W − 0,0206A − 0,0132Z − 16,4556 | 20–70. Se a gordura % bruta (antes do limite) for > 45, usa W×0,55 − 4; se for < 5, usa W×0,95 − 1 |
| Massa muscular % | massa muscular / W × 100 | — |
| Músculo esquelético (kg) | 0,2573H + 0,1745W − 0,0161A + 2,4269S − 0,017Z − 20,2165 | 20–70 |
| Ossos (kg) | W − massa gorda − massa muscular | 1–4 |
| Gordura visceral (só A > 17) | M: −0,2675H + 0,42W + 0,1462A + 0,0123Z + 13,9871<br>F: −0,1651H + 0,2628W + 0,0649A + 0,0024Z + 12,3445 | parte inteira, + 0,5 se a fração for ≥ 0,5; 1–59 |
| Metabolismo (TMB) | M: 7,5037H + 13,1523W − 4,3376A − 0,3486Z − 311,7751<br>F: 7,5432H + 9,9474W − 3,4382A − 0,309Z − 288,2821 | 1 casa |
| Idade metabólica (só A > 17) | M: −0,7471H + 0,9161W + 0,4184A + 0,0517Z + 54,2267<br>F: −1,1165H + 1,5784W + 0,4615A + 0,0415Z + 83,2548 | inteiro; no máximo 10 anos acima ou abaixo de A; 18–80 |
| Proteína % (só A > 17) | massa muscular % − água % | — |
| Peso padrão | M: (H − 80) × 0,7; F: (H − 70) × 0,6 | — |
| Obesidade % | (W − peso padrão) / peso padrão × 100 | — |

Verificação contra a tela do app OKOK (print não publicado; H 171, W 69,95, A 23, Z 600, perfil com S = 1):

| Métrica | Fórmula Java | OKOK |
|---|---|---|
| IMC | 23,92 | 23,9 ✓ |
| Gordura | 21,26% / 14,87 kg | 21,3 / 14,9 ✓ |
| Água | 54,63% | 54,6 ✓ |
| Massa muscular | 52,15 kg / 74,55% | 52,1 / 74,5 ≈ |
| Músculo esquelético | 27,84 kg / 39,8% | 27,8 / 39,8 ✓ |
| Gordura visceral | 8 | 8,0 ✓ |
| Proteína | 19,92% | 19,9 ✓ |
| Obesidade | 9,81% | 9,8 ✓ |
| LBM | 55,08 | 55,08 ✓ |
| Idade metabólica | 31 | 31 ✓ |
| Ossos | 2,93 | 2,89 ✗ (provavelmente veio da biblioteca nativa) |
| Metabolismo | 1582,4 | 1582 ≈ (a biblioteca nativa devolve um inteiro) |

**Decisão tomada:** o app mostra essas estimativas, as mesmas do OKOK, sempre com o aviso "estimativa" (`devices/scale/bodyComposition.js`).

---

## Módulo 2: Smartwatch (Microwear / MActivePro)

| Campo | Valor |
|---|---|
| Fabricante | Microwear (OEM chinês) |
| App oficial | MActivePro (`com.njj.mactivepro`) |
| MAC | `11:22:33:44:55:66` |
| Firmware | `NJ-F2H-2.1.5` |
| Interface (UI) | `U5C_1.2` |

- **O Gadgetbridge não suporta este relógio.** Não existe referência pronta: o protocolo precisa ser descoberto por engenharia reversa a partir das capturas.
- O relógio usa conexão GATT, ao contrário da balança. Com Web Bluetooth, todo service UUID usado precisa estar em `optionalServices` no `requestDevice`, então a captura tem de revelar os UUIDs primeiro.
- **O relógio aceita uma conexão BLE por vez.** Feche ou desligue o MActivePro (e o Bluetooth do celular) antes de testar o app.
- **Receber:** FC, passos, sono, SpO2, bateria. **Enviar:** hora, notificações, alarmes.
- **Atalho só de leitura:** o MActivePro grava passos e FC no Apple Health. Não há API do Apple Health no Windows; o único caminho é a exportação manual (app Saúde → Exportar Todos os Dados → `export.xml`).

### Captura e análise

1. No Android, ative "Log de rastreamento HCI Bluetooth" nas opções de desenvolvedor e desligue e religue o Bluetooth.
2. Use o MActivePro fazendo **uma ação isolada por vez** e anote o horário de cada uma: sincronizar, medir FC, receber notificação, acertar hora.
3. Extraia o `btsnoop_hci.log` com `adb bugreport` e abra no Wireshark com o filtro `btatt`.
4. Associe cada ação anotada às escritas (Write Request/Command) e às notificações (Handle Value Notification) daquele horário. Registre, para cada comando, o UUID da characteristic, os bytes e a resposta.
5. Os pares comando/resposta capturados viram fixtures dos testes dos encoders/decoders.

O log HCI já mostra o ATT sem a criptografia do link BLE.

**O APK não pode ser lido.** O MActivePro 2.0.2 (`apk/mactivepro.apk`) é protegido pelo **360 Jiagu** (`assets/libjiagu.so`): o `classes.dex` só tem o carregador do protetor (`com.tianyu.util`), e o código real é descriptografado na memória, em tempo de execução. Descompilar sem um celular com root não é possível, então o protocolo sai do log HCI. O manifesto mostra o serviço BLE do app (`com.njj.mactivepro.libble.service.BLEService`) e um `CallScreeningService` usado nas notificações de chamada.

### Serviços GATT (Bluetooth LE Explorer no Windows, 2026-10-16)

- **Aparelho:** nome `WATCH X PRO`, MAC `11:22:33:44:55:66`, BT 4.2 Secure Connection.
- **Não há serviços padrão de bateria (`0x180F`) nem de FC (`0x180D`).** Todos os dados passam por serviços proprietários.
- **Não pareie o relógio com o Windows:** isso pode desfazer o pareamento com o celular.

| Serviço | Característica (handle) | Palpite |
|---|---|---|
| `00001800-…` (Generic Access) | `0x2A00` DeviceName (2) = "WATCH X PRO" | padrão |
| `00001801-…` (Generic Attribute) | `0x2A05` ServiceChanged (5) | padrão |
| `cc353442-be58-4ea2-876e-11d8d6976366` | `c551c36a-0377-4a29-9657-74ffb655a188` (81) | desconhecido; talvez atualização de firmware |
| `000001ff-3c17-d293-8e48-14fe2e4da212` | `…FF02…` (97), `…FF03…` (99) | canal proprietário do fabricante |
| `0000ae00-0000-1000-8000-00805f9b34fb` | `0xAE01` (129), `0xAE02` (131) | canal de dados típico dos chips JieLi (AE01 = escrita, AE02 = notificação); é o candidato mais provável para os comandos |

### Protocolo (log HCI de 16/10/2026, lido com `tools/btsnoop.mjs`)

**Canal:**
- O app **escreve** (Write Without Response) no handle `0x0062`, a característica `FF02`, e **recebe notificações** no handle `0x0064`, a característica `FF03`. As duas são do serviço `000001ff-3c17-d293-8e48-14fe2e4da212`.
- As notificações são ligadas gravando `01 00` no CCCD `0x0065`.
- O canal `AE01`/`AE02` não foi usado.
- MTU: o relógio pede 247.
- **UUID provável (dedução):** `FF02` = `0000ff02-0000-1000-8000-00805f9b34fb` e `FF03` = `0000ff03-0000-1000-8000-00805f9b34fb`.
  - O Bluetooth LE Explorer mostra o nome em decimal ("65282", "65283") só para UUIDs da base padrão do Bluetooth, como o `AE00` ("44544" = `0000ae00-…-00805f9b34fb`). UUIDs proprietários aparecem por extenso (`c551c36a-…`).
  - Para não depender disso, o app localiza as características listando as do serviço `000001ff-3c17-…` e pegando as que começam com `0000ff02`/`0000ff03`.
- O relógio também procura o serviço ANCS da Apple no celular (Find By Type Value com o UUID `7905F431-…`). É assim que ele recebe notificações de iPhone. No Android o celular responde com erro, e o MActivePro envia as notificações pelo comando `0B`.

**Quadro:** `BC <cmd> <tipo> <tam> <dados…> <checksum>`
- **Tipo:** `01` = consulta, `02` = configuração, `03` = resposta ou evento do relógio.
- **`tam`:** número de bytes de dados (1 byte).
- **Checksum:** soma dos dados `& 0xFF`. Ex.: `"NJ-F2H-2.1.5"` soma `0x2A6`, e o checksum é `A6`.
- **Consulta sem parâmetro:** `BC <cmd> 01 01 00 00`.
- **Outro quadro visto:** `AA 21 00 00 F0 F0 F0 F0`, enviado pelo app a cada ~1 min, com função desconhecida.

**Referência pública:** o SDK BLE da NJJ, [SoarY/NJJBle](https://github.com/SoarY/NJJBle) (pacote `com.njj.njjsdk`), usa estes mesmos UUIDs e o quadro `BC`.
- Os nomes da coluna "SDK" vêm de `CmdConst.kt`, onde os números estão em decimal.
- Tipos de controle no SDK: `01` READ, `02` WRITE, `03` SYNC (relógio → app), `04` RESPONSE.
- Outro projeto, [bl4cks1d3/wy-glass](https://github.com/bl4cks1d3/wy-glass), é um par de óculos Microwear que usa o mesmo app e os mesmos serviços. Lá o `AE00`/`AE01`/`AE02` é o canal de atualização de firmware da JieLi (RCSP).
- O Gadgetbridge não suporta o relógio. O `Ak102` (FitCloudPro) usa o mesmo `FF02`/`FF03`, mas com quadro `0xAB` e CRC-16, ou seja, outro protocolo.

**Comandos** (✓ = conferido nos logs HCI; "SDK" = só consta no SDK, ainda não verificado):

| cmd | SDK | Uso | Dados (a partir do byte 4 do quadro) | Evidência |
|---|---|---|---|---|
| `3C` | PRODUCT_ID (60) | modelo | ASCII | ✓ `"F2H"` |
| `3E` | FIRMWARE_VER (62) | firmware | ASCII | ✓ `"NJ-F2H-2.1.5"` |
| `41` | USER_INFO (65) | **perfil do usuário** (config) | `[sexo][altura cm][peso kg][idade][dia][mês][ano u16 LE][tom de pele]` | ✓ 2º log, às 18:48: altura 172 → 171, peso 67 → 70, tom 00 → 03 (marrom); sexo `01` (provável masculino) |
| `42`, `44`, `45` | — | unidades (config) | `[00 = métrico / 01 = imperial]` (provável) | ✓ foram para `01` às 18:49:56 e voltaram para `00` às 18:50:01 |
| `43` | DATE_TIME (67) | **acertar a hora** (config) | u32 LE = segundos desde 1970 em **hora local** | ✓ `21 69 D2 6A` = 16/10/2026 18:12:49 |
| `48` | BAT (72) | **bateria** (evento a cada ~10 s) | `[%][mV u16 LE][u16 ?]` | ✓ 88 % / 4000 mV → 86 % / 3980 mV |
| `49` | — | **meta de passos** (config) | u32 LE | ✓ `28 23 00 00` = 9000 às 18:50:18 |
| `4A` | HOUR_STEP (74) | **passos por hora** do dia | 24 × `[passos u16 LE][kcal÷10 u16 LE]` | SDK; tudo 0 no log (eram 0 passos) |
| `4B` | HISTORY_SPORT_DATA (75) | resumo de 7 dias | `[timestamp u32][passos u32][distância÷10 u32][kcal÷10 u32][duração÷10 u32][24 × passos/h][24 × kcal/h]` | SDK |
| `4E` | — | perfil e ajustes (resposta de 200 bytes) | `[hora u32]` + os campos do `41` + ajustes | ✓ |
| `4F` | SLEEP_DATA (79) | **sono** | consulta `BC 4F 01 01 d d`; o SDK chama `d` de `weekDay` sem documentar, e a versão sem parâmetro manda `00`. Resposta: byte 3 = `01` → sem dados; `[4..15]` três totais u32 (acordado, leve, profundo), comentados no SDK; `[16..19]` início e `[20..23]` fim (u32 LE, hora local); a partir do byte 24, pares `[fase][minutos]` (0 acordado, 1 leve, 2 profundo). O "acordado" antes de pegar no sono não conta, e a leitura para no fim | SDK (`NjjAnalysisData.parserSleepData`); nos logs, `00` ao conectar e `03` em cada sincronização, sempre "sem dados" |
| `50` | SPORT_RECORD (80) | **treinos feitos no relógio** | consulta `BC 50 01 01 00 00`, enviada logo depois de cada `4F` | ✓ pedido nos logs; resposta "sem dados" (formato a descobrir) |
| `51` | SPORT_DATA (81) | **passos ao vivo** (evento) | `[passos u32][distância? u32][kcal? u32][? u32]` | ✓ 11 → 16 passos às 18:47 |
| `5A` | ALARM (90) | **alarmes** | ler: `BC 5A 01 01 FF FF`. Gravar: `BC 5A 02 15 FF` + 4 × `[estado][tipo][dias][hora][min]`, com checksum somado a partir de `FF` | leitura ✓ (alarme 18:26); gravação: SDK |
| `5C`, `5D`, `5E` | HR, BP, BO (92–94) | FC, pressão e SpO2 em tempo real (evento) | `[valor]`; pressão `[máx][mín]` | SDK |
| `5F` | HR_DAY (95) | **histórico de FC** do dia | 48 × 30 min (00:00, 00:30…); 1 byte = bpm; 0 = sem medição | ✓ 18:30 = 68 bpm |
| `60` | BO_DAY (96) | **histórico de SpO2** do dia | 48 × 30 min; 1 byte = % | ✓ 95–98 % |
| `62` | ALL_DAY_FALG (98) | medição contínua (liga/desliga) | `[01][estado]` | ✓ `BC 62 02 02 01 01` às 18:30 |
| `67` | PHONE_SYSTEM_TYPE (103) | tipo de celular | `02` = Android | ✓ enviado na conexão |
| `69` | APP_REQUEST_SYNC (105) | **resumo do dia** | `[passos u32][kcal÷10 u32][distância÷10 u32][FC][SpO2][máx][mín][ECG]` | ✓ 71 bpm, 95 %, 113/75; ECG 80 → 70 depois do exame |
| `6B` | — | **histórico de pressão** do dia | 48 × `[máx][mín]` | ✓ 18:30 = 116/76 |
| `78` | — | FC ao vivo durante ECG (evento) | `[estado][bpm]`: 00 = medindo, 02 = fim | ✓ 78 → 70 bpm |
| `79` | DEVICE_FUN (121) | recursos suportados | flags (56 bytes) | ✓ |
| `0B` | ALERT_MSG (11) | **notificação** (config) | `[tipo][tam. título][tam. texto][título]["3A 20"][texto]`, em UTF-8, texto de até 120 bytes, um quadro por mensagem. O tamanho do título **não** conta o ": " (código do SDK, `size - 2`, e os logs: `3 + 12 + 2 + 69 = 86`; o comentário de exemplo do SDK está desatualizado). Tipos do SDK (`MessageTypeConst`): 1 chamada, 2 chamada perdida, 3 SMS, 4 e-mail, 5 agenda, 8 Skype, 9 WeChat, 10 WhatsApp, 11 Gmail, 14 LINE, 15 Twitter, 16 Facebook, 17 Messenger, 18 Instagram, 24 Telegram, 26 Snapchat, 27 LinkedIn, 28 WhatsApp Business, 30 Outlook… | ✓ tipo `08` para o X às 18:29 (no SDK, 8 = Skype): os números do firmware podem diferir do SDK; o app tem "Testar ícones" |
| `6F` | ANDROID_PHONE_CTRL (111) | atender/recusar chamada | app → relógio `BC 6F 02 01 <0 recusa / 1 atende>`; relógio → app pede para encerrar | SDK; não usado ainda |
| `65` | — | música | `02` = volume (9 de 15), `03` = artista, `04` = título | ✓ |
| `64` | — | câmera remota | config `02` abre / `00` fecha; evento `02` pronto / `01` disparo | ✓ 18:27–18:28 |
| `57`, `7B` | — | lembretes (água/sedentarismo) | `[ativo][?][início hh mm][fim hh mm]`; `[ativo][dias 0x7F]…` | ✓ |
| `66` | — | ajustes e metas (132 bytes) | contém a meta de passos | ✓ |
| `C8`, `C9` | OTA (200, 201) | envio de arquivo (mostrador) | `C9`: blocos `[nº do bloco u16 LE][dados]` | ✓ mostrador enviado às 18:47 (arquivo "BCSDIAL…") |
| `72` | — | progresso da instalação (evento) | contagem 30 → 0 | ✓ depois do envio do mostrador |
| `7E`, `1D` | — | ? | `02 01 xx` | perto das medições; falta confirmar |

**Sincronização feita pelo app:** consultas `60`, `6B`, `4F`, `50`, `4A`, `5F` e `69`, mais as configurações `53` e `52`. O `52` tem 112 bytes, provavelmente a previsão do tempo de 7 dias.

**O que ainda falta:**
- **Passos e sono:** conferir no nosso app. Os passos (`4A`, `51`) se comparam com a tela do relógio, e o sono (`4F`) se confere depois de uma noite.
  - A sincronização pede o sono com `00` e, sem dados, com `03`.
  - **Teste do sono e dos treinos** (página Relógio, `diagnoseSleep`): pede o `4F` com 00 a 06 e o `50`, guarda as respostas cruas e tem "Copiar resultado". Se alguma resposta trouxer uma noite, o sono é gravado.
  - Respostas grandes que chegam em várias notificações Bluetooth são juntadas antes da leitura (`isIncompleteFrame`/`concatBytes` em `watchSession`).
- **Peso para o relógio:** ✅ capturado. É o comando `41` (2º log, `btsnoop_hci_2.log`). O peso vai em **kg inteiro**, e o comando leva o perfil completo, então os outros campos precisam ser reenviados do jeito que estão.
- **Gravação de alarme:** só o formato do SDK; não verificado. Não é prioridade.
- **Treinos feitos no relógio:** a captura está pendente.
  - Faça dois treinos de tipos diferentes no relógio e anote o início, o fim e o que ele mostra (duração, passos, FC, kcal, distância).
  - Depois sincronize no MActivePro, com o log HCI ligado, e guarde o log como `capturas/relogio/bugreport3.zip`.
  - Com isso dá para achar o comando e o byte do tipo, e importar esses treinos para a aba Treino.

Os arquivos `bugreport.zip`, `btsnoop_hci.log` e `att.txt` em `capturas/relogio/` contêm o texto das notificações (mensagens pessoais). Por isso ficam fora do git.

import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {render} from "./main.js";

// Caminho fixo que os inimigos comuns percorrem até a torre (waypoints, em coordenadas de mundo)
export const caminhoInimigos = [
    { x: -1.7, y: 1.05 },
    { x: -1.05, y: 1.05 },
    { x: -1.05, y: 0.6 },
    { x: 0.75, y: 0.6 },
    { x: 0.75, y: -0.45 },
    { x: 0, y: -0.45 },
    { x: 0, y: 0 },
];

// Definição dos estados possíveis do jogo
export const states = {
    MENU: "MENU",
    JOGANDO: "JOGANDO",
    FIM: "FIM",           // perdeu (hp da torre chegou a 0)
    PAUSADO: "PAUSADO",   // tela de opções, jogo congelado
    FINALIZADO: "FINALIZADO", // jogador escolheu encerrar pela tela de opções
};

// Placeholder para o som ao atacar com o mouse
let audioContext;
function playClickSound() {
    audioContext ??= new AudioContext();
    audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    // Onda quadrada de som para teste
    // Será o efeito da espada de energia do Halo
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(90, now + 0.06);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
}

// --- Som ambiente de espaço: drone grave + ruído filtrado, tudo gerado por código ---
// (sem precisar de nenhum arquivo .mp3, funciona offline)
let ambiente = null;
const VOLUME_BASE = 0.14; // volume "máximo" (com o slider em 100%)
let volumeAtual = 1.0;    // 0.0 a 1.0, controlado pelo slider da tela de opções

// Chamada pelo slider da tela de Opções. Ajusta o volume em tempo real,
// mesmo com o som já tocando (não precisa parar e religar).
export function definirVolume(volume01) {
    volumeAtual = Math.max(0, Math.min(1, volume01));
    if (!ambiente) return;
    const now = audioContext.currentTime;
    ambiente.masterGain.gain.cancelScheduledValues(now);
    ambiente.masterGain.gain.setValueAtTime(ambiente.masterGain.gain.value, now);
    ambiente.masterGain.gain.linearRampToValueAtTime(VOLUME_BASE * volumeAtual, now + 0.08);
}

export function iniciarSomAmbiente() {
    audioContext ??= new AudioContext();
    audioContext.resume();

    if (ambiente) return; // já está tocando, não duplica

    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioContext.destination);
    masterGain.gain.linearRampToValueAtTime(VOLUME_BASE * volumeAtual, audioContext.currentTime + 2.5); // fade-in suave

    // Filtro grave por onde passam as duas ondas do drone
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 380;
    lowpass.connect(masterGain);

    // Duas ondas graves, levemente destonadas: cria um "batimento" lento e flutuante
    const osc1 = audioContext.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 55; // A1

    const osc2 = audioContext.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 55 * 1.5; // quinta acima
    osc2.detune.value = 6;

    osc1.connect(lowpass);
    osc2.connect(lowpass);

    // LFO bem lento modulando o corte do filtro: dá a sensação de "respirar"
    const lfo = audioContext.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);

    // Camada de ruído filtrado (estática/vento de fundo, tipo nave espacial)
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const dados = noiseBuffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.6;

    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.045;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    osc1.start();
    osc2.start();
    lfo.start();
    noiseSource.start();

    // --- motivo heroico original em "metais" sintetizados (não é trilha de nenhum filme) ---
    const brassGain = audioContext.createGain();
    brassGain.gain.value = 0.10;
    brassGain.connect(masterGain);

    function tocarNota(freq, inicioRelativo, duracao) {
        const osc = audioContext.createOscillator();
        osc.type = "sawtooth"; // dente-de-serra + filtro grave = aproxima um timbre de metal
        osc.frequency.value = freq;

        const filtro = audioContext.createBiquadFilter();
        filtro.type = "lowpass";
        filtro.frequency.value = 950;

        const env = audioContext.createGain();
        env.gain.value = 0;

        osc.connect(filtro);
        filtro.connect(env);
        env.connect(brassGain);

        const t0 = audioContext.currentTime + inicioRelativo;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(1, t0 + duracao * 0.25); // ataque suave, tipo sopro
        env.gain.linearRampToValueAtTime(0, t0 + duracao);

        osc.start(t0);
        osc.stop(t0 + duracao + 0.05);
    }

    function tocarPercussao(inicioRelativo) {
        const osc = audioContext.createOscillator();
        const env = audioContext.createGain();
        osc.connect(env);
        env.connect(masterGain);

        const t0 = audioContext.currentTime + inicioRelativo;
        osc.frequency.setValueAtTime(120, t0);
        osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.3); // "thump" grave, tipo tímpano
        env.gain.setValueAtTime(0.11, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);

        osc.start(t0);
        osc.stop(t0 + 0.4);
    }

    // Motivo próprio (4 notas ascendentes + resolução longa), repete a cada ~9s.
    // Frequências escolhidas à mão, não é transcrição de nenhuma trilha existente.
    let timeoutId;
    function agendarMotivo() {
        tocarNota(220.00, 0.0, 0.9);  // A3
        tocarNota(261.63, 1.0, 0.9);  // C4
        tocarNota(329.63, 2.0, 1.4);  // E4
        tocarNota(392.00, 3.6, 2.2);  // G4 — nota de resolução, mais longa

        tocarPercussao(0.0);
        tocarPercussao(1.0);
        tocarPercussao(2.0);

        timeoutId = setTimeout(agendarMotivo, 9000);
    }
    timeoutId = setTimeout(agendarMotivo, 1500); // pequena pausa antes do primeiro motivo

    ambiente = {
        masterGain, osc1, osc2, lfo, noiseSource,
        pararMotivo: () => clearTimeout(timeoutId),
    };
}

export function pararSomAmbiente() {
    if (!ambiente) return;
    const { masterGain, osc1, osc2, lfo, noiseSource, pararMotivo } = ambiente;
    const now = audioContext.currentTime;

    pararMotivo(); // cancela o próximo ciclo do motivo agendado

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.5); // fade-out, sem corte seco

    setTimeout(() => {
        osc1.stop();
        osc2.stop();
        lfo.stop();
        noiseSource.stop();
    }, 600);

    ambiente = null;
}

// Alterna entre tocando/mudo. Devolve true se ficou tocando, false se ficou mudo
// (útil pra quem chamar atualizar o ícone do botão).
export function alternarSomAmbiente() {
    if (ambiente) {
        pararSomAmbiente();
        return false;
    }
    iniciarSomAmbiente();
    return true;
}

// Define o estado inicial do jogo como MENU
// "texturas" vem pronto de fora: {melee: [frame0,frame1], ranged: [...], exploder: [...]}
export function createGameState(texturas = null){
    return {
        atual: states.MENU,
        texturas,

        // --- Controle de spawn com frequência variável ---
        spawnTimer: 0.0,
        spawnInterval: 1.0,          // intervalo sorteado para o PRÓXIMO inimigo
        spawnIntervalBase: 1.2,      // intervalo no começo da partida
        spawnIntervalMinimo: 0.25,   // piso: nunca fica mais rápido que isso
        meiaVidaSpawn: 30.0,         // a cada 30s o intervalo médio cai pela metade
        variacaoSpawn: 0.35,         // jitter de +/- 35% para não ficar metronômico
        tempoDecorrido: 0.0,         // tempo de partida, base da dificuldade

        // --- Pontuação ---
        score: 0,
        kills: 0,

        // --- Chefão (boss) ---
        bossScoreThreshold: 450, // pontuação que invoca o chefão (ajustável)
        bossInvocado: false,    // já foi invocado nessa partida? (só acontece uma vez)
        bossPendente: false,    // marcado no frame do abate; o spawn de verdade acontece no fim do update()

        onGameOver: null,
        onVictory: null,
        onUpdate: null,
        onScoreChange: null,
    };
}

// Calcula quanto tempo esperar até o próximo inimigo.
// Decaimento exponencial sobre o tempo de partida + um sorteio para dar irregularidade.
function sortearProximoSpawn(stateAtual) {
    const decaimento = Math.pow(0.5, stateAtual.tempoDecorrido / stateAtual.meiaVidaSpawn);
    const intervaloMedio = Math.max(
        stateAtual.spawnIntervalMinimo,
        stateAtual.spawnIntervalBase * decaimento,
    );

    // fator aleatório dentro de [1 - variacao, 1 + variacao]
    const fator = 1 + (Math.random() * 2 - 1) * stateAtual.variacaoSpawn;

    return Math.max(0.1, intervaloMedio * fator);
}

// Som grave e discreto quando um inimigo morre
function playDeathSound() {
    audioContext ??= new AudioContext();
    audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(35, now + 0.4); // cai rápido pro grave
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.45);
}

// Centraliza a contagem de pontos para não contar o mesmo inimigo duas vezes
// (dois projéteis podem acertar o mesmo alvo no mesmo frame)
function registrarAbate(entity, stateAtual) {
    if (entity.pontuacaoComputada) {
        return;
    }

    entity.pontuacaoComputada = true;
    entity.marcadoParaRemover = true;

    stateAtual.score += entity.pontos ?? 0;
    stateAtual.kills += 1;
    stateAtual.onScoreChange?.(stateAtual);
    playDeathSound();

    // Ao atingir a pontuação-alvo, invoca o chefão (só uma vez por partida).
    // O spawn de verdade acontece no fim do update() (ver "bossPendente" lá).
    if (stateAtual.score >= stateAtual.bossScoreThreshold && !stateAtual.bossInvocado) {
        stateAtual.bossInvocado = true;
        stateAtual.bossPendente = true;
    }

    // Derrotar o chefão é a condição de vitória
    if (entity.type === "enemyBoss" && stateAtual.atual !== states.FIM) {
        stateAtual.atual = states.FIM;
        stateAtual.onVictory?.(stateAtual);
    }
}

// Atualização do jogo para definir estados, HPs e posição das entidades
// Além do tratamento de spawn para pontos fora da tela
function update(dt, entities, stateAtual) {
    const torre = entities.find(e => e.type === "torre");
    const novasEntidades = []; // projéteis criados nesse frame entram aqui
    // Adicionar a nova entidade no proprio array sendo iterado deu problema

    // Tempo de partida: é o que faz a dificuldade subir
    stateAtual.tempoDecorrido += dt;

    // Timer para spawn de cada inimigo, com intervalo variável.
    // Depois que o boss é invocado, nenhum inimigo comum nasce mais.
    if (!stateAtual.bossInvocado) {
        stateAtual.spawnTimer -= dt;
        if (stateAtual.spawnTimer <= 0) {
            spawnAleatorio(entities, stateAtual);
            stateAtual.spawnInterval = sortearProximoSpawn(stateAtual);
            stateAtual.spawnTimer = stateAtual.spawnInterval;
        }
    }

    // Atualiza vida, alvo e upgrades da torre (se implementar)
    updateTorre(torre, entities, dt, novasEntidades, stateAtual);
    avancarAnimacao(torre, dt); // pulso do reator, independente de movimento

    // Atualiza checagem de distância para ataque à torre e hp atual
    for (const entity of entities) {
        switch (entity.type) {
            case "enemyMelee":
                updateMelee(entity, torre, dt);
                break;
            case "enemyRanged":
                updateRanged(entity, torre, dt, novasEntidades, stateAtual);
                break;
            case "enemyExploder":
                updateExploder(entity, torre, dt);
                break;
            case "enemyBoss":
                updateBoss(entity, torre, dt);
                break;
            case "projectile":
                updateProjectile(entity, dt, stateAtual);
                break;
        }

        // Não lembro se ele falou se podia usar a biblioteca pra manipular a matriz ou não - Conferir
        // Matriz de projeção da posição dos inimigos
        mat4.identity(entity.modelMatrix);
        mat4.translate(entity.modelMatrix, entity.modelMatrix, [entity.x, entity.y, 0]);
        // Gira a entidade se ela tiver um ângulo definido (ex: míssil apontando pra onde voa)
        if (entity.angulo) {
            mat4.rotateZ(entity.modelMatrix, entity.modelMatrix, entity.angulo);
        }
        // scaleX/scaleY permitem formas não-quadradas (ex: viseira, faixas de armadura)
        // caem para "scale" (uniforme) quando não especificados, mantendo entidades antigas iguais
        mat4.scale(entity.modelMatrix, entity.modelMatrix, [
            entity.scaleX ?? entity.scale ?? 1,
            entity.scaleY ?? entity.scale ?? 1,
            1,
        ]);
    }

    // Se o boss acabou de ser invocado, ele substitui tudo que estiver em campo
    // (inclusive projéteis criados nesse mesmo frame — por isso o "else")
    if (stateAtual.bossPendente) {
        stateAtual.bossPendente = false;
        spawnEnemyBoss(entities, stateAtual);
    } else {
        // adiciona projéteis criados nesse frame depois das atualizações e iterações pela lista
        entities.push(...novasEntidades);
    }

    // remove entidades marcadas (exploders que já explodiram, projéteis que já acertaram)
    // Não mudar para o for each por lidar com eliminação de itens (Vai dar problema)
    for (let i = entities.length - 1; i >= 0; i--) {
        if (entities[i].marcadoParaRemover) {
            entities.splice(i, 1);
        }
    }

    // Torre sem vida, então, o jogo acaba
    if (torre && torre.hp <= 0 && stateAtual.atual !== states.FIM) {
        stateAtual.atual = states.FIM;
        stateAtual.onGameOver?.();
    }

    stateAtual.onUpdate?.(torre);
}

export function createGameLoop(gl, renderState, entities, stateAtual) {
    let lastTime = 0;

    function gameLoop(timestamp) {
        // No primeiro frame lastTime é 0, o que geraria um dt enorme
        // e jogaria o tempo de partida (e a dificuldade) lá pra frente
        if (lastTime === 0) {
            lastTime = timestamp;
            requestAnimationFrame(gameLoop);
            return;
        }

        // Trava o dt: se a aba perde o foco, o timestamp dá um salto
        const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;

        switch(stateAtual.atual){
            case states.JOGANDO:
                update(dt, entities, stateAtual);
                render(gl, renderState, entities, stateAtual.bossInvocado ? null : caminhoInimigos);
                break;
            case states.MENU:
                // Limpa a tela e inicia o menu
                // menu()
                render(gl, renderState, []); // ou entities, se quiser mostrar a torre parada no menu
                break;
            case states.FIM:
                // Mostrar um menu de opções com a tela final ainda renderizada
                render(gl, renderState, entities, stateAtual.bossInvocado ? null : caminhoInimigos);
                break;
            case states.PAUSADO:
                // Congela a cena (não chama update), só continua desenhando o último estado
                render(gl, renderState, entities, stateAtual.bossInvocado ? null : caminhoInimigos);
                break;
            case states.FINALIZADO:
                // Jogador encerrou pela tela de opções: fundo espacial limpo, sem entidades
                render(gl, renderState, []);
                break;
        }

        requestAnimationFrame(gameLoop);
    }

    return gameLoop;
}

// Tratamento do clique para atacar inimigos
export function handleCanvasClick(canvas, event, entities, stateAtual) {
    if (event.button !== 0) {
        return;
    }

    // Somente se estiver com o jogo rodando
    // Como a tela final mantém renderizado, poderia causar conflito
    if (stateAtual.atual !== states.JOGANDO) {
        return;
    }

    // Som de ataque com o mouse
    // A ideia é colocar o som da energy sword do halo
    playClickSound();

    const tela = canvas.getBoundingClientRect();
    const worldHalfSize = 1.5;
    const clickX = ((event.clientX - tela.left) / tela.width) * worldHalfSize * 2 - worldHalfSize;
    const clickY = worldHalfSize - ((event.clientY - tela.top) / tela.height) * worldHalfSize * 2;

    const alvo = entities
        // Ataca somente inimigos que estejam vivos
        .filter(entity => entity.type.startsWith("enemy") && !entity.marcadoParaRemover)
        .map(entity => ({
            entity,
            distance: Math.hypot(entity.x - clickX, entity.y - clickY),
        }))
        .filter(candidate => candidate.distance <= candidate.entity.scale)
        .sort((first, second) => first.distance - second.distance)[0];

    if (!alvo) {
        return;
    }

    const torre = entities.find(entity => entity.type === "torre");
    alvo.entity.hp -= torre.clickDamage;

    // Checa se morreu
    if (alvo.entity.hp <= 0) {
        registrarAbate(alvo.entity, stateAtual);
    }
}

function updateTorre(torre, entities, dt, novasEntidades, stateAtual) {
    torre.attackCooldown -= dt;
    if (torre.attackCooldown > 0) {
        return;
    }

    const alvo = entities
        .filter(entity => entity.type.startsWith("enemy") && !entity.marcadoParaRemover)
        .map(entity => ({
            entity,
            distance: Math.hypot(entity.x - torre.x, entity.y - torre.y),
        }))
        .filter(candidate => candidate.distance <= torre.attackRange)
        .sort((first, second) => first.distance - second.distance)[0];

    if (!alvo) {
        return;
    }

    novasEntidades.push(criarProjetil(
        torre,
        alvo.entity,
        torre.projectileSpeed,
        torre.dano,
        [0.3, 1.0, 0.4, 1.0],
        stateAtual.texturas?.missile, // se não carregou, cai pro quadradinho verde de sempre
        [0.75, 1.0, 0.85, 1.0],       // tingimento verde-claro: é o míssil "do jogador"
    ));
    torre.attackCooldown = torre.attackInterval;
}

// Cria o chefão: some com tudo que estiver em campo (menos a torre, que é a
// entidade[0]) e nasce sozinho — é uma "arena limpa" pro confronto final.
function spawnEnemyBoss(entities, stateAtual) {
    entities.length = 1; // remove todos os inimigos/projéteis, mantém só a torre (índice 0)
    const spawnPosition = createSpawnPosition(0.3);

    entities.push({
        type: "enemyBoss",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 200,
        speed: 0.3,
        scale: 0.3,  // maior que qualquer inimigo comum (o maior deles é 0.15) — é pra impor respeito
        dano: 85,                  // dano do ataque corpo a corpo normal
        primeiroAtaque: 150,       // dano bônus do primeiro golpe, logo após o dash
        rangePrimeiroAtaque: 0.7,  // distância em que ele inicia o dash
        speedPrimeiroAtaque: 1.5,  // velocidade durante o dash (bem mais rápido)
        emDash: false,
        attackInterval: 1.0,
        attackCooldown: 0,
        color: [1.0, 0.2, 0.2, 1.0], // usado só se a textura falhar ao carregar
        texturaFrames: stateAtual.texturas?.boss,
        animFrame: 0,
        animTimer: 0,
        animInterval: 0.18,
        modelMatrix: mat4.create(),
    });
}

// IA do chefão: anda até certa distância, dá um "dash" (arranco) rápido pra
// cima da torre, e o primeiro golpe depois do dash causa dano bônus.
function updateBoss(entity, torre, dt) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const dashRange = torre.scale + entity.rangePrimeiroAtaque;
    const contactRange = torre.scale + entity.scale;

    if (!entity.emDash && dist > dashRange) {
        // Ainda longe: anda normal
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
        avancarAnimacao(entity, dt);
    } else if (dist > contactRange) {
        // Entrou no alcance do dash: mantém o arranco até encostar na torre
        entity.emDash = true;
        entity.x += (dx / dist) * entity.speedPrimeiroAtaque * dt;
        entity.y += (dy / dist) * entity.speedPrimeiroAtaque * dt;
        avancarAnimacao(entity, dt);
    } else {
        // Alcançou a torre: ataca corpo a corpo
        entity.attackCooldown -= dt;
        if (entity.attackCooldown <= 0) {
            // O golpe logo após o dash é o "primeiro ataque" (bônus de dano);
            // os seguintes, parado, usam o dano normal.
            torre.hp -= entity.emDash ? entity.primeiroAtaque : entity.dano;
            entity.attackCooldown = entity.attackInterval;
            entity.emDash = false;
        }
    }
}

// Manipulação da matriz de projeção para setar um ponto de spawn para cada novo inimigo
function createSpawnPosition(scale) {
    const worldHalfSize = 1.5; // Tamanho da projeção para spawnar do lado de fora da arena
    const limiteVisao = worldHalfSize + scale; // Ponto de spawn é tamanho do mundo + tamanho do inimigo
    const pontoDaBorda = Math.random() * (worldHalfSize * 2) - worldHalfSize; // Ponto de spawn naquela borda
    const borda = Math.floor(Math.random() * 3); // Borda escolhida para o spawn do inimigo
    
    switch (borda) {
        case 0:
            return {x: limiteVisao, y: pontoDaBorda};
            // Nasce na direita
            case 1:
                return {x: -limiteVisao, y: pontoDaBorda};
            // Nasce na esquerda
            default:
                return {x: pontoDaBorda, y: -limiteVisao};
            // Nasce em baixo
            }
            }
            
// Factory para cada tipo de inimigo
function spawnEnemyMelee(entities, stateAtual) {
    const spawnPosition = caminhoInimigos[0];

    entities.push({
        type: "enemyMelee",
        x: spawnPosition.x,
        y: spawnPosition.y,
        caminhoIndex: 0,
        hp: 20,
        pontos: 10,        // recompensa por abate
        speed: 0.6,
        scale: 0.1,
        dano: 20,
        attackInterval: 0.5,
        attackCooldown: 0,
        color: [1.0, 0.2, 0.2, 1.0],
        texturaFrames: stateAtual.texturas?.melee,
        animFrame: 0,
        animTimer: 0,
        animInterval: 0.12, // troca de perna a cada 0.12s (é rápido, "melee" é ágil)
        modelMatrix: mat4.create(),
    });
}

function spawnEnemyRanged(entities, stateAtual) {
    const spawnPosition = caminhoInimigos[0];

    entities.push({
        type: "enemyRanged",
        x: spawnPosition.x,
        y: spawnPosition.y,
        caminhoIndex: 0,
        hp: 15,
        pontos: 15,        // frágil, mas incomoda de longe
        speed: 0.25,
        scale: 0.15,
        dano: 8,               // dano do projétil, não do inimigo em si
        attackRange: 0.8,      // para bem mais longe da torre
        attackInterval: 1.5,
        attackCooldown: 0,
        projectileSpeed: 1.0,
        color: [0.9, 0.6, 0.1, 1.0],
        texturaFrames: stateAtual.texturas?.ranged,
        animFrame: 0,
        animTimer: 0,
        animInterval: 0.22,
        modelMatrix: mat4.create(),
    });
}

// Explode quando entra em contato com a torre
function spawnEnemyExploder(entities, stateAtual) {
    const spawnPosition = caminhoInimigos[0];

    entities.push({
        type: "enemyExploder",
        x: spawnPosition.x,
        y: spawnPosition.y,
        caminhoIndex: 0,
        hp: 60,
        pontos: 25,        // mais vida e dano alto, vale mais
        speed: 0.4,
        scale: 0.15,
        dano: 30,   // dano de explosão, aplicado uma única vez
        color: [0.6, 0.1, 0.8, 1.0],
        texturaFrames: stateAtual.texturas?.exploder,
        animFrame: 0,
        animTimer: 0,
        animInterval: 0.16,
        modelMatrix: mat4.create(),
    });
}

// Função auxiliar para posicionar os inimigos fora da tela no momento do spawn
function createModelMatrix(x, y, scale, angulo = 0) {
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, [x, y, 0]);
    if (angulo) mat4.rotateZ(modelMatrix, modelMatrix, angulo);
    mat4.scale(modelMatrix, modelMatrix, [scale, scale, 1]);
    return modelMatrix;
}

// Separando o comportamento de cada inimigo
function updateMelee(entity, torre, dt) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const attackRange = torre.scale + entity.scale;

    if (dist > attackRange) {
        seguirCaminho(entity, dt);
        avancarAnimacao(entity, dt);
    } else {
        entity.attackCooldown -= dt;
        if (entity.attackCooldown <= 0) {
            torre.hp -= entity.dano;
            entity.attackCooldown = entity.attackInterval;
        }
    }
}

function updateRanged(entity, torre, dt, novasEntidades, stateAtual) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);

    if (dist > entity.attackRange) {
        seguirCaminho(entity, dt);
        avancarAnimacao(entity, dt);
    } else {
        entity.attackCooldown -= dt;
        if (entity.attackCooldown <= 0) {
            novasEntidades.push(criarProjetil(
                entity,
                torre,
                entity.projectileSpeed,
                entity.dano,
                [1.0, 1.0, 0.3, 1.0],
                stateAtual.texturas?.missile,
                [1.0, 0.85, 0.35, 1.0], // tingimento amarelo: dá pra diferenciar do míssil da torre
            ));
            entity.attackCooldown = entity.attackInterval;
        }
    }
}

function criarProjetil(origin, target, speed, dano, color, texturaFrames = null, tint = [1.0, 1.0, 1.0, 1.0]) {
    const angulo = Math.atan2(target.y - origin.y, target.x - origin.x);
    const scale = texturaFrames ? 0.11 : 0.05; // míssil maior, pra dar pra ver o desenho direito

    return {
        type: "projectile",
        x: origin.x,
        y: origin.y,
        target,
        speed,
        dano,
        scale,
        color,
        tint,
        angulo,
        texturaFrames,     // null = continua sendo o quadradinho colorido de sempre
        animFrame: 0,
        animTimer: 0,
        animInterval: 0.08, // flicker rápido do propulsor
        modelMatrix: createModelMatrix(origin.x, origin.y, scale, angulo),
    };
}

function updateProjectile(entity, dt, stateAtual) {
    // Alvo já morreu antes do projétil chegar: descarta em vez de perseguir um fantasma
    if (entity.target.marcadoParaRemover) {
        entity.marcadoParaRemover = true;
        return;
    }

    const dx = entity.target.x - entity.x;
    const dy = entity.target.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const hitRange = entity.target.scale + entity.scale;

    if (dist > hitRange) {
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
        entity.angulo = Math.atan2(dy, dx); // aponta pra direção que está voando agora
        avancarAnimacao(entity, dt);        // flicker do propulsor (sem efeito se não tiver textura)
    } else {
        entity.target.hp -= entity.dano;
        entity.marcadoParaRemover = true;

        // A torre nunca é removida do array, senão ela some da tela de GAME OVER
        if (entity.target.hp <= 0 && entity.target.type !== "torre") {
            registrarAbate(entity.target, stateAtual);
        }
    }
}

function updateExploder(entity, torre, dt) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const explodeRange = torre.scale + entity.scale;

    if (dist > explodeRange) {
        seguirCaminho(entity, dt);
        avancarAnimacao(entity, dt);
    } else {
        torre.hp -= entity.dano;   // dano único
        entity.marcadoParaRemover = true;
    }
}

// Move a entidade rumo ao próximo ponto do caminho fixo; ao chegar perto o
// bastante, "encaixa" nele e avança pro próximo. Último ponto = fica parado lá
// (na prática nunca chega a esse ponto, porque o alcance de ataque intercepta antes).
function seguirCaminho(entity, dt) {
    if (entity.caminhoIndex >= caminhoInimigos.length - 1) return;

    const proximoPonto = caminhoInimigos[entity.caminhoIndex + 1];
    const dx = proximoPonto.x - entity.x;
    const dy = proximoPonto.y - entity.y;
    const distancia = Math.hypot(dx, dy);
    const passo = entity.speed * dt;

    if (distancia <= passo) {
        entity.x = proximoPonto.x;
        entity.y = proximoPonto.y;
        entity.caminhoIndex += 1;
        return;
    }

    entity.x += (dx / distancia) * passo;
    entity.y += (dy / distancia) * passo;
}

// Escolhe um tipo de inimigo aleatório
function spawnAleatorio(entities, stateAtual){
    const tipos = [spawnEnemyMelee, spawnEnemyRanged, spawnEnemyExploder];
    const escolhido = tipos[Math.floor(Math.random() * tipos.length)];
    
    // Chama a função sorteada guardada em escolhido
    escolhido(entities, stateAtual);
}

// Avança o ciclo de caminhada (troca frame 0 <-> 1) enquanto o inimigo se move.
// Só é chamada no ramo em que a entidade está de fato andando (não parada atacando).
function avancarAnimacao(entity, dt) {
    if (!entity.texturaFrames) return; // sem sprite carregado ainda, nada a fazer

    entity.animTimer += dt;
    if (entity.animTimer >= entity.animInterval) {
        entity.animTimer = 0;
        entity.animFrame = entity.animFrame === 0 ? 1 : 0;
    }
}
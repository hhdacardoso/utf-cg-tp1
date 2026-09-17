import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {render} from "./main.js";

// Definição dos estados possíveis do jogo
export const states = {
    MENU: "MENU",
    JOGANDO: "JOGANDO",
    FIM: "FIM",
    PAUSADO: "PAUSADO", // Se não implementar, deve remover
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

// Define o estado inicial do jogo como MENU
export function createGameState(){
    return {
        atual: states.MENU,
        spawnTimer: 0.0,
        spawnInterval: 1.0, // 1 segundo entre cada inimigo
        onGameOver: null,
        onUpdate: null,
    };
}

// Atualização do jogo para definir estados, HPs e posição das entidades
// Além do tratamento de spawn para pontos fora da tela
function update(dt, entities, stateAtual) {
    const torre = entities.find(e => e.type === "torre");
    console.log("HP atual: " + torre.hp);
    const novasEntidades = []; // projéteis criados nesse frame entram aqui
    // Adicionar a nova entidade no proprio array sendo iterado deu problema

    // Timer para spawn de cada inimigo
    stateAtual.spawnTimer -= dt;
    if (stateAtual.spawnTimer <= 0) {
        spawnAleatorio(entities);
        stateAtual.spawnTimer = stateAtual.spawnInterval;
    }

    // Atualiza vida, alvo e upgrades da torre (se implementar)
    updateTorre(torre, entities, dt, novasEntidades);

    // Atualiza checagem de distância para ataque à torre e hp atual
    for (const entity of entities) {
        switch (entity.type) {
            case "enemyMelee":
                updateMelee(entity, torre, dt);
                break;
            case "enemyRanged":
                updateRanged(entity, torre, dt, novasEntidades);
                break;
            case "enemyExploder":
                updateExploder(entity, torre, dt);
                break;
            case "projectile":
                updateProjectile(entity, dt);
                break;
        }

        // Não lembro se ele falou se podia usar a biblioteca pra manipular a matriz ou não - Conferir
        // Matriz de projeção da posição dos inimigos
        mat4.identity(entity.modelMatrix);
        mat4.translate(entity.modelMatrix, entity.modelMatrix, [entity.x, entity.y, 0]);
        mat4.scale(entity.modelMatrix, entity.modelMatrix, [entity.scale ?? 1, entity.scale ?? 1, 1]);
    }

    // adiciona projéteis criados nesse frame depois das atualizações e iterações pela lista
    entities.push(...novasEntidades);

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
        const dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        switch(stateAtual.atual){
            case states.JOGANDO:
                update(dt, entities, stateAtual);
                render(gl, renderState, entities);
                break;
            case states.MENU:
                // Limpa a tela e inicia o menu
                // menu()
                render(gl, renderState, []); // ou entities, se quiser mostrar a torre parada no menu
                break;
            case states.FIM:
                // Mostrar um menu de opções com a tela final ainda renderizada
                render(gl, renderState, entities);
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
        alvo.entity.marcadoParaRemover = true;
    }
}

function updateTorre(torre, entities, dt, novasEntidades) {
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
    ));
    torre.attackCooldown = torre.attackInterval;
}

// Manipulação da matriz de projeção para setar um ponto de spawn para cada novo inimigo
function createSpawnPosition(scale) {
    const worldHalfSize = 1.5; // Tamanho da projeção para spawnar do lado de fora da arena
    const limiteVisao = worldHalfSize + scale; // Ponto de spawn é tamanho do mundo + tamanho do inimigo
    const pontoDaBorda = Math.random() * (worldHalfSize * 2) - worldHalfSize; // Ponto de spawn naquela borda
    const borda = Math.floor(Math.random() * 4); // Borda escolhida para o spawn do inimigo
    
    switch (borda) {
        case 0:
            return {x: limiteVisao, y: pontoDaBorda};
            // Nasce na direita
            case 1:
                return {x: -limiteVisao, y: pontoDaBorda};
            // Nasce na esquerda
            case 2:
                return {x: pontoDaBorda, y: limiteVisao};
                // Nasce em cima
                default:
                    return {x: pontoDaBorda, y: -limiteVisao};
                    // Nasce em baixo
                }
            }
            
// Factory para cada tipo de inimigo
function spawnEnemyMelee(entities) {
    const spawnPosition = createSpawnPosition(0.15);

    entities.push({
        type: "enemyMelee",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 20,
        speed: 0.6,
        scale: 0.1,
        dano: 20,
        attackInterval: 0.5,
        attackCooldown: 0,
        color: [1.0, 0.2, 0.2, 1.0],
        modelMatrix: mat4.create(),
    });
}

function spawnEnemyRanged(entities) {
    const spawnPosition = createSpawnPosition(0.15);

    entities.push({
        type: "enemyRanged",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 15,
        speed: 0.25,
        scale: 0.15,
        dano: 8,               // dano do projétil, não do inimigo em si
        attackRange: 0.8,      // para bem mais longe da torre
        attackInterval: 1.5,
        attackCooldown: 0,
        projectileSpeed: 1.0,
        color: [0.9, 0.6, 0.1, 1.0],
        modelMatrix: mat4.create(),
    });
}

// Explode quando entra em contato com a torre
function spawnEnemyExploder(entities) {
    const spawnPosition = createSpawnPosition(0.15);

    entities.push({
        type: "enemyExploder",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 60,
        speed: 0.4,
        scale: 0.15,
        dano: 30,   // dano de explosão, aplicado uma única vez
        color: [0.6, 0.1, 0.8, 1.0],
        modelMatrix: mat4.create(),
    });
}

// Função auxiliar para posicionar os inimigos fora da tela no momento do spawn
function createModelMatrix(x, y, scale) {
    const modelMatrix = mat4.create();
    mat4.translate(modelMatrix, modelMatrix, [x, y, 0]);
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
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
    } else {
        entity.attackCooldown -= dt;
        if (entity.attackCooldown <= 0) {
            torre.hp -= entity.dano;
            entity.attackCooldown = entity.attackInterval;
        }
    }
}

function updateRanged(entity, torre, dt, novasEntidades) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);

    if (dist > entity.attackRange) {
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
    } else {
        entity.attackCooldown -= dt;
        if (entity.attackCooldown <= 0) {
            novasEntidades.push(criarProjetil(
                entity,
                torre,
                entity.projectileSpeed,
                entity.dano,
                [1.0, 1.0, 0.3, 1.0],
            ));
            entity.attackCooldown = entity.attackInterval;
        }
    }
}

function criarProjetil(origin, target, speed, dano, color) {
    return {
        type: "projectile",
        x: origin.x,
        y: origin.y,
        target,
        speed,
        dano,
        scale: 0.05,
        color,
        modelMatrix: createModelMatrix(origin.x, origin.y, 0.05),
    };
}

function updateProjectile(entity, dt) {
    const dx = entity.target.x - entity.x;
    const dy = entity.target.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const hitRange = entity.target.scale + entity.scale;

    if (dist > hitRange) {
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
    } else {
        entity.target.hp -= entity.dano;
        entity.marcadoParaRemover = true;
        if (entity.target.hp <= 0) {
            entity.target.marcadoParaRemover = true;
        }
    }
}

function updateExploder(entity, torre, dt) {
    const dx = torre.x - entity.x;
    const dy = torre.y - entity.y;
    const dist = Math.hypot(dx, dy);
    const explodeRange = torre.scale + entity.scale;

    if (dist > explodeRange) {
        entity.x += (dx / dist) * entity.speed * dt;
        entity.y += (dy / dist) * entity.speed * dt;
    } else {
        torre.hp -= entity.dano;   // dano único
        entity.marcadoParaRemover = true;
    }
}

// Escolhe um tipo de inimigo aleatório
function spawnAleatorio(entities){
    const tipos = [spawnEnemyMelee, spawnEnemyRanged, spawnEnemyExploder];
    const escolhido = tipos[Math.floor(Math.random() * tipos.length)];
    
    // Chama a função sorteada guardada em escolhido
    escolhido(entities);
}
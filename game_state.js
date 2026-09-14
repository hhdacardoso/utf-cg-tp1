import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {render} from "./main.js";

// Definição dos estados possíveis do jogo
export const states = {
    MENU: "MENU",
    JOGANDO: "JOGANDO",
    FIM: "FIM"
};

export function createGameState(){
    return {
        atual: states.MENU,
        spawnTimer: 0.0,
        spawnInterval: 4.0, // 10 segundos entre cada inimigo
    };
}

function update(dt, entities, stateAtual) {
    const torre = entities.find(e => e.type === "torre");
    console.log("HP atual: " + torre.hp);
    const novasEntidades = []; // projéteis criados nesse frame entram aqui
    // Adicionar no proprio array sendo iterado deu problema

    // Timer para spawn de cada inimigo
    stateAtual.spawnTimer -= dt;
    if (stateAtual.spawnTimer <= 0) {
        spawnAleatorio(entities);
        stateAtual.spawnTimer = stateAtual.spawnInterval;
    }

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

        mat4.identity(entity.modelMatrix);
        mat4.translate(entity.modelMatrix, entity.modelMatrix, [entity.x, entity.y, 0]);
        mat4.scale(entity.modelMatrix, entity.modelMatrix, [entity.scale ?? 1, entity.scale ?? 1, 1]);
    }

    // adiciona projéteis criados nesse frame
    entities.push(...novasEntidades);

    // remove entidades marcadas (exploders que já explodiram, projéteis que já acertaram)
    for (let i = entities.length - 1; i >= 0; i--) {
        if (entities[i].marcadoParaRemover) {
            entities.splice(i, 1);
        }
    }

    if (torre && torre.hp <= 0) {
        stateAtual.atual = states.FIM;
    }
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

// Factory para cada tipo de inimigo
function createSpawnPosition(scale) {
    const worldHalfSize = 1.5; // Tamanho da projeção para spawnar do lado de fora da arena
    const limiteVisao = worldHalfSize + scale; // Ponto de spawn é tamanho do mundo + tamanho do inimigo
    const pontoDaBorda = Math.random() * (worldHalfSize * 2) - worldHalfSize; // Ponto de spawn naquela borda
    const borda = Math.floor(Math.random() * 4); // Borda escolhida para o spawn do inimigo

    switch (borda) {
        case 0:
            return {x: limiteVisao, y: pontoDaBorda};
            //
        case 1:
            return {x: -limiteVisao, y: pontoDaBorda};
        case 2:
            return {x: pontoDaBorda, y: limiteVisao};
        default:
            return {x: pontoDaBorda, y: -limiteVisao};
    }
}

function spawnEnemyMelee(entities) {
    const spawnPosition = createSpawnPosition(0.15);

    entities.push({
        type: "enemyMelee",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 20,
        speed: 0.3,
        scale: 0.15,
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

function spawnEnemyExploder(entities) {
    const spawnPosition = createSpawnPosition(0.15);

    entities.push({
        type: "enemyExploder",
        x: spawnPosition.x,
        y: spawnPosition.y,
        hp: 10,
        speed: 0.4,
        scale: 0.15,
        dano: 30,   // dano de explosão, aplicado uma única vez
        color: [0.6, 0.1, 0.8, 1.0],
        modelMatrix: mat4.create(),
    });
}

// Projetil disparado pelo inimigo ranged
function spawnProjectile(entities, origin, target, dano, speed) {
    entities.push({
        type: "projectile",
        x: origin.x,
        y: origin.y,
        target,       // caso a torre não esteja mais no centro, ainda funciona
        speed,
        dano,
        scale: 0.05,
        color: [1.0, 1.0, 0.3, 1.0],
        modelMatrix: createModelMatrix(origin.x, origin.y, 0.05),
    });
}

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
            novasEntidades.push(criarProjectile(entity, torre));
            entity.attackCooldown = entity.attackInterval;
        }
    }
}

function criarProjectile(entity, torre) {
    return {
        type: "projectile",
        x: entity.x,
        y: entity.y,
        target: torre,
        speed: entity.projectileSpeed,
        dano: entity.dano,
        scale: 0.05,
        color: [1.0, 1.0, 0.3, 1.0],
        modelMatrix: createModelMatrix(entity.x, entity.y, 0.05),
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

function spawnAleatorio(entities){
    const tipos = [spawnEnemyMelee, spawnEnemyRanged, spawnEnemyExploder];
    const escolhido = tipos[Math.floor(Math.random() * tipos.length)];
    escolhido(entities);
}
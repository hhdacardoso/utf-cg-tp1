import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {render} from "./main.js";

function update(dt, entities) {
    for (const entity of entities) {
        if (entity.type.startsWith("enemy")) {
            // mover em direção ao centro (0,0), onde a torre está
            const dx = 0 - entity.x;
            const dy = 0 - entity.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.01) {
                entity.x += (dx / dist) * entity.speed * dt;
                entity.y += (dy / dist) * entity.speed * dt;
            }
        }
        // recalcula a matriz de modelo com a posição atualizada
        mat4.identity(entity.modelMatrix);
        mat4.translate(entity.modelMatrix, entity.modelMatrix, [entity.x, entity.y, 0]);
    }
}

export function createGameLoop(gl, program, entities) {
    let lastTime = 0;

    function gameLoop(timestamp) {
        const dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        update(dt, entities);
        render(gl, program, entities);

        requestAnimationFrame(gameLoop);
    }

    return gameLoop;
}
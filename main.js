import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";

const worldHalfSize = 1.5; // Tamanho real da matriz de projeção
const projectionMatrix = createOrthogonalMatrix(-worldHalfSize, worldHalfSize, -worldHalfSize, worldHalfSize, -1, 1);

const square = new Float32Array
([-1.0, 1.0,
    -1.0, -1.0,
    1.0, -1.0,
    
    -1.0, 1.0,
    1.0, -1.0,
    1.0, 1.0,
]);
const checkpointModelMatrix = mat4.create();

export function setupWebGL(){
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl2");
    
    if (!gl){
        console.error("WebGL não suportado");
        throw new Error('WebGL2 não suportado');
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.0, 0.0, 0.0, 0.0); // transparente: o fundo espacial (CSS) aparece por trás
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    return {gl, canvas};
}

export function resizeCanvas(gl, canvas) {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
}

export function initialize(gl){
    // Códigos dos shaders do HTML
    const vertexShaderCode = document.querySelector('[type="shader/vertex"]').textContent.trim();
    const fragmentShaderCode = document.querySelector('[type="shader/fragment"]').textContent.trim();
    
    const program = createProgram(gl,
          createShader(gl, gl.VERTEX_SHADER, vertexShaderCode),
          createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderCode)
        );

    gl.linkProgram(program);
    gl.useProgram(program);

    const vao = createVao(gl);
    const vbo = createVbo(gl, square, gl.STATIC_DRAW);

    const vertexPositionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(vertexPositionLocation);
    gl.vertexAttribPointer(vertexPositionLocation, 2, gl.FLOAT, false, 0, 0);

    const pathVao = createVao(gl);
    const pathVbo = createVbo(gl, new Float32Array(0), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(vertexPositionLocation);
    gl.vertexAttribPointer(vertexPositionLocation, 2, gl.FLOAT, false, 0, 0);

    return {program,
        squareVao: vao,
        pathVao,
        pathVbo,
        colorLocation: gl.getUniformLocation(program, "u_color"),
        modelLocation: gl.getUniformLocation(program, "u_model"),
        projectionLocation: gl.getUniformLocation(program, "u_projection"),
        textureLocation: gl.getUniformLocation(program, "u_texture"),
        useTextureLocation: gl.getUniformLocation(program, "u_useTexture"),
    };
}

// Carrega uma imagem e sobe pra GPU como textura. É assíncrono (a imagem
// carrega em paralelo), por isso devolve uma Promise: quem chamar precisa
// dar "await" antes de usar a textura.
export function carregarTextura(gl, url) {
    return new Promise((resolve, reject) => {
        const imagem = new Image();
        imagem.onload = () => {
            const textura = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, textura);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);

            // MIN precisa de mipmap (ela encolhe na tela); MAG fica só linear.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.generateMipmap(gl.TEXTURE_2D);

            resolve(textura);
        };
        imagem.onerror = () => reject(new Error(`Não consegui carregar a textura: ${url}`));
        imagem.src = url;
    });
}

function createProgram(gl, vertexShader, fragmentShader){
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Erro ao linkar programa:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program
}

function createShader(gl, type, source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Erro ao compilar shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function createVbo(gl, data, type){
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, type);

    return vbo;
}

function createVao(gl){
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    return vao;
}

function createOrthogonalMatrix(left, right, bottom, top, near, far) {
    const out = mat4.create(); // matriz identidade 4x4
    mat4.ortho(out, left, right, bottom, top, near, far);
    return out;
}

// Conferir se a função está funcionando corretamente com export
export function render(gl, state, entities, checkpoints = null){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.bindVertexArray(state.squareVao);
    gl.uniformMatrix4fv(state.projectionLocation, false, projectionMatrix);

    if (checkpoints?.length > 1) {
        const pathVertices = new Float32Array(checkpoints.flatMap(({ x, y }) => [x, y]));
        gl.bindVertexArray(state.pathVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.pathVbo);
        gl.bufferData(gl.ARRAY_BUFFER, pathVertices, gl.DYNAMIC_DRAW);
        gl.uniformMatrix4fv(state.modelLocation, false, mat4.create());
        gl.uniform1i(state.useTextureLocation, 0);
        gl.uniform4fv(state.colorLocation, [0.2, 0.95, 0.9, 0.75]);
        gl.drawArrays(gl.LINE_STRIP, 0, checkpoints.length);

        gl.bindVertexArray(state.squareVao);
        gl.uniform4fv(state.colorLocation, [1.0, 0.75, 0.3, 1.0]);
        for (const { x, y } of checkpoints) {
            mat4.identity(checkpointModelMatrix);
            mat4.translate(checkpointModelMatrix, checkpointModelMatrix, [x, y, 0]);
            mat4.scale(checkpointModelMatrix, checkpointModelMatrix, [0.035, 0.035, 1]);
            gl.uniformMatrix4fv(state.modelLocation, false, checkpointModelMatrix);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }

    for (const entity of entities){
        gl.uniformMatrix4fv(state.modelLocation, false, entity.modelMatrix);

        if (entity.texturaFrames) {
            // Entidade com sprite: desenha a textura do frame atual da animação.
            // u_color vira só um "tingimento" (branco = mostra a textura sem alterar cor).
            const frame = entity.texturaFrames[entity.animFrame ?? 0];
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, frame);
            gl.uniform1i(state.textureLocation, 0);
            gl.uniform1i(state.useTextureLocation, 1);
            gl.uniform4fv(state.colorLocation, entity.tint ?? [1.0, 1.0, 1.0, 1.0]);
        } else {
            // Caminho original: quadrado com cor sólida (torre, decor, projéteis)
            gl.uniform1i(state.useTextureLocation, 0);
            gl.uniform4fv(state.colorLocation, entity.color);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}
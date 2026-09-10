import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";

const worldHalfSize = 1.5;
const projectionMatrix = createOrthogonalMatrix(-worldHalfSize, worldHalfSize, -worldHalfSize, worldHalfSize, -1, 1);

const square = new Float32Array
([-1.0, 1.0,
    -1.0, -1.0,
    1.0, -1.0,
    
    -1.0, 1.0,
    1.0, -1.0,
    1.0, 1.0,
]);

export function setupWebGL(){
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl2");
    
    if (!gl){
        console.error("WebGL não suportado");
        throw new Error('WebGL2 não suportado');
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
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

    return {program,
        squareVao: vao,
        colorLocation: gl.getUniformLocation(program, "u_color"),
        modelLocation: gl.getUniformLocation(program, "u_model"),
        projectionLocation: gl.getUniformLocation(program, "u_projection")
    };
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

function drawSquare(gl, data, vertexPoisiton, colorPosition, color){
    // Configura cor do quadrado
    gl.uniform4fv(colorPosition, color);
    // const vao = createVao(gl);

    // const vbo = createVbo(gl, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(vertexPoisiton);
    gl.vertexAttribPointer(vertexPoisiton, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Conferir se a função está funcionando corretamente com export
export function render(gl, state, entities){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.bindVertexArray(state.squareVao);

    for (const entity of entities){
        gl.uniformMatrix4fv(state.modelLocation, false, entity.modelMatrix);
        gl.uniform4fv(state.colorLocation, entity.color);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    
    const colorPositionLocation = gl.getUniformLocation(state.program, "u_color");
    const projLocation = gl.getUniformLocation(state.program, "u_projection");

    gl.uniformMatrix4fv(projLocation, false, projectionMatrix);
    
    const vertexPositionLocation = gl.getAttribLocation(state.program, "position");
    drawSquare(gl, square, vertexPositionLocation, colorPositionLocation, [1.0, 1.0, 1.0, 1.0]);
}
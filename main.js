export function setupWebGL(){
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl2");
    if (!gl){
        console.error("WebGL não suportado");
        throw new Error('WebGL2 não suportado');
    }
    return gl;
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

    return program
}

function createProgram(gl, vertexShader, fragmentShader){
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    return program
}

function createShader(gl, type, source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);

    return shader;
}

export function drawPoint(gl, program, vertices){
    // Criar e carregar dados dos vértices - Antes da atualização de posição
    // const vertices = new Float32Array([0.0, 0.0, 0.0,
    //                                    0.25, 0.25, 0.0]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Conectar atributo ao buffer
    const coordinatesLocation = gl.getAttribLocation(program, "coordinates");
    gl.enableVertexAttribArray(coordinatesLocation);
    gl.vertexAttribPointer(coordinatesLocation, 3, gl.FLOAT, false, 0, 0);

    const sizes = new Float32Array([15.0, 5.0]);
    const sizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

    const sizeLocation = gl.getAttribLocation(program, "pointSize");
    gl.enableVertexAttribArray(sizeLocation);
    gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);

    // Renderizar
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 2);
}
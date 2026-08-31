main();

function main(){
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl2");

    // Coleta de dados do HTML
    const vertexShaderCode = document.querySelector('[type="shader/vertex"]').textContent;
    const fragmentShaderCode = document.querySelector('[type="shader/fragment"]').textContent;

    // Compilação de shaders
    const program = createProgram(gl,
      createShader(gl, 'vs', gl.VERTEX_SHADER, vertexShaderCode),
      createShader(gl, 'fs', gl.FRAGMENT_SHADER, fragmentShaderCode)
    );
    gl.useProgram(program);

    if (!gl){
        console.error("WebGL não suportado");
        throw new Error('WebGL2 não suportado');
    }

    var vertices = new Float32Array
    [
        0.0, 0.0, 0.0,
        0.5, -0.5, 0.0,
        1.0, 1.0, 0.0
    ];

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);

    var vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    
    
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
}
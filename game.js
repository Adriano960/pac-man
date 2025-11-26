// --- CONFIGURAÇÕES ---
const COLS = 20;
const ROWS = 20;
let tileSize = 20; // Será calculado dinamicamente

const DIFFICULTY_SETTINGS = {
    easy:   { ghostSpeed: 15, pelletsCount: 150, livesBonus: 3 },
    medium: { ghostSpeed: 10, pelletsCount: 120, livesBonus: 2 },
    hard:   { ghostSpeed: 5,  pelletsCount: 100, livesBonus: 1 }
};

// Elementos do DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const levelDisplay = document.getElementById('level');
const menuDiv = document.getElementById('menu');
const gameContainerDiv = document.getElementById('gameContainer');
const gameOverModal = document.getElementById('gameOver');
const levelCompleteModal = document.getElementById('levelComplete');

// Variáveis de Controle
let game = null;
let isPaused = false;
let gameRunning = false;
let animationId = null;

// --- ÁUDIO ---
const sounds = {};
let soundsLoaded = false;
function loadSounds() {
    if (soundsLoaded) return;
    const base = './Pacmansounds/';
    const soundFiles = {
        start: 'pacman_beginning.wav',
        chomp: 'pacman_chomp.wav',
        death: 'pacman_death.wav',
        eatfruit: 'pacman_eatfruit.wav',
        eatghost: 'pacman_eatghost.wav',
        extrapac: 'pacman_extrapac.wav',
        intermission: 'pacman_intermission.wav',
        bgm: 'pacman_ringtone.mp3',
        interlude: 'pacman_ringtone_interlude.mp3',
        power: 'pacman_eatfruit.wav'
    };

    Object.keys(soundFiles).forEach(key => {
        try {
            const a = new Audio(base + soundFiles[key]);
            a.preload = 'auto';
            // Marca bgm como loop
            if (key === 'bgm') a.loop = true;
            sounds[key] = a;
        } catch (e) {
            console.warn('Erro ao carregar som', key, e);
        }
    });

    soundsLoaded = true;
}

function playSound(name) {
    if (!soundsLoaded) return;
    const a = sounds[name];
    if (!a) return;
    // BGM não deve ser clonada
    if (name === 'bgm') {
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
    }
    // Para efeitos curtos, clonamos para permitir sobreposição
    try {
        const c = a.cloneNode();
        c.play().catch(() => {});
    } catch (e) {
        // Fallback: tentar resetar o elemento original
        try { a.currentTime = 0; a.play().catch(() => {}); } catch(e){}
    }
}

function playBgm(name) {
    if (!soundsLoaded) return;
    const a = sounds[name];
    if (!a) return;
    stopBgm();
    a.currentTime = 0;
    a.play().catch(() => {});
}

function stopBgm() {
    if (!soundsLoaded) return;
    const a = sounds['bgm'];
    if (a) {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
    }
}

// --- SISTEMA DE RESPONSIVIDADE ---
function resizeGame() {
    const containerWidth = document.querySelector('.container').clientWidth - 20; // Padding
    // Calcula o tamanho do tile baseado na largura disponível
    // Limita o tamanho máximo para não ficar gigante em desktops
    tileSize = Math.min(Math.floor(containerWidth / COLS), 30); 
    
    // Ajusta o Canvas
    canvas.width = tileSize * COLS;
    canvas.height = tileSize * ROWS;

    // Se o jogo estiver parado ou pausado, redesenha para não sumir
    if (game && !gameRunning) {
        game.draw();
    }
}

window.addEventListener('resize', resizeGame);

// --- CLASSE DO JOGO ---
class PacManGame {
    constructor(difficulty) {
        this.difficulty = difficulty;
        this.settings = DIFFICULTY_SETTINGS[difficulty];
        this.score = 0;
        this.lives = this.settings.livesBonus;
        this.level = 1;
        this.pelletsEaten = 0;
        
        this.pacman = {
            x: 10, y: 15,
            direction: 'right',
            nextDirection: 'right',
            mouthOpen: 0,
            mouthSpeed: 0.2
        };

        // Fantasmas com cores oficiais e direção inicial
        this.ghosts = [
            { x: 9, y: 9, color: '#FF0000', name: 'Blinky', speedCounter: 0, dir: 'left' },  // Red
            { x: 10, y: 10, color: '#FFB8FF', name: 'Pinky', speedCounter: 0, dir: 'up' },   // Pink
            { x: 8, y: 10, color: '#00FFFF', name: 'Inky', speedCounter: 0, dir: 'right' },  // Cyan
            { x: 10, y: 9, color: '#FFB852', name: 'Clyde', speedCounter: 0, dir: 'left' }   // Orange
        ];

        this.maze = this.generateMaze();
        this.pellets = this.generatePellets();
        this.totalPellets = this.pellets.length;
        
        this.powerUpActive = false;
        this.powerUpCounter = 0;
        this.frameCount = 0;
        
        // Garante posições iniciais válidas
        this.resetPositions();
    }

    resetPositions() {
        // Encontra local seguro para Pacman
        const pStart = this.findNearestEmpty(10, 15);
        this.pacman.x = pStart.x;
        this.pacman.y = pStart.y;
        this.pacman.direction = 'right';
        this.pacman.nextDirection = 'right';

        // Reseta Fantasmas na jaula
        const gStarts = [{x:9,y:9}, {x:10,y:9}, {x:9,y:10}, {x:10,y:10}];
        this.ghosts.forEach((g, i) => {
            g.x = gStarts[i].x;
            g.y = gStarts[i].y;
        });
    }

    generateMaze() {
        const maze = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
        // Bordas
        for (let i = 0; i < ROWS; i++) {
            maze[i][0] = 1; maze[i][COLS-1] = 1;
        }
        for (let j = 0; j < COLS; j++) {
            maze[0][j] = 1; maze[ROWS-1][j] = 1;
        }
        // Pilares Aleatórios (Simétricos para ficar mais bonito)
        for (let i = 2; i < ROWS - 2; i += 2) {
            for (let j = 2; j < COLS/2 - 1; j += 2) {
                if (Math.random() > 0.2) {
                    maze[i][j] = 1;
                    maze[i][COLS - 1 - j] = 1; // Espelhamento
                }
            }
        }
        // Jaula Central
        for (let i = 8; i <= 11; i++) {
            for (let j = 8; j <= 11; j++) {
                if (i===8 || i===11 || j===8 || j===11) maze[i][j] = 1;
                else maze[i][j] = 0;
            }
        }
        maze[8][9] = 0; maze[8][10] = 0; // Saída
        return maze;
    }

    generatePellets() {
        const pellets = [];
        for (let i = 0; i < ROWS; i++) {
            for (let j = 0; j < COLS; j++) {
                if (this.maze[i][j] === 0) {
                    if (i>=8 && i<=11 && j>=8 && j<=11) continue; // Pula jaula
                    pellets.push({ x: j, y: i, type: 'normal' });
                }
            }
        }
        // Power-ups nos cantos
        const corners = [{x:1, y:1}, {x:COLS-2, y:1}, {x:1, y:ROWS-2}, {x:COLS-2, y:ROWS-2}];
        corners.forEach(c => {
            const p = pellets.find(pellet => pellet.x === c.x && pellet.y === c.y);
            if (p) p.type = 'power';
        });
        return pellets;
    }

    findNearestEmpty(x, y) {
        if (this.maze[y][x] === 0) return {x,y};
        // Busca simples por vizinho vazio
        const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
        for(let d of dirs) {
            if(this.maze[y+d[1]][x+d[0]] === 0) return {x: x+d[0], y: y+d[1]};
        }
        return {x:1, y:1};
    }

    update() {
        this.frameCount++;

        // --- Movimento Pacman ---
        // Tenta mudar direção
        let nextX = this.pacman.x + this.getDirectionX(this.pacman.nextDirection);
        let nextY = this.pacman.y + this.getDirectionY(this.pacman.nextDirection);
        if (this.canMove(nextX, nextY)) {
            this.pacman.direction = this.pacman.nextDirection;
        }
        
        // Move (a cada X frames para ajustar velocidade)
        if (this.frameCount % 12 === 0) { // Velocidade base
            let nx = this.pacman.x + this.getDirectionX(this.pacman.direction);
            let ny = this.pacman.y + this.getDirectionY(this.pacman.direction);
            
            if (this.canMove(nx, ny)) {
                // Portal
                if (nx < 0) nx = COLS - 1;
                if (nx >= COLS) nx = 0;
                this.pacman.x = nx;
                this.pacman.y = ny;
            }
        }

        // --- Movimento Fantasmas ---
        this.moveGhosts();

        // --- Colisões ---
        this.checkPelletCollision();
        this.checkGhostCollision();

        // --- Estado do Jogo ---
        if (this.pelletsEaten >= this.totalPellets) this.levelComplete();
        
        if (this.powerUpActive) {
            this.powerUpCounter--;
            if (this.powerUpCounter <= 0) {
                this.powerUpActive = false;
                this.ghosts.forEach(g => g.vulnerable = false);
            }
        }
    }

    moveGhosts() {
        this.ghosts.forEach(ghost => {
            ghost.speedCounter++;
            let speed = this.settings.ghostSpeed;
            if (ghost.vulnerable) speed *= 2; // Mais lento se vulnerável

            if (ghost.speedCounter % Math.floor(speed) === 0) {
                const dirs = ['up', 'down', 'left', 'right'];
                let validMoves = [];

                dirs.forEach(d => {
                    const dx = this.getDirectionX(d);
                    const dy = this.getDirectionY(d);
                    const nx = ghost.x + dx;
                    const ny = ghost.y + dy;
                    // Evita voltar imediatamente para trás (movimento mais natural)
                    if (this.canMove(nx, ny)) {
                        // Verifica se não é o oposto da direção atual
                        const isOpposite = (d === 'left' && ghost.dir === 'right') || 
                                           (d === 'right' && ghost.dir === 'left') ||
                                           (d === 'up' && ghost.dir === 'down') ||
                                           (d === 'down' && ghost.dir === 'up');
                        
                        // Permite voltar se for a única opção (beco sem saída)
                        validMoves.push({ dir: d, x: nx, y: ny, isOpposite });
                    }
                });

                if (validMoves.length > 0) {
                    // Filtra movimentos opostos a menos que seja a única opção
                    let filteredMoves = validMoves.filter(m => !m.isOpposite);
                    if (filteredMoves.length === 0) filteredMoves = validMoves;

                    let chosen;
                    // IA Básica
                    if (ghost.vulnerable) {
                        // Foge
                        chosen = filteredMoves.sort((a,b) => this.dist(b, this.pacman) - this.dist(a, this.pacman))[0];
                    } else if (Math.random() > 0.3) {
                        // Persegue
                        chosen = filteredMoves.sort((a,b) => this.dist(a, this.pacman) - this.dist(b, this.pacman))[0];
                    } else {
                        // Aleatório
                        chosen = filteredMoves[Math.floor(Math.random() * filteredMoves.length)];
                    }

                    ghost.x = chosen.x;
                    ghost.y = chosen.y;
                    ghost.dir = chosen.dir;
                    
                    // Portal Fantasma
                    if (ghost.x < 0) ghost.x = COLS - 1;
                    if (ghost.x >= COLS) ghost.x = 0;
                }
            }
        });
    }

    dist(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    getDirectionX(dir) { return dir === 'left' ? -1 : dir === 'right' ? 1 : 0; }
    getDirectionY(dir) { return dir === 'up' ? -1 : dir === 'down' ? 1 : 0; }
    
    canMove(x, y) {
        if (x < 0 || x >= COLS) return true;
        if (y < 0 || y >= ROWS) return false;
        return this.maze[y][x] === 0;
    }

    checkPelletCollision() {
        const idx = this.pellets.findIndex(p => p.x === this.pacman.x && p.y === this.pacman.y);
        if (idx !== -1) {
            const p = this.pellets[idx];
            if (p.type === 'power') {
                this.score += 50;
                this.powerUpActive = true;
                this.powerUpCounter = 400;
                this.ghosts.forEach(g => g.vulnerable = true);
                // Som de power pellet
                playSound('power');
            } else {
                this.score += 10;
                // Som de chomp normal
                playSound('chomp');
            }
            this.pellets.splice(idx, 1);
            this.pelletsEaten++;
        }
    }

    checkGhostCollision() {
        this.ghosts.forEach(g => {
            if (g.x === this.pacman.x && g.y === this.pacman.y) {
                if (this.powerUpActive && g.vulnerable) {
                    this.score += 200;
                    g.x = 10; g.y = 10; // Reset jaula
                    g.vulnerable = false;
                    // Som de comer fantasma
                    playSound('eatghost');
                } else {
                    this.lives--;
                    // Som de morte
                    playSound('death');
                    if (this.lives <= 0) this.gameOver();
                    else this.resetPositions();
                }
            }
        });
    }

    gameOver() {
        gameRunning = false;
        stopBgm();
        // Evita exceções caso elementos opcionais não existam
        const gom = document.getElementById('gameOverMessage');
        if (gom) gom.innerText = "Viu? Fantasmas existem!";
        const fs = document.getElementById('finalScore');
        if (fs) fs.innerText = this.score;
        try { gameOverModal.style.display = 'flex'; } catch (e) { console.warn('gameOver modal não encontrado', e); }
    }

    levelComplete() {
        gameRunning = false;
        // Som de interlúdio / fim de fase
        playSound('intermission');
        stopBgm();
        document.getElementById('levelScore').innerText = this.score;
        levelCompleteModal.style.display = 'flex';
    }

    // --- RENDERIZAÇÃO MELHORADA ---
    draw() {
        // Fundo com leve transparência para rastro (opcional, aqui usaremos clear total)
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Desenha Mapa (Neon Walls)
        ctx.strokeStyle = '#0033ff'; // Azul escuro
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0066ff';
        
        for(let i=0; i<ROWS; i++) {
            for(let j=0; j<COLS; j++) {
                if(this.maze[i][j] === 1) {
                    const x = j * tileSize;
                    const y = i * tileSize;
                    // Borda Neon Interna
                    ctx.strokeStyle = '#0088ff';
                    ctx.strokeRect(x+4, y+4, tileSize-8, tileSize-8);
                    
                    // Preenchimento leve
                    ctx.fillStyle = 'rgba(0, 40, 100, 0.3)';
                    ctx.fillRect(x+2, y+2, tileSize-4, tileSize-4);
                }
            }
        }
        ctx.shadowBlur = 0; // Reseta glow

        // Desenha Pellets (Brilhantes)
        this.pellets.forEach(p => {
            const cx = p.x * tileSize + tileSize/2;
            const cy = p.y * tileSize + tileSize/2;
            
            if (p.type === 'power') {
                // Power Pellet Pulsante
                const pulse = Math.sin(this.frameCount * 0.2) * 2;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ffb8ae';
                ctx.fillStyle = '#ffb8ae';
                ctx.beginPath();
                ctx.arc(cx, cy, 6 + pulse, 0, Math.PI*2);
                ctx.fill();
            } else {
                // Pellet Normal
                ctx.shadowBlur = 5;
                ctx.shadowColor = '#ffb8ae';
                ctx.fillStyle = '#ffb8ae';
                ctx.beginPath();
                ctx.fillRect(cx-2, cy-2, 4, 4);
                ctx.fill();
            }
        });
        ctx.shadowBlur = 0;

        // Desenha Pac-Man (3D Style)
        this.drawPacman();

        // Desenha Fantasmas (Detalhes)
        this.ghosts.forEach(g => this.drawGhost(g));
    }

    drawPacman() {
        const cx = this.pacman.x * tileSize + tileSize/2;
        const cy = this.pacman.y * tileSize + tileSize/2;
        const radius = tileSize/2 - 2;

        // Animação da boca
        const mouthOscillation = Math.sin(this.frameCount * 0.3);
        const angle = (0.2 + mouthOscillation * 0.2) * Math.PI;

        let rot = 0;
        if (this.pacman.direction === 'left') rot = Math.PI;
        if (this.pacman.direction === 'up') rot = -Math.PI/2;
        if (this.pacman.direction === 'down') rot = Math.PI/2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Corpo Esférico (Gradiente Radial)
        const grad = ctx.createRadialGradient(-2, -2, 2, 0, 0, radius);
        grad.addColorStop(0, '#ffff00'); // Amarelo claro (brilho)
        grad.addColorStop(1, '#ffaa00'); // Amarelo escuro (sombra)
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, angle, -angle);
        ctx.lineTo(0, 0);
        ctx.fill();

        ctx.restore();
    }

    drawGhost(g) {
        const cx = g.x * tileSize + tileSize/2;
        const cy = g.y * tileSize + tileSize/2;
        const radius = tileSize/2 - 2;
        
        let color = g.vulnerable && this.powerUpActive ? '#2121ff' : g.color;
        if (g.vulnerable && this.powerUpCounter < 100 && Math.floor(this.frameCount/10)%2===0) {
            color = '#ffffff'; // Pisca branco no fim
        }

        ctx.fillStyle = color;
        
        // Cabeça e Corpo
        ctx.beginPath();
        ctx.arc(cx, cy - 2, radius, Math.PI, 0); // Topo arredondado
        
        // Pés ondulados (Bézier ou linhas simples)
        const feet = 3;
        const footWidth = (radius * 2) / feet;
        const bottomY = cy + radius;
        const leftX = cx - radius;

        ctx.lineTo(leftX + radius * 2, bottomY); // Desce lado direito
        
        // Ondas em baixo
        for(let i=0; i<feet; i++) {
            const fx = (leftX + radius * 2) - (footWidth * i);
            ctx.quadraticCurveTo(
                fx - footWidth/2, bottomY - 3,
                fx - footWidth, bottomY
            );
        }
        
        ctx.lineTo(leftX, cy - 2); // Sobe lado esquerdo
        ctx.fill();

        // Olhos (Só desenha se não estiver vulnerável ou piscando)
        if (!g.vulnerable || (this.powerUpCounter < 100 && color === '#ffffff')) {
            const eyeOffsetX = g.dir === 'left' ? -4 : g.dir === 'right' ? 4 : 0;
            const eyeOffsetY = g.dir === 'up' ? -4 : g.dir === 'down' ? 4 : 0;
            
            ctx.fillStyle = 'white';
            // Olho Esquerdo
            ctx.beginPath();
            ctx.arc(cx - 4 + eyeOffsetX/2, cy - 4 + eyeOffsetY/2, 4, 0, Math.PI*2);
            ctx.fill();
            // Olho Direito
            ctx.beginPath();
            ctx.arc(cx + 4 + eyeOffsetX/2, cy - 4 + eyeOffsetY/2, 4, 0, Math.PI*2);
            ctx.fill();

            // Pupilas
            ctx.fillStyle = 'blue';
            ctx.beginPath();
            ctx.arc(cx - 4 + eyeOffsetX, cy - 4 + eyeOffsetY, 1.5, 0, Math.PI*2);
            ctx.arc(cx + 4 + eyeOffsetX, cy - 4 + eyeOffsetY, 1.5, 0, Math.PI*2);
            ctx.fill();
        } else if (g.vulnerable) {
            // Rosto assustado (Boca ondulada simples)
            ctx.fillStyle = '#ffb8ae';
            ctx.fillRect(cx - 6, cy + 2, 2, 2);
            ctx.fillRect(cx - 2, cy + 2, 2, 2);
            ctx.fillRect(cx + 2, cy + 2, 2, 2);
            ctx.fillRect(cx + 6, cy + 2, 2, 2);
        }
    }
}

// --- CONTROLES GLOBAIS ---
function startGame(diff) {
    resizeGame(); // Garante tamanho correto
    menuDiv.style.display = 'none';
    gameContainerDiv.style.display = 'flex';
    gameOverModal.style.display = 'none';
    levelCompleteModal.style.display = 'none';
    // Carrega sons (aproveita interação do usuário ao clicar no botão)
    loadSounds();
    // Toca som de início e quando terminar inicia o BGM
    if (sounds.start) {
        try {
            sounds.start.currentTime = 0;
            sounds.start.play().catch(() => {});
            sounds.start.onended = () => playBgm('bgm');
        } catch (e) {
            // fallback: inicia BGM direto
            playBgm('bgm');
        }
    } else {
        playBgm('bgm');
    }

    game = new PacManGame(diff);
    gameRunning = true;
    isPaused = false;
    gameLoop();
}

function nextLevel() {
    if(!game) return;
    const oldScore = game.score;
    const oldLives = game.lives;
    const diff = game.difficulty;
    
    game = new PacManGame(diff);
    game.score = oldScore;
    game.lives = oldLives;
    game.level = document.getElementById('level').innerText * 1 + 1;
    document.getElementById('level').innerText = game.level;

    levelCompleteModal.style.display = 'none';
    gameRunning = true;
    gameLoop();
    // Reinicia BGM ao iniciar próximo nível
    playBgm('bgm');
}

function gameLoop() {
    if(!gameRunning) return;
    if(!isPaused) {
        game.update();
        scoreDisplay.innerText = game.score;
        livesDisplay.innerText = game.lives;
    }
    game.draw();
    animationId = requestAnimationFrame(gameLoop);
}

// Controle de Toque (Swipe)
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: false});

window.addEventListener('touchend', e => {
    if(!game || !gameRunning) return;
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    
    if(Math.abs(dx) > Math.abs(dy)) {
        game.pacman.nextDirection = dx > 0 ? 'right' : 'left';
    } else {
        game.pacman.nextDirection = dy > 0 ? 'down' : 'up';
    }
}, {passive: false});

// Controle de Teclado
window.addEventListener('keydown', e => {
    if(!game || !gameRunning) return;
    const key = e.key.toLowerCase();
    if(['arrowup','w'].includes(key)) game.pacman.nextDirection = 'up';
    if(['arrowdown','s'].includes(key)) game.pacman.nextDirection = 'down';
    if(['arrowleft','a'].includes(key)) game.pacman.nextDirection = 'left';
    if(['arrowright','d'].includes(key)) game.pacman.nextDirection = 'right';
    if(key === ' ') isPaused = !isPaused;
});

// --- AÇÕES DO MODAL DE GAME OVER ---
function restartGame() {
    // Reinicia o jogo usando a mesma dificuldade atual, se disponível
    let diff = 'medium';
    try {
        if (game && game.difficulty) diff = game.difficulty;
    } catch (e) {}

    // Fecha modal e reinicia
    try { gameOverModal.style.display = 'none'; } catch (e) {}
    stopBgm();
    startGame(diff);
}

function openDifficultyMenuFromGameOver() {
    // Para o jogo atual e mostra o menu de seleção de dificuldade
    stopBgm();
    gameRunning = false;
    try { gameOverModal.style.display = 'none'; } catch (e) {}
    try { gameContainerDiv.style.display = 'none'; } catch (e) {}
    try { menuDiv.style.display = 'block'; } catch (e) {}
}
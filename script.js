window.addEventListener('load', () => {
    
    const particleCanvas = document.getElementById('particleCanvas');
    const particleContext = particleCanvas.getContext('2d');
    const permanentCanvas = document.getElementById('permanentCanvas');
    const permanentContext = permanentCanvas.getContext('2d');
    
    const colorPicker = document.getElementById('colorPicker');
    const resetButton = document.getElementById('resetButton');
    const addToCupButton = document.getElementById('addToCupButton');
    const pourFromCupButton = document.getElementById('pourFromCupButton');
    const cupVisual = document.getElementById('cupVisual');

    particleCanvas.width = 800;
    particleCanvas.height = 600;
    permanentCanvas.width = 800;
    permanentCanvas.height = 600;

    // --- 変数 ---
    let particles = [];
    const mouse = { x: particleCanvas.width / 2, y: particleCanvas.height / 2 };
    let cupColors = []; 
    let isPourMode = false;

    let tilt = { x: 0, y: 0 };
    let isSensorActive = false;

    // --- シミュレーション定数 ---
    const gravityStrength = 0.005; 
    const friction = 0.90;         
    const repulsionStrength = 0.5;
    const MAX_AGE_FRAMES = 120; 
    const GRAVITY_GRACE_PERIOD = 0; 

    // --- イベントリスナー ---
    particleCanvas.addEventListener('click', (event) => {
        if (!isPourMode) return;
        const rect = particleCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        pourFromCup(x, y);
        setPourMode(false);
    });
    particleCanvas.addEventListener('mousemove', (event) => {
        const rect = particleCanvas.getBoundingClientRect();
        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;
    });

    // --- UIボタン ---
    addToCupButton.addEventListener('click', () => {
        const color = colorPicker.value;
        cupColors.push(color);
        updateCupVisual();
    });
    
    pourFromCupButton.addEventListener('click', () => {
        if (cupColors.length === 0) {
            alert("コップに色がありません。"); return;
        }
        if (!isSensorActive) {
            startSensor();
        }
        setPourMode(true);
    });
    
    resetButton.addEventListener('click', () => {
        particles = [];
        cupColors = [];
        updateCupVisual();
        setPourMode(false);
        clearParticleCanvas();
        clearPermanentCanvas();
    });

    // --- 関数 ---
    function setPourMode(mode) {
        isPourMode = mode;
        if (isPourMode) {
            particleCanvas.style.cursor = "copy";
            pourFromCupButton.style.backgroundColor = "#ffc";
            pourFromCupButton.textContent = "流す場所をキャンバスでクリック";
        } else {
            particleCanvas.style.cursor = "default";
            pourFromCupButton.style.backgroundColor = "";
            pourFromCupButton.textContent = "コップから流す";
        }
    }

    function updateCupVisual() {
        cupVisual.innerHTML = "";
        for (const color of cupColors) {
            const layer = document.createElement('div');
            layer.className = 'cup-color-layer';
            layer.style.backgroundColor = color;
            cupVisual.appendChild(layer);
        }
        cupVisual.scrollTop = cupVisual.scrollHeight;
    }

    function pourFromCup(centerX, centerY) {
        const AREA_PER_UNIT = 100; 
        let currentTotalArea = 0;

        for (const color of cupColors) {
            const startArea = currentTotalArea;
            const endArea = startArea + AREA_PER_UNIT;
            
            const startR = Math.sqrt(startArea / Math.PI);
            const endR = Math.sqrt(endArea / Math.PI);
            
            const layerArea = endArea - startArea;
            const particleCount = Math.floor(layerArea * 0.05);

            for (let i = 0; i < particleCount; i++) {
                const noise = (Math.random() - 0.5) * 10; 
                const rBase = Math.sqrt(Math.random() * (endR*endR - startR*startR) + startR*startR);
                const r = rBase + noise;

                const angle = Math.random() * Math.PI * 2;
                
                const pX = centerX + Math.cos(angle) * r;
                const pY = centerY + Math.sin(angle) * r;
                
                const newParticle = createParticle(pX, pY, color);
                
                const spreadSpeed = 1.5 + Math.random();
                newParticle.vx = Math.cos(angle) * spreadSpeed;
                newParticle.vy = Math.sin(angle) * spreadSpeed;
                
                particles.push(newParticle);
                drawOnParticle(newParticle);
            }
            currentTotalArea = endArea;
        }

        cupColors = [];
        updateCupVisual();
    }

    function startSensor() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation);
                        isSensorActive = true;
                        alert("傾き検知を有効にしました！");
                    }
                })
                .catch(console.error);
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
            isSensorActive = true;
        }
    }

    function handleOrientation(event) {
        const sensitivity = 0.05; 
        if (event.gamma !== null && event.beta !== null) {
            tilt.x = event.beta * sensitivity; 
            tilt.y = -event.gamma * sensitivity;
        }
    }

    // --- パーティクル処理 ---
    function createParticle(x, y, color) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;
        return {
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            color: color,
            // ★変更: 粒子のサイズを一回り大きくする
            // 小さいとフィルタで消えてしまうため、最低サイズを大きく設定
            radius: Math.random() * 5 + 8,  // 元: * 2 + 2
            maxRadius: Math.random() * 20 + 15, // 元: * 15 + 10
            age: 0,
            maxAge: MAX_AGE_FRAMES + Math.random() * 150,
            gracePeriod: GRAVITY_GRACE_PERIOD 
        };
    }

    function clearParticleCanvas() {
        particleContext.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    }
    
    // ★変更: ここを白塗りではなく透明消去に変更
    function clearPermanentCanvas() {
        // 白背景はCSS(#canvas-stack)で表現するため、ここでは透明にする
        permanentContext.clearRect(0, 0, permanentCanvas.width, permanentCanvas.height);
    }

    function drawOnParticle(p) {
        particleContext.beginPath();
        particleContext.globalAlpha = 0.6;
        particleContext.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        particleContext.fillStyle = p.color;
        particleContext.fill();
    }

    function drawOnPermanent(p) {
        permanentContext.beginPath();
        permanentContext.globalAlpha = 0.6;
        permanentContext.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        permanentContext.fillStyle = p.color;
        permanentContext.fill();
    }
    
    function animate() {
        clearParticleCanvas();
        updateParticles();
        drawParticles();
        requestAnimationFrame(animate);
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            
            drawOnPermanent(p);

            p.age++;
            if (p.age > p.maxAge) {
                particles.splice(i, 1);
                continue; 
            }

            if (p.gracePeriod > 0) {
                p.gracePeriod--;
            }

            if (p.gracePeriod <= 0) { 
                if (isSensorActive) {
                    p.vx += tilt.x;
                    p.vy += tilt.y;
                } else {
                    const dx_mouse = mouse.x - p.x;
                    const dy_mouse = mouse.y - p.y;
                    p.vx += dx_mouse * gravityStrength;
                    p.vy += dy_mouse * gravityStrength;
                }
            }
            
            p.vx *= friction;
            p.vy *= friction;

            // 衝突判定
            for (let j = i - 1; j >= 0; j--) {
                const p_other = particles[j];
                const dx = p.x - p_other.x;
                const dy = p.y - p_other.y;
                const distSq = dx*dx + dy*dy;
                const minDist = p.radius + p_other.radius;
                
                if (distSq < minDist * minDist) {
                    const distance = Math.sqrt(distSq);
                    const overlap = minDist - distance;
                    const norm_x = distance === 0 ? 1 : dx / distance; 
                    const norm_y = distance === 0 ? 0 : dy / distance;
                    const force = overlap * repulsionStrength * 0.5;
                    p.vx += norm_x * force; p.vy += norm_y * force;
                    p_other.vx -= norm_x * force;
                    p_other.vy -= norm_y * force;
                }
            }

            p.x += p.vx;
            p.y += p.vy;

            if (p.radius < p.maxRadius) {
                p.radius += 0.15;
            }

            // 壁判定
            if (p.x < p.radius) { p.x = p.radius; p.vx *= -0.5; }
            if (p.x > particleCanvas.width - p.radius) { p.x = particleCanvas.width - p.radius; p.vx *= -0.5; }
            if (p.y < p.radius) { p.y = p.radius; p.vy *= -0.5; }
            if (p.y > particleCanvas.height - p.radius) { p.y = particleCanvas.height - p.radius; p.vy *= -0.5; }
        }
    }
    
    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            drawOnParticle(particles[i]);
        }
    }

    clearPermanentCanvas(); 
    animate();
});
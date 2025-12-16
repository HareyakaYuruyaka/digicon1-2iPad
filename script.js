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

    // --- 簡易デバッグボックス ---
    const __debugBox = document.createElement('div');
    __debugBox.id = '__debugBox';
    __debugBox.style.position = 'fixed';
    __debugBox.style.right = '12px';
    __debugBox.style.top = '12px';
    __debugBox.style.background = 'rgba(0,0,0,0.6)';
    __debugBox.style.color = '#fff';
    __debugBox.style.padding = '6px 8px';
    __debugBox.style.borderRadius = '6px';
    __debugBox.style.fontSize = '12px';
    __debugBox.style.zIndex = 20000;
    __debugBox.style.maxWidth = '220px';
    __debugBox.style.pointerEvents = 'none';
    document.body.appendChild(__debugBox);

    function updateDebugBox() {
        __debugBox.textContent = `Mode=${isPourMode ? 'POUR' : 'EDIT'} Colors=${cupColors.length} P=${particles.length} Sensor=${isSensorActive ? 'ON' : 'OFF'}`;
    }

    // --- シミュレーション定数 ---
    const gravityStrength = 0.005; 
    const friction = 0.90;         
    const repulsionStrength = 0.5;
    const MAX_AGE_FRAMES = 120; 
    const GRAVITY_GRACE_PERIOD = 0; 

    // --- イベントリスナー ---
    function getCanvasCoordinates(clientX, clientY) {
        const rect = particleCanvas.getBoundingClientRect();
        const scaleX = particleCanvas.width / rect.width;
        const scaleY = particleCanvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    particleCanvas.addEventListener('click', (event) => {
        if (!isPourMode) return;
        const pos = getCanvasCoordinates(event.clientX, event.clientY);
        pourFromCup(pos.x, pos.y);
        setPourMode(false);
    });

    particleCanvas.addEventListener('touchstart', (ev) => {
        if (!isPourMode) return;
        ev.preventDefault(); 
        const touch = ev.touches && ev.touches[0];
        if (!touch) return;
        
        const pos = getCanvasCoordinates(touch.clientX, touch.clientY);
        pourFromCup(pos.x, pos.y);
        setPourMode(false);
    }, { passive: false });

    particleCanvas.addEventListener('mousemove', (event) => {
        const pos = getCanvasCoordinates(event.clientX, event.clientY);
        mouse.x = pos.x;
        mouse.y = pos.y;
    });

    // カラーボタンのリスナー設定
    const colorButtons = document.querySelectorAll('.color-btn');
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // data-color属性から色を取得
            const color = btn.getAttribute('data-color');
            
            // コップに追加
            cupColors.push(color);
            updateCupVisual();
            updateDebugBox();
        });
    });

    function showToast(message, ms = 1200) {
        let t = document.getElementById('__toast');
        if (!t) {
            t = document.createElement('div');
            t.id = '__toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => { t.classList.remove('show'); }, ms);
    }
    
    if (pourFromCupButton) {
        pourFromCupButton.addEventListener('click', () => {
            if (cupColors.length === 0) { alert("コップに色がありません。"); return; }
            if (!isSensorActive) startSensor();
            setPourMode(true);
            showToast('キャンバスをタップして流してください');
            updateDebugBox();
        });
    }
    
    resetButton.addEventListener('click', () => {
        particles = [];
        cupColors = [];
        updateCupVisual();
        setPourMode(false);
        clearParticleCanvas();
        clearPermanentCanvas();
        updateDebugBox();
    });

    // --- 横向き固定機能 ---
    const orientationOverlay = document.createElement('div');
    orientationOverlay.id = 'orientation-lock-overlay';
    Object.assign(orientationOverlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: '#000000', color: '#ffffff', zIndex: '99999',
        display: 'none', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        textAlign: 'center', fontSize: '24px', fontWeight: 'bold'
    });
    orientationOverlay.innerHTML = `
        <div style="font-size: 50px; margin-bottom: 20px;">📱</div>
        <p>画面を横向きにしてください</p>
        <p style="font-size: 14px; color: #aaa; margin-top: 10px;">Please rotate your device to landscape</p>
    `;
    document.body.appendChild(orientationOverlay);

    function checkOrientation() {
        if (window.innerHeight > window.innerWidth) {
            orientationOverlay.style.display = 'flex';
        } else {
            orientationOverlay.style.display = 'none';
        }
    }
    window.addEventListener('resize', checkOrientation);
    checkOrientation();

    // --- センサー制御関数 ---
    function startSensor() {
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        isSensorActive = true;
                        window.addEventListener('deviceorientation', handleOrientation);
                        updateDebugBox();
                        alert("傾き検知を有効にしました！");
                    }
                })
                .catch(e => console.error(e));
        } else {
            isSensorActive = true;
            window.addEventListener('deviceorientation', handleOrientation);
        }
    }

    function handleOrientation(event) {
        const sensitivity = 0.05; 
        if (event.gamma !== null && event.beta !== null) {
            tilt.x = event.beta * sensitivity; 
            tilt.y = -event.gamma * sensitivity;
        }
    }

    // --- 画像保存・QR・共有まわり ---
    const saveImageButton = document.getElementById('saveImageButton');
    const saveOverlay = document.getElementById('saveOverlay');
    const qrContainer = document.getElementById('qrContainer');
    const fallbackArea = document.getElementById('fallbackArea');
    const previewImage = document.getElementById('previewImage');
    const downloadLink = document.getElementById('downloadLink');
    const closeSaveOverlay = document.getElementById('closeSaveOverlay');
    const shareToPhoneButton = document.getElementById('shareToPhoneButton');
    const regenQrButton = document.getElementById('regenQrButton');
    const saveStatus = document.getElementById('saveStatus');
    const airdropHint = document.getElementById('airdropHint');

    saveImageButton && saveImageButton.addEventListener('click', async () => {
        shareCurrentImageToPhone();
    });
    closeSaveOverlay && closeSaveOverlay.addEventListener('click', () => closeSaveOverlayFunc());
    shareToPhoneButton && shareToPhoneButton.addEventListener('click', () => {
        shareCurrentImageToPhone();
    });
    regenQrButton && regenQrButton.addEventListener('click', () => {
        attemptGenerateQRWithRetries();
    });

    function openSaveOverlay() {
        if (!saveOverlay) return;
        saveOverlay.setAttribute('aria-hidden', 'false');
        qrContainer.style.display = 'none';
        fallbackArea.style.display = '';
        shareCurrentImageToPhone();
        attemptGenerateQRWithRetries();
        if (airdropHint) {
            airdropHint.classList.remove('highlight');
            void airdropHint.offsetWidth;
            airdropHint.classList.add('highlight');
        }
    }

    function shareCurrentImageToPhone() {
        const showStatus = saveOverlay && saveOverlay.getAttribute('aria-hidden') === 'false';
        if (showStatus) saveStatus.textContent = '共有を試みています...';
        
        setTimeout(() => {
            const dataURL = generateCombinedDataURL();
            fetch(dataURL).then(r => r.blob()).then(async (blob) => {
                const file = new File([blob], 'pouring.png', { type: blob.type });
                if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                    try {
                        await navigator.share({ files: [file], title: 'Pouring Art' });
                        if (showStatus) {
                            saveStatus.textContent = '共有しました。';
                            closeSaveOverlayFunc();
                        }
                    } catch (err) {
                        if (showStatus) saveStatus.textContent = '共有がキャンセルされました。';
                    }
                } else {
                    if (showStatus) saveStatus.textContent = 'このブラウザは共有機能未対応です。';
                    try {
                        previewImage.src = dataURL;
                        downloadLink.href = dataURL;
                        if (saveOverlay) {
                            saveOverlay.setAttribute('aria-hidden', 'false');
                            qrContainer.style.display = 'none';
                            fallbackArea.style.display = '';
                        }
                    } catch (err) { console.error(err); }
                }
            }).catch(err => { console.error(err); });
        }, 50);
    }

    function attemptGenerateQRWithRetries() {
        if(!saveStatus) return;
        saveStatus.textContent = 'QR生成中...';
        const MAX_QR_CHARS = 1200; 
        const widths = [320, 240, 200];
        const qualities = [0.7, 0.5, 0.3];

        setTimeout(() => {
            (async () => {
                let found = false;
                for (let w of widths) {
                    for (let q of qualities) {
                        const thumb = generateCombinedDataURL(w, q, 'image/jpeg');
                        if (thumb.length <= MAX_QR_CHARS) {
                            const api = 'https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=' + encodeURIComponent(thumb);
                            qrContainer.innerHTML = '';
                            const img = document.createElement('img');
                            img.src = api;
                            img.style.maxWidth = '100%';
                            qrContainer.appendChild(img);
                            qrContainer.style.display = '';
                            fallbackArea.style.display = 'none';
                            saveStatus.textContent = `QR生成成功`;
                            found = true;
                            return;
                        }
                    }
                }
                if (!found) {
                    saveStatus.textContent = '画像が大きすぎるためQR表示できません。直接ダウンロードしてください。';
                    const full = generateCombinedDataURL();
                    previewImage.src = full;
                    downloadLink.href = full;
                    qrContainer.style.display = 'none';
                    fallbackArea.style.display = '';
                }
            })();
        }, 50);
    }

    function closeSaveOverlayFunc() {
        if (!saveOverlay) return;
        saveOverlay.setAttribute('aria-hidden', 'true');
        qrContainer.innerHTML = '';
        previewImage.src = '';
    }

    function generateCombinedDataURL(width, quality, mimeType) {
        const w = width || permanentCanvas.width;
        const h = Math.round((permanentCanvas.height / permanentCanvas.width) * w);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.drawImage(permanentCanvas, 0, 0, permanentCanvas.width, permanentCanvas.height, 0, 0, w, h);
        tCtx.drawImage(particleCanvas, 0, 0, particleCanvas.width, particleCanvas.height, 0, 0, w, h);

        const imageData = tCtx.getImageData(0, 0, w, h);
        
        fastBlur(imageData, 6); 
        fastBlur(imageData, 6);

        applyHighContrast(imageData, 10);

        tCtx.putImageData(imageData, 0, 0);

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = w; finalCanvas.height = h;
        const fCtx = finalCanvas.getContext('2d');
        
        fCtx.fillStyle = '#ffffff';
        fCtx.fillRect(0, 0, w, h);
        fCtx.drawImage(tempCanvas, 0, 0);

        const mt = mimeType || 'image/png';
        if (mt === 'image/jpeg') { return finalCanvas.toDataURL('image/jpeg', quality || 0.7); }
        return finalCanvas.toDataURL('image/png');
    }

    function applyHighContrast(imageData, factor) {
        const data = imageData.data;
        const table = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            let v = (i - 128) * factor + 128;
            if (v < 0) v = 0;
            if (v > 255) v = 255;
            table[i] = v;
        }

        for (let i = 0; i < data.length; i += 4) {
            data[i]     = table[data[i]];     // R
            data[i + 1] = table[data[i + 1]]; // G
            data[i + 2] = table[data[i + 2]]; // B
            data[i + 3] = table[data[i + 3]]; // Alpha
            
            if (data[i+3] < 100) data[i+3] = 0;
        }
    }

    function fastBlur(imageData, radius) {
        if (isNaN(radius) || radius < 1) return;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                let count = 0;
                for (let i = -radius; i <= radius; i += 2) { 
                    const nx = x + i;
                    if (nx >= 0 && nx < width) {
                        const idx = (y * width + nx) * 4;
                        r += data[idx]; g += data[idx+1]; b += data[idx+2]; a += data[idx+3];
                        count++;
                    }
                }
                const idx = (y * width + x) * 4;
                data[idx] = r/count; data[idx+1] = g/count; data[idx+2] = b/count; data[idx+3] = a/count;
            }
        }
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                let r = 0, g = 0, b = 0, a = 0;
                let count = 0;
                for (let i = -radius; i <= radius; i += 2) {
                    const ny = y + i;
                    if (ny >= 0 && ny < height) {
                        const idx = (ny * width + x) * 4;
                        r += data[idx]; g += data[idx+1]; b += data[idx+2]; a += data[idx+3];
                        count++;
                    }
                }
                const idx = (y * width + x) * 4;
                data[idx] = r/count; data[idx+1] = g/count; data[idx+2] = b/count; data[idx+3] = a/count;
            }
        }
    }

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
        updateDebugBox();
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
        updateDebugBox();
    }

    // --- パーティクル処理 ---
    function createParticle(x, y, color) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;
        return {
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            color: color,
            radius: Math.random() * 2 + 2,
            maxRadius: Math.random() * 15 + 10, 
            age: 0,
            maxAge: MAX_AGE_FRAMES + Math.random() * 150,
            gracePeriod: GRAVITY_GRACE_PERIOD 
        };
    }

    function clearParticleCanvas() {
        particleContext.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    }
    function clearPermanentCanvas() {
        permanentContext.fillStyle = '#FFFFFF';
        permanentContext.fillRect(0, 0, permanentCanvas.width, permanentCanvas.height);
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
            if (p.radius < p.maxRadius) { p.radius += 0.15; }
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
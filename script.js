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
    let isSensorActive = false; // センサーが有効かどうかのフラグ

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
        // ★追加: まだセンサーが有効でなければ許可を求める
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

    // --- 画像保存用UI要素 ---
    const saveImageButton = document.getElementById('saveImageButton');
    const saveOverlay = document.getElementById('saveOverlay');
    const qrContainer = document.getElementById('qrContainer');
    const fallbackArea = document.getElementById('fallbackArea');
    const previewImage = document.getElementById('previewImage');
    const downloadLink = document.getElementById('downloadLink');
    const closeSaveOverlay = document.getElementById('closeSaveOverlay');

    saveImageButton && saveImageButton.addEventListener('click', async () => {
        openSaveOverlay();
    });
    closeSaveOverlay && closeSaveOverlay.addEventListener('click', () => closeSaveOverlayFunc());

    function openSaveOverlay() {
        if (!saveOverlay) return;
        saveOverlay.setAttribute('aria-hidden', 'false');
        // 画像を生成してQRまたはフォールバックを表示
        try {
            const dataURL = generateCombinedDataURL();

            // QRコードに入れられる長さには制限があるため、まずは短めのサムネを試す
            const MAX_QR_CHARS = 1400; // 安全な目安

            // 小さめに圧縮したサムネイルを試す（幅320）
            const thumbDataURL = generateCombinedDataURL(320, 0.7);
            if (thumbDataURL.length <= MAX_QR_CHARS) {
                // Google Charts API を使ってQR画像を生成
                const api = 'https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=' + encodeURIComponent(thumbDataURL);
                qrContainer.innerHTML = '';
                const img = document.createElement('img');
                img.src = api;
                img.alt = 'QR code';
                img.style.maxWidth = '100%';
                qrContainer.appendChild(img);
                qrContainer.style.display = '';
                fallbackArea.style.display = 'none';
            } else {
                // QRに収まらない: フォールバックでフル画像とダウンロードリンクを表示
                previewImage.src = dataURL;
                downloadLink.href = dataURL;
                qrContainer.style.display = 'none';
                fallbackArea.style.display = '';
            }
        } catch (err) {
            console.error('画像生成エラー:', err);
            qrContainer.style.display = 'none';
            fallbackArea.style.display = '';
            previewImage.alt = '画像を生成できませんでした';
        }
    }

    function closeSaveOverlayFunc() {
        if (!saveOverlay) return;
        saveOverlay.setAttribute('aria-hidden', 'true');
        qrContainer.innerHTML = '';
        previewImage.src = '';
        downloadLink.href = '#';
    }

    // キャンバスを合成して dataURL を返す
    // width: 出力幅（省略時はキャンバス幅）
    // quality: JPEG品質（0-1）, 省略時は 0.92
    function generateCombinedDataURL(width, quality) {
        const w = width || permanentCanvas.width;
        const h = Math.round((permanentCanvas.height / permanentCanvas.width) * w);
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const ctx = tmp.getContext('2d');

        // draw permanent then particle
        // scale appropriately
        ctx.drawImage(permanentCanvas, 0, 0, permanentCanvas.width, permanentCanvas.height, 0, 0, w, h);
        ctx.drawImage(particleCanvas, 0, 0, particleCanvas.width, particleCanvas.height, 0, 0, w, h);

        const q = typeof quality === 'number' ? quality : 0.92;
        return tmp.toDataURL('image/jpeg', q);
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

    /**
     * ★変更: 面積一定化ロジック
     * 外側に行くほど層を薄くして、色の見た目の量を均等にする
     */
    function pourFromCup(centerX, centerY) {
        // 1クリック分の「面積」（半径ではない）を定義
        // この値を大きくすると全体が大きくなります
        const AREA_PER_UNIT = 100; 

        let currentTotalArea = 0;

        // コップに入っている色を順番に処理
        for (const color of cupColors) {
            
            // 1. 面積の計算
            // 前回の総面積
            const startArea = currentTotalArea;
            // 今回の層を足した総面積
            const endArea = startArea + AREA_PER_UNIT;
            
            // 2. 半径への変換 ( Area = π * r^2  =>  r = sqrt(Area / π) )
            const startR = Math.sqrt(startArea / Math.PI);
            const endR = Math.sqrt(endArea / Math.PI);
            
            // 3. 粒子密度の計算
            // 面積に対して一定の粒子数を配置することで、隙間なく埋める
            const layerArea = endArea - startArea; // 今回の層だけの面積（これは常に一定）
            const particleCount = Math.floor(layerArea * 0.05); // 密度係数

            for (let i = 0; i < particleCount; i++) {
                // ★ 工夫: 境界を少し混ぜるためのノイズ
                // startR と endR の間だけでなく、少しはみ出させる
                const noise = (Math.random() - 0.5) * 10; 
                
                // 均一な分布になるようなランダム半径の計算
                // (単純な random() だと中心に寄ってしまうため平方根をとる)
                const rBase = Math.sqrt(Math.random() * (endR*endR - startR*startR) + startR*startR);
                const r = rBase + noise; // ノイズを加える

                const angle = Math.random() * Math.PI * 2;
                
                const pX = centerX + Math.cos(angle) * r;
                const pY = centerY + Math.sin(angle) * r;
                
                const newParticle = createParticle(pX, pY, color);
                
                // 広がる力（少しランダム性を強めて不規則に）
                const spreadSpeed = 1.5 + Math.random();
                newParticle.vx = Math.cos(angle) * spreadSpeed;
                newParticle.vy = Math.sin(angle) * spreadSpeed;
                
                particles.push(newParticle);
                drawOnParticle(newParticle);
            }

            // 次のループのために総面積を更新
            currentTotalArea = endArea;
        }

        cupColors = [];
        updateCupVisual();
    }

    // ★追加: センサー許可のリクエストとイベント開始
    function startSensor() {
        // iOS 13+ の場合
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
            // Androidや古いiOS、PCなど
            window.addEventListener('deviceorientation', handleOrientation);
            isSensorActive = true;
        }
    }

    // ★変更: 横向き（ランドスケープ）用に軸をマッピング変更
    function handleOrientation(event) {
        // 感度調整
        const sensitivity = 0.05; 

        if (event.gamma !== null && event.beta !== null) {
            // 横持ちの場合、デバイスの「前後(Beta)」が画面の「左右(X)」になり、
            // デバイスの「左右(Gamma)」が画面の「上下(Y)」になります。
            
            // 【調整のヒント】
            // もし傾けた方向と逆に動く場合は、 * sensitivity の前に「-（マイナス）」をつけてください
            // 例: tilt.x = -event.beta * sensitivity;

            // X軸（左右）の動き ← デバイスの前後傾斜(beta)を使用
            tilt.x = event.beta * sensitivity; 
            
            // Y軸（上下）の動き ← デバイスの左右傾斜(gamma)を使用
            // ※多くの場合、ここをマイナスにすると直感的な方向になります
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
            radius: Math.random() * 2 + 2, // 少し大きく
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
                    // ★センサー有効時: 傾きに応じて加速させる
                    // tilt.x, tilt.y は定数的な力（重力）として加算
                    p.vx += tilt.x;
                    p.vy += tilt.y;
                } else {
                    // ★センサー無効時（PCなど）: 従来どおりマウスに集まる（または無効化してもOK）
                    const dx_mouse = mouse.x - p.x;
                    const dy_mouse = mouse.y - p.y;
                    p.vx += dx_mouse * gravityStrength;
                    p.vy += dy_mouse * gravityStrength;
                }
            }
            
            p.vx *= friction;
            p.vy *= friction;

            // 衝突判定（少し処理を軽くするために回数を減らしたり、距離チェックを簡易化しても良いが、
            // ここでは以前のロジックを維持）
            for (let j = i - 1; j >= 0; j--) {
                const p_other = particles[j];
                const dx = p.x - p_other.x;
                const dy = p.y - p_other.y;
                // 高速化: Math.sqrtを使わず距離の二乗で判定
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
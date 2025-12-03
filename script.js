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
    // addToCupButton に安全なハンドラを登録（例外が起きても他処理に影響しないように）
    if (addToCupButton) {
        addToCupButton.addEventListener('click', () => {
            try {
                if (!colorPicker) { console.error('colorPicker not found'); return; }
                const color = colorPicker.value;
                if (!color) { console.warn('no color selected'); }
                cupColors.push(color);
                updateCupVisual();
                console.log('Added to cup:', color, 'cupColors length=', cupColors.length);
                showToast('コップに色を追加しました');
            } catch (e) {
                console.error('addToCupButton handler error', e);
                alert('エラーが発生しました。ブラウザのコンソールを確認してください。');
            }
        });
    } else {
        console.warn('addToCupButton element not found at load time');
    }

    // 簡易トースト表示
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
    const shareToPhoneButton = document.getElementById('shareToPhoneButton');
    const regenQrButton = document.getElementById('regenQrButton');
    const saveStatus = document.getElementById('saveStatus');
    const airdropHint = document.getElementById('airdropHint');

    saveImageButton && saveImageButton.addEventListener('click', async () => {
        // 直接共有フローを開始（QRやオーバーレイは表示しない）
        shareCurrentImageToPhone();
    });
    closeSaveOverlay && closeSaveOverlay.addEventListener('click', () => closeSaveOverlayFunc());
    shareToPhoneButton && shareToPhoneButton.addEventListener('click', () => {
        // re-run share flow explicitly
        shareCurrentImageToPhone();
    });
    regenQrButton && regenQrButton.addEventListener('click', () => {
        attemptGenerateQRWithRetries();
    });

    function openSaveOverlay() {
        if (!saveOverlay) return;
        // overlay は常に開いてプレビュー／ダウンロードUIを表示する
        saveOverlay.setAttribute('aria-hidden', 'false');
        qrContainer.style.display = 'none';
        fallbackArea.style.display = '';

        // まずは合成画像を作る
        const dataURL = generateCombinedDataURL();

        // まずは共有を試し、無理なら QR を作れるか段階的に試す
        shareCurrentImageToPhone();
        attemptGenerateQRWithRetries();

        // AirDrop案内をハイライト（再表示ごとにアニメを起動）
        if (airdropHint) {
            airdropHint.classList.remove('highlight');
            // reflow 強制
            void airdropHint.offsetWidth;
            airdropHint.classList.add('highlight');
            const onAnimEnd = () => { airdropHint.classList.remove('highlight'); airdropHint.removeEventListener('animationend', onAnimEnd); };
            airdropHint.addEventListener('animationend', onAnimEnd);
        }
    }

    // Try to share current image via Web Share API (files) if available
    function shareCurrentImageToPhone() {
        // 共有処理は UI がオーバーレイで開かれている場合のみ状態表示を行う
        const showStatus = saveOverlay && saveOverlay.getAttribute('aria-hidden') === 'false';
        if (showStatus) saveStatus.textContent = '共有を試みています...（近くのスマホへ送信できます）';

        const dataURL = generateCombinedDataURL();
        fetch(dataURL).then(r => r.blob()).then(async (blob) => {
            const file = new File([blob], 'pouring.png', { type: blob.type });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
                try {
                    await navigator.share({ files: [file], title: 'Pouring Art' });
                    if (showStatus) saveStatus.textContent = '共有しました。スマホで確認してください。';
                    // クローズはオーバーレイを開いている場合のみ行う
                    if (showStatus) closeSaveOverlayFunc();
                    return;
                } catch (err) {
                    console.warn('共有がキャンセルまたは失敗:', err);
                    if (showStatus) saveStatus.textContent = '共有操作がキャンセルされました。';
                }
            } else {
                if (showStatus) saveStatus.textContent = 'デバイスの共有機能が使えません。フォールバックを試します。';
                // フォールバック: 新しいタブで画像を開く（ユーザが長押しで保存可能）
                try {
                    const w = window.open();
                    if (w) {
                        w.document.write('<title>Pouring Art</title>');
                        const img = w.document.createElement('img');
                        img.src = dataURL;
                        img.style.maxWidth = '100%';
                        img.alt = 'Pouring Art';
                        w.document.body.style.margin = '0';
                        w.document.body.style.display = 'flex';
                        w.document.body.style.justifyContent = 'center';
                        w.document.body.style.alignItems = 'center';
                        w.document.body.appendChild(img);
                    } else {
                        // もしポップアップ不可なら、オーバーレイにダウンロードリンクをセットして開く
                        previewImage.src = dataURL;
                        downloadLink.href = dataURL;
                        if (saveOverlay) {
                            saveOverlay.setAttribute('aria-hidden', 'false');
                            qrContainer.style.display = 'none';
                            fallbackArea.style.display = '';
                        }
                    }
                } catch (err) {
                    console.error('プレビュー表示エラー:', err);
                    if (showStatus) saveStatus.textContent = 'プレビュー表示に失敗しました。';
                }
            }
        }).catch(err => {
            console.error('share blob error', err);
            if (showStatus) saveStatus.textContent = '共有準備でエラーが発生しました。';
        });
    }

    // Attempt to make a QR by trying smaller thumbnails/qualities until it fits
    function attemptGenerateQRWithRetries() {
        saveStatus.textContent = 'QR生成を試しています...';
        const MAX_QR_CHARS = 1200; // safe target for Google QR
        const widths = [320, 240, 200, 160, 120];
        const qualities = [0.7, 0.6, 0.5, 0.4, 0.3];

        (async () => {
            let found = false;
            for (let w of widths) {
                for (let q of qualities) {
                    const thumb = generateCombinedDataURL(w, q, 'image/jpeg');
                    if (thumb.length <= MAX_QR_CHARS) {
                        // generate QR via Google Charts API
                        const api = 'https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=' + encodeURIComponent(thumb);
                        qrContainer.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = api;
                        img.alt = 'QR code';
                        img.style.maxWidth = '100%';
                        qrContainer.appendChild(img);
                        qrContainer.style.display = '';
                        fallbackArea.style.display = 'none';
                        saveStatus.textContent = `QR生成成功 (w=${w}, q=${q}) - スマホでスキャンしてください`;
                        found = true;
                        return;
                    }
                }
            }
            if (!found) {
                saveStatus.textContent = 'QRに収まりません。共有（AirDrop等）をお試しください。下のダウンロードリンクからも取得できます。';
                // set full preview + download
                const full = generateCombinedDataURL();
                previewImage.src = full;
                downloadLink.href = full;
                qrContainer.style.display = 'none';
                fallbackArea.style.display = '';
            }
        })();
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
    // quality: JPEG品質（0-1）, mimeType: 'image/png' or 'image/jpeg'
    function generateCombinedDataURL(width, quality, mimeType) {
        const w = width || permanentCanvas.width;
        const h = Math.round((permanentCanvas.height / permanentCanvas.width) * w);
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const ctx = tmp.getContext('2d');

        // Read computed style filter from one of the canvases (they share same CSS)
        let filterValue = 'none';
        try { const cs = getComputedStyle(particleCanvas); if (cs && cs.filter) filterValue = cs.filter; } catch (e) { filterValue = 'none'; }

        // Parse blur(px) and contrast(...) from filterValue
        let blurPx = 0; let contrastVal = 1;
        const blurMatch = /blur\((\d+(?:\.\d+)?)px\)/.exec(filterValue);
        if (blurMatch) blurPx = Math.max(0, Math.floor(parseFloat(blurMatch[1])));
        const contrastMatch = /contrast\(([^)]+)\)/.exec(filterValue);
        if (contrastMatch) {
            let raw = contrastMatch[1].trim();
            if (raw.endsWith('%')) { contrastVal = parseFloat(raw) / 100; }
            else contrastVal = parseFloat(raw);
            if (!isFinite(contrastVal) || contrastVal <= 0) contrastVal = 1;
        }

        // Draw base images without relying on ctx.filter
        ctx.drawImage(permanentCanvas, 0, 0, permanentCanvas.width, permanentCanvas.height, 0, 0, w, h);
        ctx.drawImage(particleCanvas, 0, 0, particleCanvas.width, particleCanvas.height, 0, 0, w, h);

        // Apply approximate blur by drawing multiple offset copies (simple box blur approximation)
        if (blurPx > 0) {
            const r = Math.min(12, Math.max(1, Math.round(blurPx * (w / permanentCanvas.width))));
            const src = document.createElement('canvas'); src.width = w; src.height = h; const sctx = src.getContext('2d'); sctx.drawImage(tmp,0,0);
            ctx.clearRect(0,0,w,h);
            const samples = Math.min(7, 1 + Math.floor(r/2));
            const half = Math.floor(samples/2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1 / (samples * samples);
            for (let dy = -half; dy <= half; dy++) {
                for (let dx = -half; dx <= half; dx++) {
                    ctx.drawImage(src, dx, dy, w, h);
                }
            }
            ctx.globalAlpha = 1;
        }

        // Apply contrast adjustment if needed
        if (contrastVal && Math.abs(contrastVal - 1) > 0.001) {
            try {
                const img = ctx.getImageData(0,0,w,h);
                const data = img.data; const c = contrastVal;
                for (let i=0;i<data.length;i+=4) {
                    for (let ch=0; ch<3; ch++) {
                        let v = data[i+ch]; let nv = (v - 128) * c + 128;
                        data[i+ch] = nv < 0 ? 0 : nv > 255 ? 255 : nv;
                    }
                }
                ctx.putImageData(img,0,0);
            } catch(e) { console.warn('contrast apply failed', e); }
        }

        const mt = mimeType || 'image/png';
        if (mt === 'image/jpeg') { const q = typeof quality === 'number' ? quality : 0.7; return tmp.toDataURL('image/jpeg', q); }
        return tmp.toDataURL('image/png');
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


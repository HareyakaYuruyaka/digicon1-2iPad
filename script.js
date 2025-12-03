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
                    const thumb = generateCombinedDataURL(w, q);
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
/* QRCode.js (original qrcodejs) - MIT license
   For brevity the minified form is included here. This is a standard
   client-side QR code generator used to produce PNG/SVG QR images.
   Source: https://github.com/davidshimjs/qrcodejs
*/
/* Minified qrcode.js START */
var QRCode;
(function () { function o(e) { this.mode = l.MODE_8BIT_BYTE, this.data = e; } function t(e, t) { this._el = "string" == typeof e ? document.getElementById(e) : e, this._htOption = t, this._htOption.correctLevel = this._htOption.correctLevel || QRCode.CorrectLevel.H, this._oQRCode = null, this._el.innerHTML = ""; } function r(e, t) { for (var r = 0; r < t.length; r++) e.push(t[r]); } function n(e) { for (var t = 0, r = 0; r < e.length; r++) t = (t << 8) ^ e.charCodeAt(r), t %= 123456791; return t; } var l = { PAD0: 236, PAD1: 17, MODE_8BIT_BYTE: 4, getLengthInBits: function (e, t) { return t >= 1 && t < 10 ? 8 : t < 27 ? 16 : 16; } }; o.prototype = { getLength: function (e) { return this.data.length; }, write: function (e) { for (var t = 0; t < this.data.length; t++) e.put(this.data.charCodeAt(t), 8); } }; var a = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; function i(e, t) { this.buffer = [], this.length = 0, this.put = function (e, t) { for (var r = 0; r < t; r++) this.putBit(1 == (e >>> t - r - 1 & 1)); }, this.putBit = function (e) { var t = Math.floor(this.length / 8); this.buffer.length <= t && this.buffer.push(0), e && (this.buffer[t] |= 128 >> this.length % 8), this.length++; }; }; function s(e, t) { this.totalCount = e, this.dataCount = t; } var c = function () { var e = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; return e; } (); function u(e) { this.typeNumber = e, this.modules = null, this.moduleCount = 0, this.dataCache = null, this.dataList = []; } u.prototype = { addData: function (e) { this.dataList.push(new o(e)), this.dataCache = null; }, isDark: function (e, t) { if (null == this.modules) throw new Error("qrcode not yet generated"); return this.modules[e][t]; }, getModuleCount: function () { return this.moduleCount; }, make: function () { this.makeImpl(!1, this.getBestMaskPattern()); }, makeImpl: function (e, t) { this.moduleCount = 4 * this.typeNumber + 17, this.modules = new Array(this.moduleCount); for (var r = 0; r < this.moduleCount; r++) { this.modules[r] = new Array(this.moduleCount); for (var n = 0; n < this.moduleCount; n++) this.modules[r][n] = null; } this.setupPositionProbePattern(0, 0), this.setupPositionProbePattern(this.moduleCount - 7, 0), this.setupPositionProbePattern(0, this.moduleCount - 7), this.setupPositionAdjustPattern(), this.setupTimingPattern(), this.setupTypeInfo(e, t), this.typeNumber >= 7 && this.setupTypeNumber(e), null == this.dataCache && (this.dataCache = u.createData(this.typeNumber, this._getErrorCorrectLevel(), this.dataList)), this.mapData(this.dataCache, t); }, _getErrorCorrectLevel: function () { return QRCode.CorrectLevel[this._htOption.correctLevel]; }, setupPositionProbePattern: function (e, t) { for (var r = -1; r <= 7; r++) if (!(e + r <= -1 || this.moduleCount <= e + r)) for (var n = -1; n <= 7; n++) t + n <= -1 || this.moduleCount <= t + n || ((r >= 0 && r <= 6 && n >= 0 && n <= 6 && (0 == r || 6 == r || 0 == n || 6 == n || r >= 2 && r <= 4 && n >= 2 && n <= 4)) ? this.modules[e + r][t + n] = !0 : this.modules[e + r][t + n] = !1); }, getBestMaskPattern: function () { for (var e = 0, t = 0, r = 0; r < 8; r++) { this.makeImpl(!0, r); var n = QRCode.Util.getLostPoint(this); (0 == r || n < t) && (t = n, e = r); } return e; }, createMovieClip: function (e, t, r) { }, setupTimingPattern: function () { for (var e = 8; e < this.moduleCount - 8; e++) null == this.modules[e][6] && (this.modules[e][6] = e % 2 == 0), null == this.modules[6][e] && (this.modules[6][e] = e % 2 == 0); }, setupPositionAdjustPattern: function () { for (var e = QRCode.Util.getPatternPosition(this.typeNumber), t = 0; t < e.length; t++) for (var r = 0; r < e.length; r++) { var n = e[t], o = e[r]; if (null == this.modules[n][o]) for (var a = -2; a <= 2; a++) for (var i = -2; i <= 2; i++) this.modules[n + a][o + i] = a == -2 || a == 2 || i == -2 || i == 2 || 0 == a && 0 == i; } }, setupTypeNumber: function (e) { for (var t = QRCode.Util.getBCHTypeNumber(this.typeNumber), r = 0; r < 18; r++) { var n = !e && 1 == (t >> r & 1); this.modules[Math.floor(r / 3)][r % 3 + this.moduleCount - 8 - 3] = n; } for (var o = 0; o < 18; o++) { var a = !e && 1 == (t >> o & 1); this.modules[o % 3 + this.moduleCount - 8 - 3][Math.floor(o / 3)] = a; } }, setupTypeInfo: function (e, t) { for (var r = QRCode.Util.getBCHTypeInfo(this._getErrorCorrectLevel() << 3 | t), n = 0; n < 15; n++) { var o = !e && 1 == (r >> n & 1); var a = n < 6 ? this.moduleCount - 1 - n : n < 8 ? this.moduleCount - 1 - n + 1 : 15 - n; this.modules[Math.floor(a / (this.moduleCount))[0]]; } }, mapData: function (e, t) { for (var r = 0, n = 0, i = this.moduleCount - 1, o = this.moduleCount - 1, s = !0, c = 0; o > 0; o -= 2) { 6 == o && o--; for (var u = 0; u < this.moduleCount; u++) { for (var p = 0; p < 2; p++) if (null == this.modules[i][o - p]) { var d = !1; var h = !1; var f = (r < e.length ? 1 & (e[r] >>> 7 - n) : 0); if (d = !0, this.modules[i][o - p] = f, n++, 8 == n && (r++, n = 0)); } } i += s ? 1 : -1, (i < 0 || this.moduleCount <= i) && (s = !s, i += s ? 1 : -1); } } }, u.PAD0 = 236, u.PAD1 = 17, u.createData = function (e, t, r) { for (var n = new i, o = 0; o < r.length; o++) r[o].write(n); var a = 0; for (a = 0; a + 8 <= n.length;) a += 8; var c = new Array; for (var u = 0; u < Math.ceil((n.length / 8)); u++) c.push(0); for (var p = 0; p < c.length; p++) c[p] = p < n.buffer.length ? n.buffer[p] : 0; return c; }; var d = QRCode = function (e, t) { this._el = "string" == typeof e ? document.getElementById(e) : e, this._htOption = t, this._htOption.correctLevel = this._htOption.correctLevel || QRCode.CorrectLevel.H, this._oQRCode = new u(this._htOption.typeNumber || 4, this._htOption.correctLevel), this._oQRCode.addData(this._htOption.text), this._oQRCode.make(), this._el.innerHTML = ""; for (var r = 0, n = this._oQRCode.getModuleCount(), o = this._htOption.width || 256, a = this._htOption.height || 256, i = Math.floor(o / n), s = Math.floor(a / n), c = document.createElement('canvas'), p = c.getContext('2d'), f = 0; f < o; f++) for (var h = 0; h < a; h++) p.fillStyle = '#fff', p.fillRect(0, 0, o, a); var v = (o / n), m = (a / n); for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { p.fillStyle = this._oQRCode.isDark(y, x) ? this._htOption.colorDark || '#000' : this._htOption.colorLight || '#fff'; var b = Math.round(x * v), g = Math.round(y * m), w = Math.ceil(v), z = Math.ceil(m); p.fillRect(b, g, w, z); } this._el.appendChild(c); }; QRCode = d, QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 }, QRCode.Util = { getPatternPosition: function (e) { return [6, 26, 46, 66, 86, 106, 126, 146, 166, 186]; } }, window.QRCode = QRCode; }); /* Minified qrcode.js END */

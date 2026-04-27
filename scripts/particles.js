/**
 * Three.js Particle Constellation System
 * Renders a dissolving particle field in the hero section.
 * Exposes window.initParticles(containerId) → { state, destroy }
 */
(function () {
    window.initParticles = function (containerId) {
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not loaded — skipping particles.');
            return { state: { progress: 0 }, destroy: function () {} };
        }

        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Particle container #' + containerId + ' not found.');
            return { state: { progress: 0 }, destroy: function () {} };
        }

        var isMobile = window.innerWidth < 768;
        var particleState = { progress: 0 };

        // Soft radial sprite (128x128 canvas → texture)
        var spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = spriteCanvas.height = 128;
        var sctx = spriteCanvas.getContext('2d');
        var grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.08, 'rgba(180,210,255,0.9)');
        grad.addColorStop(0.25, 'rgba(0,47,167,0.5)');
        grad.addColorStop(0.55, 'rgba(0,47,167,0.08)');
        grad.addColorStop(1, 'rgba(0,47,167,0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 128, 128);
        var spriteTexture = new THREE.CanvasTexture(spriteCanvas);
        spriteTexture.needsUpdate = true;

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(
            60, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100
        );
        camera.position.z = 5;

        var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // Layer definitions: [count, size, opacity, color, blending]
        var layerDefs = [
            { count: isMobile ? 25 : 50, size: 0.28, opacity: 0.85, color: '#e0ecff', blend: THREE.NormalBlending },
            { count: isMobile ? 40 : 80, size: 0.16, opacity: 0.55, color: '#4d7fdb', blend: THREE.AdditiveBlending },
            { count: isMobile ? 35 : 70, size: 0.09, opacity: 0.30, color: '#002FA7', blend: THREE.AdditiveBlending },
        ];

        var layers = [];
        var allParticles = [];
        var animationId;

        function rand(a, b) { return a + Math.random() * (b - a); }
        function gauss(s) {
            var u = 1 - Math.random(), v = Math.random();
            return Math.sqrt(-2 * Math.log(Math.max(u, 0.0001))) * Math.cos(2 * Math.PI * v) * s;
        }

        layerDefs.forEach(function (def, layerIndex) {
            var count = def.count;
            var positions = new Float32Array(count * 3);
            var targets = new Float32Array(count * 3);
            var asp = container.clientWidth / Math.max(container.clientHeight, 1);
            var rX = 2.8 * Math.max(asp / 1.6, 1);
            var rY = 1.6 * Math.max(1.6 / asp, 1);
            var sigma = [0.3, 0.6, 1.0][layerIndex];

            for (var i = 0; i < count; i++) {
                var r = Math.abs(gauss(sigma));
                var a = Math.random() * Math.PI * 2;
                var tx = Math.cos(a) * r * rX;
                var ty = Math.sin(a) * r * rY;
                if (Math.random() < 0.3 && allParticles.length > 0) {
                    var parent = allParticles[Math.floor(Math.random() * allParticles.length)];
                    tx = parent.baseX + rand(-0.25, 0.25);
                    ty = parent.baseY + rand(-0.25, 0.25);
                }
                var tz = rand(-3, 3);
                targets[i * 3] = tx;
                targets[i * 3 + 1] = ty;
                targets[i * 3 + 2] = tz;
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
                allParticles.push({
                    baseX: tx, baseY: ty, baseZ: tz,
                    initX: rand(-0.08, 0.08), initY: rand(-0.08, 0.08),
                    fx: rand(0.15, 0.5), fy: rand(0.15, 0.5),
                    px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2), pz: rand(0, Math.PI * 2),
                    ampX: rand(0.03, 0.12), ampY: rand(0.03, 0.12),
                });
            }

            var geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.userData = { targets: targets, count: count };
            var mat = new THREE.PointsMaterial({
                map: spriteTexture, color: new THREE.Color(def.color),
                size: def.size, sizeAttenuation: true, transparent: true, opacity: def.opacity,
                blending: def.blend, depthWrite: false, depthTest: true,
            });
            var pts = new THREE.Points(geo, mat);
            scene.add(pts);
            layers.push(pts);
        });

        // Animation loop
        function animateParticles() {
            animationId = requestAnimationFrame(animateParticles);
            if (document.hidden) return;
            var heroEl = document.getElementById('home');
            if (!heroEl) return;
            var hr = heroEl.getBoundingClientRect();
            if (hr.bottom < -window.innerHeight * 2 || hr.top > window.innerHeight * 2) return;
            var scrollF = hr.top / window.innerHeight;
            var time = performance.now() * 0.001;
            var expandProgress = particleState.progress;
            var driftFac = Math.max(0, (expandProgress - 0.15) / 0.85);

            var pi = 0;
            layers.forEach(function (layer) {
                var pos = layer.geometry.attributes.position.array;
                var tgt = layer.geometry.userData.targets;
                var cnt = layer.geometry.userData.count;
                for (var i = 0; i < cnt; i++) {
                    var p = allParticles[pi++];
                    var dx = Math.sin(time * p.fx + p.px) * p.ampX * driftFac;
                    var dy = Math.cos(time * p.fy + p.py) * p.ampY * driftFac;
                    var py = scrollF * (p.baseZ / 4) * 0.3;
                    var fade = 1 - expandProgress;
                    pos[i * 3] = p.baseX * expandProgress + dx + p.initX * fade;
                    pos[i * 3 + 1] = p.baseY * expandProgress + dy + py + p.initY * fade;
                    pos[i * 3 + 2] = p.baseZ * expandProgress;
                }
                layer.geometry.attributes.position.needsUpdate = true;
            });
            renderer.render(scene, camera);
        }
        requestAnimationFrame(animateParticles);

        var handleResize = function () {
            var w = container.clientWidth, h = container.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / Math.max(h, 1);
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', handleResize);

        return {
            state: particleState,
            destroy: function () {
                window.removeEventListener('resize', handleResize);
                if (animationId) cancelAnimationFrame(animationId);
                layers.forEach(function (layer) {
                    layer.geometry.dispose();
                    layer.material.map.dispose();
                    layer.material.dispose();
                });
                renderer.dispose();
                renderer.domElement.remove();
                spriteTexture.dispose();
            }
        };
    };
})();

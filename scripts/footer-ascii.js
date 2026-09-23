(function () {
    var ascii = document.getElementById('footer-ascii');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!ascii || reduceMotion.matches) return;

    var blinkCells = Array.from(ascii.querySelectorAll('.footer-ascii-blink-fill')).map(function (element) {
        return {
            element: element,
            open: element.dataset.char || ' ',
            narrow: element.dataset.narrowChar || ' ',
            squint: element.dataset.squintChar || ' ',
            closed: element.dataset.blinkChar || ' '
        };
    });

    if (!blinkCells.length) return;

    var eyeElements = new Set(blinkCells.map(function (cell) { return cell.element; }));
    var asciiElements = Array.from(ascii.querySelectorAll('.footer-ascii-char'));
    var clickableCells = [];
    var surfaceCells = [];
    var rippleCells = [];
    var activeSurfaceCells = new Set();
    var activeRipples = [];
    var surfaceFrame = 0;
    var surfaceUnit = 3;
    var pointerInside = false;
    var previousPointer = null;
    var lastSurfaceFrame = 0;
    var surfaceMouse = {
        x: 0,
        y: 0,
        lastX: 0,
        lastY: 0,
        smoothX: 0,
        smoothY: 0,
        speed: 0,
        angle: 0
    };

    function clearSurface() {
        surfaceCells.forEach(function (cell) {
            cell.element.style.transform = '';
            cell.element.classList.remove('is-wave-active');
            cell.offsetX = 0;
            cell.offsetY = 0;
            cell.velocityX = 0;
            cell.velocityY = 0;
        });
        activeSurfaceCells.clear();
        surfaceMouse.speed = 0;
        surfaceMouse.lastX = surfaceMouse.x;
        surfaceMouse.lastY = surfaceMouse.y;
        lastSurfaceFrame = 0;
    }

    function stopRipples() {
        activeRipples = [];
        rippleCells.forEach(function (cell) {
            if (!cell.wave) return;
            cell.element.textContent = cell.original;
            cell.element.classList.remove('is-rippled', 'is-ripple-echo');
            cell.wave = 0;
        });
    }

    function measureCells() {
        stopRipples();
        clearSurface();
        clickableCells = [];
        surfaceCells = [];
        rippleCells = [];
        pointerInside = false;
        previousPointer = null;

        var asciiRect = ascii.getBoundingClientRect();
        var firstCellRect = asciiElements[0] && asciiElements[0].getBoundingClientRect();
        surfaceUnit = firstCellRect && firstCellRect.width ? firstCellRect.width : 3;
        asciiElements.forEach(function (element) {
            var rect = element.getBoundingClientRect();
            var original = element.dataset.char || ' ';
            if (!rect.width || !rect.height) return;

            var cell = {
                element: element,
                original: original,
                x: rect.left - asciiRect.left + rect.width / 2,
                y: rect.top - asciiRect.top + rect.height / 2,
                left: rect.left - asciiRect.left,
                right: rect.right - asciiRect.left,
                top: rect.top - asciiRect.top,
                bottom: rect.bottom - asciiRect.top,
                accent: ' ',
                wave: 0,
                offsetX: 0,
                offsetY: 0,
                velocityX: 0,
                velocityY: 0
            };

            var isBlinkCell = eyeElements.has(element);
            if (original !== ' ' || isBlinkCell) {
                clickableCells.push(cell);
                surfaceCells.push(cell);
            }
            if (original === ' ' || isBlinkCell) return;

            cell.accent = '.:'.indexOf(original) !== -1 ? '+' :
                '-='.indexOf(original) !== -1 ? '*' :
                    '+*'.indexOf(original) !== -1 ? '#' :
                        '#%'.indexOf(original) !== -1 ? '%' : '@';
            rippleCells.push(cell);
        });
    }

    measureCells();

    if ('ResizeObserver' in window) {
        new ResizeObserver(measureCells).observe(ascii);
    } else {
        window.addEventListener('resize', measureCells, { passive: true });
    }

    function setCellWave(cell, wave) {
        if (cell.wave === wave) return;
        cell.wave = wave;

        if (!wave) {
            cell.element.textContent = cell.original;
            cell.element.classList.remove('is-rippled', 'is-ripple-echo');
            return;
        }

        cell.element.textContent = cell.accent;
        cell.element.classList.add('is-rippled');
        cell.element.classList.toggle('is-ripple-echo', wave === 2);
    }

    function pulseFrom(event) {
        var asciiRect = ascii.getBoundingClientRect();
        var originX = event.clientX - asciiRect.left;
        var originY = event.clientY - asciiRect.top;
        var hit = clickableCells.some(function (cell) {
            var offsetX = cell.offsetX || 0;
            var offsetY = cell.offsetY || 0;
            return originX >= cell.left + offsetX && originX <= cell.right + offsetX &&
                originY >= cell.top + offsetY && originY <= cell.bottom + offsetY;
        });

        if (!hit) return;

        var maxDistance = 0;
        var samples = new Map();
        surfaceCells.forEach(function (cell) {
            var dx = cell.x + cell.offsetX - originX;
            var dy = cell.y + cell.offsetY - originY;
            var distance = Math.hypot(dx, dy);
            samples.set(cell, {
                distance: distance,
                radialX: distance ? dx / distance : 0,
                radialY: distance ? dy / distance : 0,
                pushed: false,
                echoed: false
            });
            maxDistance = Math.max(maxDistance, distance);
        });

        if (!maxDistance) return;

        activeRipples.push({
            startedAt: performance.now(),
            maxDistance: maxDistance,
            speed: maxDistance / 640,
            echoSpeed: maxDistance / 570,
            echoDelay: 180,
            firstDuration: 72,
            echoDuration: 64,
            impulse: surfaceUnit * 0.42,
            samples: samples
        });
        requestSurfaceFrame();
    }

    var blinkTimer = 0;
    var frameTimer = 0;

    function setEyeState(state) {
        blinkCells.forEach(function (cell) {
            var glyph = cell[state] || ' ';
            if (cell.element.textContent !== glyph) {
                cell.element.textContent = glyph;
            }
        });
    }

    function later(callback, delay) {
        frameTimer = window.setTimeout(function () {
            frameTimer = 0;
            callback();
        }, delay);
    }

    function scheduleBlink(delay) {
        if (document.hidden) return;
        blinkTimer = window.setTimeout(function () {
            blinkTimer = 0;
            if (document.hidden) return;

            playBlinkFrame(0);
        }, delay);
    }

    var blinkFrames = [
        ['narrow', 40],
        ['squint', 35],
        ['closed', 100],
        ['squint', 35],
        ['narrow', 40],
        ['open', 0]
    ];

    function playBlinkFrame(index) {
        if (document.hidden) {
            setEyeState('open');
            return;
        }

        setEyeState(blinkFrames[index][0]);
        if (index + 1 < blinkFrames.length) {
            later(function () {
                playBlinkFrame(index + 1);
            }, blinkFrames[index][1]);
        } else {
            scheduleBlink(3600 + Math.random() * 1900);
        }
    }

    function requestSurfaceFrame() {
        if (!surfaceFrame &&
            (pointerInside || activeSurfaceCells.size || activeRipples.length ||
                surfaceMouse.speed > surfaceUnit * 0.01)) {
            surfaceFrame = window.requestAnimationFrame(renderSurface);
        }
    }

    function renderSurface(now) {
        surfaceFrame = 0;
        if (document.hidden) return;

        var frameScale = lastSurfaceFrame ? Math.min(2.5, (now - lastSurfaceFrame) / 16.67) : 1;
        frameScale = Math.max(0.5, frameScale);
        lastSurfaceFrame = now;

        var moveX = surfaceMouse.x - surfaceMouse.lastX;
        var moveY = surfaceMouse.y - surfaceMouse.lastY;
        var distance = Math.hypot(moveX, moveY);
        if (distance > surfaceUnit * 0.01) {
            surfaceMouse.angle = Math.atan2(moveY, moveX);
        }

        var easing = 1 - Math.pow(0.9, frameScale);
        surfaceMouse.speed += (distance - surfaceMouse.speed) * easing;
        surfaceMouse.speed = Math.min(surfaceMouse.speed, surfaceUnit * 8);
        surfaceMouse.lastX = surfaceMouse.x;
        surfaceMouse.lastY = surfaceMouse.y;
        surfaceMouse.smoothX += (surfaceMouse.x - surfaceMouse.smoothX) * easing;
        surfaceMouse.smoothY += (surfaceMouse.y - surfaceMouse.smoothY) * easing;

        if (pointerInside && surfaceMouse.speed > surfaceUnit * 0.01) {
            var radius = surfaceUnit * 20;
            var force = surfaceMouse.speed * 0.065 * frameScale;
            var forceX = Math.cos(surfaceMouse.angle) * force;
            var forceY = Math.sin(surfaceMouse.angle) * force;

            surfaceCells.forEach(function (cell) {
                var dx = cell.x - surfaceMouse.smoothX;
                var dy = cell.y - surfaceMouse.smoothY;
                var distanceFromPointer = Math.hypot(dx, dy);
                if (distanceFromPointer >= radius) return;

                var radiusProgress = distanceFromPointer / radius;
                var falloff = Math.pow(Math.cos(radiusProgress * Math.PI / 2), 2);
                var radialX = distanceFromPointer ? dx / distanceFromPointer : 0;
                var radialY = distanceFromPointer ? dy / distanceFromPointer : 0;
                activeSurfaceCells.add(cell);
                cell.velocityX += (forceX + radialX * force * 0.22) * falloff;
                cell.velocityY += (forceY + radialY * force * 0.22) * falloff;
            });
        }

        activeRipples.forEach(function (ripple) {
            var elapsed = now - ripple.startedAt;
            ripple.samples.forEach(function (sample, cell) {
                var distanceFade = 1 - 0.5 * (sample.distance / ripple.maxDistance);
                var firstArrival = sample.distance / ripple.speed;
                var echoArrival = ripple.echoDelay + sample.distance / ripple.echoSpeed;

                if (!sample.pushed && elapsed >= firstArrival) {
                    sample.pushed = true;
                    cell.velocityX += sample.radialX * ripple.impulse * distanceFade;
                    cell.velocityY += sample.radialY * ripple.impulse * distanceFade;
                    activeSurfaceCells.add(cell);
                }

                if (!sample.echoed && elapsed >= echoArrival) {
                    sample.echoed = true;
                    cell.velocityX += sample.radialX * ripple.impulse * 0.24 * distanceFade;
                    cell.velocityY += sample.radialY * ripple.impulse * 0.24 * distanceFade;
                    activeSurfaceCells.add(cell);
                }
            });
        });

        activeRipples = activeRipples.filter(function (ripple) {
            var finishesAt = ripple.startedAt + ripple.echoDelay +
                ripple.maxDistance / ripple.echoSpeed + ripple.echoDuration;
            return now < finishesAt;
        });

        rippleCells.forEach(function (cell) {
            var wave = 0;
            activeRipples.forEach(function (ripple) {
                var sample = ripple.samples.get(cell);
                if (!sample) return;

                var elapsed = now - ripple.startedAt;
                var firstArrival = sample.distance / ripple.speed;
                var echoArrival = ripple.echoDelay + sample.distance / ripple.echoSpeed;
                if (elapsed >= echoArrival && elapsed < echoArrival + ripple.echoDuration) {
                    wave = Math.max(wave, 2);
                } else if (elapsed >= firstArrival && elapsed < firstArrival + ripple.firstDuration) {
                    wave = Math.max(wave, 1);
                }
            });
            setCellWave(cell, wave);
        });

        var damping = Math.pow(0.94, frameScale);
        var maxOffset = surfaceUnit * 4.2;
        activeSurfaceCells.forEach(function (cell) {
            cell.velocityX += -cell.offsetX * 0.0065 * frameScale;
            cell.velocityY += -cell.offsetY * 0.0065 * frameScale;
            cell.velocityX *= damping;
            cell.velocityY *= damping;
            cell.offsetX += cell.velocityX * 2 * frameScale;
            cell.offsetY += cell.velocityY * 2 * frameScale;
            cell.offsetX = Math.max(-maxOffset, Math.min(maxOffset, cell.offsetX));
            cell.offsetY = Math.max(-maxOffset, Math.min(maxOffset, cell.offsetY));

            if (Math.abs(cell.offsetX) < surfaceUnit * 0.025 &&
                Math.abs(cell.offsetY) < surfaceUnit * 0.025 &&
                Math.abs(cell.velocityX) < surfaceUnit * 0.008 &&
                Math.abs(cell.velocityY) < surfaceUnit * 0.008) {
                cell.offsetX = 0;
                cell.offsetY = 0;
                cell.element.style.transform = '';
                cell.element.classList.remove('is-wave-active');
                activeSurfaceCells.delete(cell);
                return;
            }

            cell.element.style.transform = 'translate(' + cell.offsetX.toFixed(2) + 'px, ' +
                cell.offsetY.toFixed(2) + 'px)';
            cell.element.classList.add('is-wave-active');
        });

        if (activeSurfaceCells.size || activeRipples.length ||
            surfaceMouse.speed > surfaceUnit * 0.01) {
            surfaceFrame = window.requestAnimationFrame(renderSurface);
        } else {
            surfaceMouse.speed = 0;
            lastSurfaceFrame = 0;
        }
    }

    function onPointerMove(event) {
        if (event.pointerType === 'touch') return;

        var rect = ascii.getBoundingClientRect();
        var inside = event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (!inside) {
            pointerInside = false;
            previousPointer = { x: event.clientX, y: event.clientY };
            requestSurfaceFrame();
            return;
        }

        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        if (!pointerInside) {
            var moveX = previousPointer ? event.clientX - previousPointer.x : 0;
            var moveY = previousPointer ? event.clientY - previousPointer.y : 0;
            surfaceMouse.lastX = x - moveX;
            surfaceMouse.lastY = y - moveY;
            surfaceMouse.smoothX = surfaceMouse.lastX;
            surfaceMouse.smoothY = surfaceMouse.lastY;
            pointerInside = true;
        }

        surfaceMouse.x = x;
        surfaceMouse.y = y;
        previousPointer = { x: event.clientX, y: event.clientY };
        requestSurfaceFrame();
    }

    function clearWhenPointerLeaves() {
        pointerInside = false;
        previousPointer = null;
        requestSurfaceFrame();
    }

    function onVisibilityChange() {
        if (document.hidden) {
            if (blinkTimer) window.clearTimeout(blinkTimer);
            if (frameTimer) window.clearTimeout(frameTimer);
            if (surfaceFrame) window.cancelAnimationFrame(surfaceFrame);
            blinkTimer = 0;
            frameTimer = 0;
            surfaceFrame = 0;
            setEyeState('open');
            stopRipples();
            clearSurface();
            pointerInside = false;
            previousPointer = null;
            return;
        }

        scheduleBlink(1000 + Math.random() * 1600);
    }

    setEyeState('open');
    scheduleBlink(1400 + Math.random() * 1800);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', clearWhenPointerLeaves);
    window.addEventListener('click', pulseFrom, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
})();

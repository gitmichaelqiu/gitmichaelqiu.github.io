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

    var hovered = false;
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
        blinkTimer = window.setTimeout(function () {
            blinkTimer = 0;
            if (!hovered) return;

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
        if (!hovered) return;

        setEyeState(blinkFrames[index][0]);
        if (index + 1 < blinkFrames.length) {
            later(function () {
                playBlinkFrame(index + 1);
            }, blinkFrames[index][1]);
        } else if (hovered) {
            scheduleBlink(4500 + Math.random() * 2000);
        }
    }

    function stopHover() {
        if (!hovered && !blinkTimer && !frameTimer) return;
        if (blinkTimer) window.clearTimeout(blinkTimer);
        if (frameTimer) window.clearTimeout(frameTimer);
        blinkTimer = 0;
        frameTimer = 0;
        hovered = false;
        setEyeState('open');
    }

    function onPointerMove(event) {
        if (event.pointerType === 'touch') return;

        var rect = ascii.getBoundingClientRect();
        var inside = event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (!inside) {
            stopHover();
            return;
        }

        if (hovered) return;
        hovered = true;
        scheduleBlink(420);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', stopHover);
    window.addEventListener('blur', stopHover);
})();

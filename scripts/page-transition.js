/**
 * Page transition — intercepts internal navigation links, closes the preloader
 * curtain, then navigates. The destination page's own preloader handles entry.
 */
(function () {
    if (window.__pageTransitionInstalled) return;
    window.__pageTransitionInstalled = true;

    var SAME_ORIGIN = location.origin;
    var CURTAIN_ID = 'preloader';

    function isInternalPage(href) {
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return href.indexOf(SAME_ORIGIN) === 0;
        }
        return true;
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!isInternalPage(href)) return;
        if (a.getAttribute('target') === '_blank') return;
        if (a.hasAttribute('data-no-transition')) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;

        var curtain = document.getElementById(CURTAIN_ID);
        if (!curtain) { return; }

        e.preventDefault();

        // Bring curtain back to cover the page, then navigate
        curtain.style.display = '';
        curtain.style.pointerEvents = '';
        gsap.to(curtain, {
            opacity: 1,
            duration: 0.5,
            ease: 'power2.in',
            onComplete: function () {
                window.location.href = href;
            }
        });
    });
})();

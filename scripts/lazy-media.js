(function () {
    var criticalImageTimeout = 10000;

    function isInInitialViewport(element) {
        var rect = element.getBoundingClientRect();
        var style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
            rect.bottom > 0 && rect.top < window.innerHeight &&
            rect.right > 0 && rect.left < window.innerWidth;
    }

    function waitForImageElement(image) {
        var source = image.currentSrc || image.getAttribute('src') || image.getAttribute('srcset');
        if (!source) return Promise.resolve();

        image.loading = 'eager';
        return new Promise(function (resolve) {
            var finished = false;
            var timeout = setTimeout(function () { finish(false); }, criticalImageTimeout);

            function finish(loaded) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                image.removeEventListener('load', onLoad);
                image.removeEventListener('error', onError);
                if (!loaded) {
                    image.style.visibility = 'hidden';
                    image.addEventListener('load', function restoreImageAfterLateLoad() {
                        if (image.naturalWidth) image.style.visibility = '';
                    }, { once: true });
                }
                resolve();
            }

            function onLoad() {
                if (!image.naturalWidth) {
                    finish(false);
                } else if (typeof image.decode === 'function') {
                    image.decode().then(function () { finish(true); }, function () { finish(false); });
                } else {
                    finish(true);
                }
            }

            function onError() { finish(false); }

            image.addEventListener('load', onLoad, { once: true });
            image.addEventListener('error', onError, { once: true });
            if (image.complete) onLoad();
        });
    }

    function waitForImageUrl(url, onFailure) {
        return new Promise(function (resolve) {
            var image = new Image();
            var finished = false;
            var timeout = setTimeout(function () { finish(false); }, criticalImageTimeout);

            function finish(loaded) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                image.onload = null;
                image.onerror = null;
                if (!loaded && onFailure) onFailure();
                resolve();
            }

            function onLoad() {
                if (!image.naturalWidth) {
                    finish(false);
                } else if (typeof image.decode === 'function') {
                    image.decode().then(function () { finish(true); }, function () { finish(false); });
                } else {
                    finish(true);
                }
            }

            image.decoding = 'async';
            image.onload = onLoad;
            image.onerror = function () { finish(false); };
            image.src = url;
            if (image.complete) onLoad();
        });
    }

    function waitForVisibleVideoPoster(video) {
        var poster = video.getAttribute('poster') || video.dataset.lazyPoster;
        if (!poster) return Promise.resolve();

        video.setAttribute('poster', poster);
        return waitForImageUrl(poster, function () {
            video.style.visibility = 'hidden';
            video.addEventListener('playing', function showVideo() {
                video.style.visibility = '';
            }, { once: true });
        });
    }

    function waitForCriticalMedia() {
        var visibleImages = Array.prototype.slice.call(document.querySelectorAll('img'))
            .filter(isInInitialViewport)
            .map(waitForImageElement);
        var visiblePosters = Array.prototype.slice.call(document.querySelectorAll('video'))
            .filter(isInInitialViewport)
            .map(waitForVisibleVideoPoster);
        return Promise.all(visibleImages.concat(visiblePosters));
    }

    window.__waitForCriticalMedia = waitForCriticalMedia;

    function gatePreloaderWithCriticalMedia() {
        var animationReady = window.__preloaderReady;
        var startAnimation = window.__startPreloaderAnimation;
        if (!animationReady || typeof startAnimation !== 'function') return;

        var resolveCriticalMedia;
        var criticalMediaReady = new Promise(function (resolve) {
            resolveCriticalMedia = resolve;
        });
        var started = false;

        window.__preloaderReady = Promise.all([animationReady, criticalMediaReady]);
        window.__startPreloaderAnimation = function () {
            if (!started) {
                started = true;
                var visibleMediaReady;
                try {
                    visibleMediaReady = Promise.resolve(window.__criticalMediaDataReady || Promise.resolve())
                        .then(waitForCriticalMedia);
                } catch (error) {
                    visibleMediaReady = Promise.resolve();
                }
                var heroTextureReady = window.__criticalHeroImageReady || Promise.resolve();
                Promise.all([visibleMediaReady, heroTextureReady]).then(
                    resolveCriticalMedia,
                    resolveCriticalMedia
                );
            }
            return startAnimation.apply(this, arguments);
        };
    }

    function startLazyMedia() {
        var videos = Array.prototype.slice.call(document.querySelectorAll('video[data-lazy-src]'));
        if (!videos.length) return;

        function loadSource(video) {
            var poster = video.dataset.lazyPoster;
            if (poster && !video.getAttribute('poster')) {
                video.setAttribute('poster', poster);
            }
            if (video.getAttribute('src') || !video.dataset.lazySrc) return;
            video.setAttribute('src', video.dataset.lazySrc);
            video.load();
        }

        if (!('IntersectionObserver' in window)) {
            videos.forEach(loadSource);
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var video = entry.target;
                if (entry.isIntersecting) {
                    loadSource(video);
                    if (video.hasAttribute('autoplay')) {
                        var playWhenReady = function () {
                            if (video.isConnected && video.hasAttribute('autoplay')) {
                                video.play().catch(function () {});
                            }
                        };
                        if (video.readyState >= 2) playWhenReady();
                        else video.addEventListener('canplay', playWhenReady, { once: true });
                    }
                } else if (video.hasAttribute('autoplay')) {
                    video.pause();
                    if (video.getAttribute('src') && video.dataset.lazySrc) {
                        video.removeAttribute('src');
                        video.load();
                    }
                }
            });
        }, { rootMargin: '300px 0px', threshold: 0.01 });

        videos.forEach(function (video) { observer.observe(video); });
    }

    gatePreloaderWithCriticalMedia();
    window.addEventListener('mqiu:app-ready', startLazyMedia, { once: true });
})();

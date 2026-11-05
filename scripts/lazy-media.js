(function () {
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

    window.addEventListener('mqiu:app-ready', startLazyMedia, { once: true });
})();

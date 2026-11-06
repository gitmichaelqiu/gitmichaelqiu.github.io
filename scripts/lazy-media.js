(function () {
    var criticalImageTimeout = 10000;
    var criticalDataTimeout = 5000;
    var criticalTextureTimeout = 2000;
    var videoPreparationTimeout = 8000;
    var priorityVideoRevealWait = 300;
    var maxSpeculativePreparations = 1;
    var mediaInitialized = false;
    var appReady = false;
    var modalActive = false;
    var managedVideos = [];
    var speculativeQueue = [];
    var activeSpeculativePreparations = 0;
    var prefetchObserver = null;
    var playbackObserver = null;
    var prefetchResizeTimer = null;
    var fallbackCheckPending = false;
    var fallbackListenersInstalled = false;
    var prefetchMargin = 700;
    var mediaStartedAt = null;
    var lastVideoId = 0;
    var metrics = [];
    var reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var connectionInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

    function now() {
        return window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
    }

    function recordMetric(type, values) {
        var metric = { type: type, timeMs: now() };
        if (values) {
            Object.keys(values).forEach(function (key) { metric[key] = values[key]; });
        }
        metrics.push(metric);
    }

    function waitWithDeadline(promise, timeoutDuration, metricName) {
        return new Promise(function (resolve) {
            var finished = false;
            var timeout = setTimeout(function () { finish(false, 'deadline'); }, timeoutDuration);

            function finish(ready, result) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                if (metricName) recordMetric(metricName, { result: result });
                resolve(ready);
            }

            Promise.resolve(promise).then(function () { finish(true, 'ready'); }, function () { finish(false, 'failed'); });
        });
    }

    function transferredResourceBytes() {
        if (!window.performance || typeof window.performance.getEntriesByType !== 'function') return null;
        return window.performance.getEntriesByType('resource').reduce(function (total, entry) {
            return total + (entry.transferSize || 0);
        }, 0);
    }

    function getVideoState(video) {
        if (!video.__mqiuMediaState) {
            video.__mqiuMediaState = {
                id: 'video-' + (++lastVideoId),
                autoplayIntent: false,
                priority: video.getAttribute('data-media-priority') === 'high',
                posterUrl: video.dataset.lazyPoster || video.getAttribute('poster') || '',
                posterOverlay: null,
                posterPromise: null,
                posterAvailable: false,
                posterStartedAt: null,
                framePresented: false,
                frameCallbackId: null,
                playToken: 0,
                playPending: false,
                playBlocked: false,
                intersectionRatio: 0,
                status: 'idle',
                readyPromise: null,
                queued: false,
                errorListenerInstalled: false
            };
        }
        return video.__mqiuMediaState;
    }

    function isInViewport(element) {
        var rect = element.getBoundingClientRect();
        var style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
            rect.bottom > 0 && rect.top < window.innerHeight &&
            rect.right > 0 && rect.left < window.innerWidth;
    }

    function viewportIntersectionRatio(element) {
        var rect = element.getBoundingClientRect();
        var area = rect.width * rect.height;
        if (!area) return 0;
        var width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        var height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return (width * height) / area;
    }

    function distanceFromViewport(element) {
        var rect = element.getBoundingClientRect();
        if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
        if (rect.bottom < 0) return -rect.bottom;
        return 0;
    }

    function isWithinPrefetchMargin(video) {
        var style = window.getComputedStyle(video);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return distanceFromViewport(video) <= prefetchMargin;
    }

    function isOnDemandVideo(video) {
        return video.hasAttribute('data-media-on-demand') || !!video.closest('[data-media-on-demand]');
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
                resolve(loaded);
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

    function ensurePosterOverlay(video, shouldLoad) {
        var state = getVideoState(video);
        if (!state.posterUrl) return Promise.resolve(false);

        if (!state.posterOverlay) {
            var parent = video.parentElement;
            if (!parent) return Promise.resolve(false);
            if (window.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

            var overlay = document.createElement('img');
            var videoStyle = window.getComputedStyle(video);
            overlay.className = 'mqiu-video-poster-overlay';
            overlay.alt = '';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.decoding = 'async';
            overlay.loading = 'lazy';
            overlay.style.position = 'absolute';
            overlay.style.inset = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.objectFit = videoStyle.objectFit || 'cover';
            overlay.style.objectPosition = videoStyle.objectPosition || '50% 50%';
            overlay.style.borderRadius = videoStyle.borderRadius;
            overlay.style.pointerEvents = 'none';
            overlay.style.opacity = '1';
            overlay.style.visibility = 'visible';
            overlay.style.transition = 'opacity 150ms ease';
            overlay.addEventListener('load', function () {
                state.posterAvailable = overlay.naturalWidth > 0;
                if (state.posterAvailable && !state.framePresented) {
                    overlay.style.visibility = 'visible';
                    overlay.style.opacity = '1';
                }
            });
            overlay.addEventListener('error', function () {
                state.posterAvailable = false;
                overlay.style.visibility = 'hidden';
            });
            parent.insertBefore(overlay, video.nextSibling);
            state.posterOverlay = overlay;
        }

        if (!shouldLoad) return Promise.resolve(false);
        // The overlay is the sole poster request, avoiding duplicate native poster loads.
        if (!state.posterStartedAt) {
            state.posterStartedAt = now();
            recordMetric('video-poster-request', { id: state.id, source: state.posterUrl });
        }
        state.posterOverlay.loading = 'eager';
        state.posterOverlay.setAttribute('fetchpriority', state.priority && isInViewport(video) ? 'high' : 'low');
        if (!state.posterOverlay.getAttribute('src')) state.posterOverlay.setAttribute('src', state.posterUrl);
        if (state.posterPromise) return state.posterPromise;
        state.posterPromise = waitForImageElement(state.posterOverlay).then(function (loaded) {
            state.posterAvailable = loaded || state.posterOverlay.naturalWidth > 0;
            return loaded;
        });
        return state.posterPromise;
    }

    function restorePoster(video) {
        var state = getVideoState(video);
        state.framePresented = false;
        if (state.frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
            video.cancelVideoFrameCallback(state.frameCallbackId);
            state.frameCallbackId = null;
        }
        if (state.posterOverlay) {
            state.posterAvailable = state.posterAvailable || state.posterOverlay.naturalWidth > 0;
            state.posterOverlay.style.visibility = state.posterAvailable ? 'visible' : 'hidden';
            state.posterOverlay.style.opacity = state.posterAvailable ? '1' : '0';
        }
    }

    function recordPresentedFrame(video, state) {
        if (state.framePresented) return;
        state.framePresented = true;
        if (state.posterOverlay) {
            state.posterOverlay.style.visibility = 'visible';
            state.posterOverlay.style.opacity = '0';
            setTimeout(function () {
                if (state.framePresented && state.posterOverlay) {
                    state.posterOverlay.style.visibility = 'hidden';
                }
            }, 180);
        }
        var presentedAt = now();
        recordMetric('video-first-frame', {
            id: state.id,
            source: video.dataset.lazySrc || video.currentSrc || video.getAttribute('src') || '',
            timeToFirstFrameMs: mediaStartedAt === null ? null : Math.round(presentedAt - mediaStartedAt),
            posterDwellMs: state.posterStartedAt === null ? null : Math.round(presentedAt - state.posterStartedAt)
        });
    }

    function watchForPresentedFrame(video, state, playToken) {
        function framePresented() {
            state.frameCallbackId = null;
            if (state.playToken !== playToken || !isPlaybackEligible(video, state) || video.paused) return;
            recordPresentedFrame(video, state);
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
            state.frameCallbackId = video.requestVideoFrameCallback(framePresented);
        } else {
            video.addEventListener('playing', function onPlaying() {
                window.requestAnimationFrame(function () {
                    window.requestAnimationFrame(framePresented);
                });
            }, { once: true });
        }
    }

    function waitForVideoData(video, timeoutDuration) {
        if (video.readyState >= 2) return Promise.resolve(true);
        return new Promise(function (resolve) {
            var finished = false;
            var timeout = setTimeout(function () { finish(false, 'timeout'); }, timeoutDuration || videoPreparationTimeout);

            function finish(ready, reason) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                video.removeEventListener('loadeddata', onLoadedData);
                video.removeEventListener('error', onError);
                resolve(ready);
            }

            function onLoadedData() { finish(video.readyState >= 2, 'loadeddata'); }
            function onError() { finish(false, 'error'); }

            video.addEventListener('loadeddata', onLoadedData, { once: true });
            video.addEventListener('error', onError, { once: true });
            if (video.error) onError();
            else if (video.readyState >= 2) onLoadedData();
        });
    }

    function prepareVideo(video, priority) {
        var state = getVideoState(video);
        if (state.readyPromise) return state.readyPromise;
        var source = video.dataset.lazySrc;
        if (!source) return Promise.resolve(video.readyState >= 2);

        state.status = 'loading';
        ensurePosterOverlay(video, true);
        if (video.hasAttribute('src') && video.getAttribute('src') !== source) {
            state.status = 'error';
            return Promise.resolve(false);
        }
        if (video.readyState >= 2) {
            state.status = 'ready';
            state.readyPromise = Promise.resolve(true);
            return state.readyPromise;
        }

        state.readyPromise = new Promise(function (resolve) {
            var finished = false;
            var timeout = setTimeout(function () { finish(false, 'timeout'); }, videoPreparationTimeout);

            function finish(ready, reason) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                video.removeEventListener('loadeddata', onLoadedData);
                video.removeEventListener('error', onError);
                state.status = ready ? 'ready' : reason;
                if (!ready) restorePoster(video);
                resolve(ready);
            }

            function onLoadedData() {
                if (video.readyState >= 2) finish(true, 'loadeddata');
            }

            function onError() { finish(false, 'error'); }

            video.addEventListener('loadeddata', onLoadedData, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.preload = 'auto';
            video.setAttribute('fetchpriority', priority ? 'auto' : 'low');
            video.setAttribute('src', source);
            video.load();
            if (video.error) onError();
            else if (video.readyState >= 2) onLoadedData();
        });
        return state.readyPromise;
    }

    function isPlaybackEligible(video, state) {
        return appReady && !modalActive && state.autoplayIntent &&
            state.intersectionRatio >= 0.25 &&
            !(document.visibilityState && document.visibilityState !== 'visible') &&
            !(reducedMotionQuery && reducedMotionQuery.matches);
    }

    function pauseVideo(video, state) {
        state.playToken++;
        state.playPending = false;
        if (state.frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
            video.cancelVideoFrameCallback(state.frameCallbackId);
            state.frameCallbackId = null;
        }
        if (!video.paused) video.pause();
    }

    function startVideoPlayback(video, state, token) {
        if (state.playToken !== token || !isPlaybackEligible(video, state)) return;
        if (!video.paused || state.playPending || state.playBlocked) return;
        state.playPending = true;
        video.addEventListener('playing', function clearPendingPlay() {
            state.playPending = false;
        }, { once: true });
        watchForPresentedFrame(video, state, token);
        try {
            var playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.then(function () {
                    state.playPending = false;
                }, function () {
                    state.playPending = false;
                    if (state.playToken === token) {
                        state.playBlocked = true;
                        restorePoster(video);
                    }
                });
            }
        } catch (error) {
            state.playPending = false;
            state.playBlocked = true;
            restorePoster(video);
        }
    }

    function updateVideoPlayback(video) {
        var state = getVideoState(video);
        state.intersectionRatio = viewportIntersectionRatio(video);
        if (!isPlaybackEligible(video, state)) {
            pauseVideo(video, state);
            return;
        }

        if (video.readyState >= 2) {
            if (!video.paused || state.playPending) return;
            var readyToken = ++state.playToken;
            startVideoPlayback(video, state, readyToken);
            return;
        }

        var token = ++state.playToken;
        prepareVideo(video, state.priority).then(function (ready) {
            if (ready && state.playToken === token && isPlaybackEligible(video, state)) {
                startVideoPlayback(video, state, token);
            }
        });
    }

    function refreshPlayback() {
        managedVideos.forEach(updateVideoPlayback);
    }

    function prefetchDistanceForVideo(video) {
        return distanceFromViewport(video);
    }

    function sortSpeculativeQueue() {
        speculativeQueue.sort(function (a, b) {
            var stateA = getVideoState(a), stateB = getVideoState(b);
            if (stateA.priority !== stateB.priority) return stateA.priority ? -1 : 1;
            return prefetchDistanceForVideo(a) - prefetchDistanceForVideo(b);
        });
    }

    function removeFromSpeculativeQueue(video) {
        speculativeQueue = speculativeQueue.filter(function (queuedVideo) {
            if (queuedVideo === video) {
                getVideoState(video).queued = false;
                return false;
            }
            return true;
        });
    }

    function drainSpeculativeQueue() {
        if (activeSpeculativePreparations >= maxSpeculativePreparations ||
            (document.visibilityState && document.visibilityState !== 'visible') ||
            (reducedMotionQuery && reducedMotionQuery.matches)) return;
        sortSpeculativeQueue();

        while (speculativeQueue.length) {
            var video = speculativeQueue.shift();
            var state = getVideoState(video);
            state.queued = false;
            if (!video.isConnected || state.readyPromise || !isWithinPrefetchMargin(video)) continue;

            activeSpeculativePreparations++;
            prepareVideo(video, state.priority).then(function () {
                activeSpeculativePreparations = Math.max(0, activeSpeculativePreparations - 1);
                drainSpeculativeQueue();
            });
            break;
        }
    }

    function enqueueSpeculativePreparation(video) {
        var state = getVideoState(video);
        if (state.readyPromise || state.queued || state.status === 'ready' || state.status === 'error') return;
        state.queued = true;
        speculativeQueue.push(video);
        drainSpeculativeQueue();
    }

    function preparePosterNearViewport(video) {
        ensurePosterOverlay(video, true);
    }

    function prefetchEntry(video, isIntersecting) {
        var state = getVideoState(video);
        if (isIntersecting) {
            preparePosterNearViewport(video);
            if (state.priority && isInViewport(video) && !state.readyPromise) {
                prepareVideo(video, true);
            } else {
                enqueueSpeculativePreparation(video);
            }
        } else if (state.queued && !isWithinPrefetchMargin(video)) {
            removeFromSpeculativeQueue(video);
        }
    }

    function choosePrefetchMargin() {
        if (connectionInfo && (connectionInfo.saveData ||
            connectionInfo.effectiveType === '2g' || connectionInfo.effectiveType === 'slow-2g')) {
            return 250;
        }
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches ? 400 : 700;
    }

    function installFallbackVisibilityCheck() {
        if (fallbackListenersInstalled) return;
        fallbackListenersInstalled = true;

        function scheduleCheck() {
            if (fallbackCheckPending) return;
            fallbackCheckPending = true;
            window.requestAnimationFrame(function () {
                fallbackCheckPending = false;
                managedVideos.forEach(function (video) {
                    var state = getVideoState(video);
                    prefetchEntry(video, isWithinPrefetchMargin(video));
                    state.intersectionRatio = viewportIntersectionRatio(video);
                    updateVideoPlayback(video);
                });
            });
        }

        window.addEventListener('scroll', scheduleCheck, { passive: true });
        window.addEventListener('resize', scheduleCheck, { passive: true });
        scheduleCheck();
    }

    function rebuildPrefetchObserver() {
        prefetchMargin = choosePrefetchMargin();
        if (!('IntersectionObserver' in window)) {
            installFallbackVisibilityCheck();
            return;
        }
        if (prefetchObserver) prefetchObserver.disconnect();
        prefetchObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { prefetchEntry(entry.target, entry.isIntersecting); });
        }, { rootMargin: prefetchMargin + 'px 0px', threshold: 0 });
        managedVideos.forEach(function (video) { prefetchObserver.observe(video); });
    }

    function installPlaybackObserver() {
        if (!('IntersectionObserver' in window)) {
            installFallbackVisibilityCheck();
            return;
        }
        playbackObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                getVideoState(entry.target).intersectionRatio = entry.intersectionRatio;
                updateVideoPlayback(entry.target);
            });
        }, { threshold: [0, 0.25] });
        managedVideos.forEach(function (video) { playbackObserver.observe(video); });
    }

    function initializeMedia() {
        if (mediaInitialized) return;
        mediaInitialized = true;
        mediaStartedAt = now();
        recordMetric('media-init', {});

        var candidates = Array.prototype.slice.call(document.querySelectorAll('video[data-lazy-src]'));
        candidates.forEach(function (video) {
            if (isOnDemandVideo(video)) return;
            var state = getVideoState(video);
            state.autoplayIntent = video.hasAttribute('autoplay');
            state.priority = video.getAttribute('data-media-priority') === 'high';
            if (state.autoplayIntent) {
                video.removeAttribute('autoplay');
                video.setAttribute('data-mqiu-autoplay-intent', 'true');
            }
            video.addEventListener('loadeddata', function () {
                if (video.readyState >= 2) {
                    state.status = 'ready';
                    if (appReady) updateVideoPlayback(video);
                }
            });
            video.addEventListener('error', function () {
                state.status = 'error';
                restorePoster(video);
            });
            video.addEventListener('webkitendfullscreen', refreshPlayback);
            managedVideos.push(video);
            ensurePosterOverlay(video, false);
        });

        rebuildPrefetchObserver();
        installPlaybackObserver();
        managedVideos.forEach(function (video) {
            var state = getVideoState(video);
            if (isInViewport(video)) preparePosterNearViewport(video);
            if (state.priority && isInViewport(video)) prepareVideo(video, true);
        });

        if (connectionInfo && typeof connectionInfo.addEventListener === 'function') {
            connectionInfo.addEventListener('change', rebuildPrefetchObserver);
        }
        window.addEventListener('resize', function () {
            clearTimeout(prefetchResizeTimer);
            prefetchResizeTimer = setTimeout(rebuildPrefetchObserver, 120);
        }, { passive: true });
        if (reducedMotionQuery) {
            var onMotionPreferenceChange = function () {
                if (reducedMotionQuery.matches) {
                    managedVideos.forEach(function (video) { pauseVideo(video, getVideoState(video)); });
                } else {
                    refreshPlayback();
                    drainSpeculativeQueue();
                }
            };
            if (typeof reducedMotionQuery.addEventListener === 'function') {
                reducedMotionQuery.addEventListener('change', onMotionPreferenceChange);
            } else if (typeof reducedMotionQuery.addListener === 'function') {
                reducedMotionQuery.addListener(onMotionPreferenceChange);
            }
        }
    }

    function waitForCriticalFonts() {
        if (!document.fonts || !document.fonts.ready) return Promise.resolve();
        return new Promise(function (resolve) {
            var finished = false;
            var timeout = setTimeout(function () { finish('fallback-deadline'); }, 1000);

            function finish(result) {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                recordMetric('critical-fonts', { result: result });
                resolve();
            }

            document.fonts.ready.then(function () { finish('ready'); }, function () { finish('fallback'); });
        });
    }

    function waitForCriticalMedia() {
        var visibleImages = Array.prototype.slice.call(document.querySelectorAll('img'))
            .filter(isInViewport)
            .map(waitForImageElement);
        var visiblePosters = managedVideos
            .filter(isInViewport)
            .map(function (video) { return ensurePosterOverlay(video, true); });
        return Promise.all(visibleImages.concat(visiblePosters));
    }

    function visiblePriorityVideoPromises() {
        return managedVideos.filter(function (video) {
            var state = getVideoState(video);
            return state.priority && isInViewport(video);
        }).map(function (video) {
            return prepareVideo(video, true);
        });
    }

    function waitForPriorityVideoWindow() {
        var readiness = visiblePriorityVideoPromises();
        if (!readiness.length) return Promise.resolve();
        return Promise.race([
            Promise.all(readiness),
            new Promise(function (resolve) { setTimeout(resolve, priorityVideoRevealWait); })
        ]);
    }

    function gatePreloaderWithMedia() {
        var fillReady = window.__preloaderReady;
        var startAnimation = window.__startPreloaderAnimation;
        if (!fillReady || typeof startAnimation !== 'function') return;

        var resolveCriticalResources;
        var criticalResourcesReady = new Promise(function (resolve) {
            resolveCriticalResources = resolve;
        });
        var started = false;

        window.__preloaderReady = Promise.all([fillReady, criticalResourcesReady]);
        window.__startPreloaderAnimation = function () {
            if (!started) {
                started = true;
                initializeMedia();

                var dataReady = waitWithDeadline(window.__criticalMediaDataReady || Promise.resolve(), criticalDataTimeout, 'critical-data');
                var visibleMediaReady = dataReady.then(waitForCriticalMedia).catch(function () {});
                var fontReady = waitForCriticalFonts().catch(function () {});
                var heroTextureReady = waitWithDeadline(window.__criticalHeroImageReady || Promise.resolve(), criticalTextureTimeout, 'critical-hero-texture');

                Promise.all([fillReady, visibleMediaReady, fontReady, heroTextureReady])
                    .then(waitForPriorityVideoWindow)
                    .then(resolveCriticalResources, resolveCriticalResources);
            }
            return startAnimation.apply(this, arguments);
        };
    }

    function setModalActive(active) {
        modalActive = !!active;
        if (modalActive) {
            managedVideos.forEach(function (video) { pauseVideo(video, getVideoState(video)); });
        } else {
            refreshPlayback();
        }
    }

    function loadOnDemand(video) {
        if (!video) return Promise.resolve(false);
        var poster = video.dataset.lazyPoster;
        if (poster && !video.getAttribute('poster')) video.setAttribute('poster', poster);
        var source = video.dataset.lazySrc;
        if (source && !video.getAttribute('src')) {
            video.preload = 'auto';
            video.setAttribute('src', source);
            video.load();
        }
        return waitForVideoData(video, 12000);
    }

    function captureInitialRevealMetrics() {
        var readyAt = now();
        if (mediaStartedAt !== null) {
            recordMetric('initial-reveal', {
                revealLatencyMs: Math.round(readyAt - mediaStartedAt),
                initialTransferredBytes: transferredResourceBytes()
            });
        }
    }

    function initializeOnMediaEvent() {
        initializeMedia();
    }

    window.mqiuMedia = {
        initialize: initializeMedia,
        loadOnDemand: loadOnDemand,
        setModalActive: setModalActive,
        refreshPlayback: refreshPlayback,
        metrics: metrics,
        getMetrics: function () { return metrics.slice(); }
    };
    window.__waitForCriticalMedia = waitForCriticalMedia;

    gatePreloaderWithMedia();
    window.addEventListener('mqiu:media-init', initializeOnMediaEvent);
    window.addEventListener('mqiu:app-ready', function () {
        if (!mediaInitialized) initializeMedia();
        appReady = true;
        captureInitialRevealMetrics();
        refreshPlayback();
    }, { once: true });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') {
            managedVideos.forEach(function (video) { pauseVideo(video, getVideoState(video)); });
        } else {
            refreshPlayback();
            drainSpeculativeQueue();
        }
    });
})();

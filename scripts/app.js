/**
 * Vue 3 Application — state, GSAP animations, Lenis smooth scroll.
 * Depends on: Vue, GSAP + ScrollTrigger, Lenis, Lucide (all via CDN).
 * Depends on: initParticles() from particles.js.
 */
(function () {
    var createApp = Vue.createApp;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var onMounted = Vue.onMounted;
    var onUnmounted = Vue.onUnmounted;
    var nextTick = Vue.nextTick;
    var watch = Vue.watch;

    gsap.registerPlugin(ScrollTrigger);

    createApp({
        setup: function () {
            var isSidebarOpen = ref(false);
            var activeSection = ref('home');
            var isBooting = ref(true);
            var showNavDock = ref(false);
            var navDockBottom = ref('2rem');
            var showVideoModal = ref(false);
            var modalVideo = ref(null);

            var lenis;
            var particles;
            var scrollRafPending = false;

            // ── Translations (loaded from i18n.js) ──
            var translations = window.i18n;

            // ── Language ──
            var LANG_KEY = 'lang';
            var DEFAULT_LANG = 'en';
            var SUPPORTED_LANGS = ['en', 'zh'];

            function getCookieLang() {
                try {
                    var match = document.cookie.match(new RegExp('(?:^|; )' + LANG_KEY + '=([^;]*)'));
                    var v = match ? decodeURIComponent(match[1]) : null;
                    return SUPPORTED_LANGS.indexOf(v) >= 0 ? v : null;
                } catch (e) { return null; }
            }
            function getBrowserLang() {
                try {
                    var navLang = (navigator.language || navigator.userLanguage || '').split('-')[0];
                    return SUPPORTED_LANGS.indexOf(navLang) >= 0 ? navLang : null;
                } catch (e) { return null; }
            }
            function getStoredLang() {
                try { var v = localStorage.getItem(LANG_KEY); return SUPPORTED_LANGS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
            }
            function setStoredLang(val) {
                try { localStorage.setItem(LANG_KEY, val); } catch (e) {}
                try { document.cookie = LANG_KEY + '=' + encodeURIComponent(val) + ';path=/;domain=mqiu.dev;max-age=31536000;SameSite=Lax'; } catch (e) {}
            }

            function resolveLang() {
                return getStoredLang() || getCookieLang() || getBrowserLang() || DEFAULT_LANG;
            }

            var lang = ref(resolveLang());

            function setLang(l) {
                lang.value = l;
                setStoredLang(l);
                nextTick(function () {
                    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
                    initScrollAnimations();
                    lucide.createIcons();
                });
            }

            function initScrollAnimations() {
                // Mask Reveals for subsequent sections
                gsap.utils.toArray('.section-rk:not(#home)').forEach(function (sec) {
                    var masks = sec.querySelectorAll('.mask-inner');
                    if (masks.length > 0) {
                        gsap.from(masks, {
                            y: "105%",
                            duration: 1.8,
                            stagger: 0.15,
                            ease: "power4.out",
                            scrollTrigger: {
                                trigger: sec,
                                start: "top 85%",
                            }
                        });
                    }
                });

                // Image Parallax
                gsap.utils.toArray('.parallax-wrap').forEach(function (wrap) {
                    var img = wrap.querySelector('.parallax-img');
                    gsap.fromTo(img, {
                        y: "-15%"
                    }, {
                        y: "15%",
                        ease: "none",
                        scrollTrigger: {
                            trigger: wrap,
                            start: "top bottom",
                            end: "bottom top",
                            scrub: true
                        }
                    });
                });

                // Screenshot Parallax
                gsap.utils.toArray('.screenshot-parallax').forEach(function (wrap) {
                    var img = wrap.querySelector('.screenshot-parallax-img');
                    if (!img) return;
                    gsap.fromTo(img, {
                        y: "-3%"
                    }, {
                        y: "3%",
                        ease: "none",
                        scrollTrigger: {
                            trigger: wrap,
                            start: "top bottom",
                            end: "bottom top",
                            scrub: true
                        }
                    });
                });

                // Gradient Parallax on editorial text
                gsap.utils.toArray('.gradient-text').forEach(function (el) {
                    gsap.fromTo(el, {
                        backgroundPosition: '0% 50%'
                    }, {
                        backgroundPosition: '100% 50%',
                        ease: 'none',
                        scrollTrigger: {
                            trigger: el,
                            start: 'top bottom',
                            end: 'bottom top',
                            scrub: true
                        }
                    });
                });

                // Bolt Rotation
                gsap.utils.toArray('.bolt-plus').forEach(function (bolt) {
                    gsap.to(bolt, {
                        rotation: 360,
                        ease: "none",
                        scrollTrigger: {
                            trigger: bolt,
                            start: "top bottom",
                            end: "bottom top",
                            scrub: 1
                        }
                    });
                });
            }

            function t(key) {
                var keys = key.split('.');
                var result = translations[lang.value];
                for (var i = 0; i < keys.length; i++) {
                    if (result == null) break;
                    result = result[keys[i]];
                }
                if (result == null) {
                    result = translations['en'];
                    for (var i = 0; i < keys.length; i++) {
                        if (result == null) break;
                        result = result[keys[i]];
                    }
                }
                return result != null ? result : key;
            }

            watch(lang, function (val) {
                document.documentElement.lang = val;
                document.title = t('site.title');
            }, { immediate: true });

            // ── Theme ──
            var STORAGE_KEY = 'theme';
            var systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

            function getStoredTheme() {
                try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
            }
            function setStoredTheme(val) {
                try {
                    if (val === null) localStorage.removeItem(STORAGE_KEY);
                    else localStorage.setItem(STORAGE_KEY, val);
                } catch (e) {}
            }

            function resolveTheme() {
                var stored = getStoredTheme();
                if (stored === 'dark' || stored === 'light') return stored;
                return systemQuery.matches ? 'dark' : 'light';
            }

            var isDark = ref(resolveTheme() === 'dark');
            var themeMode = ref(getStoredTheme() || 'system');

            function applyTheme(dark) {
                document.documentElement.classList.toggle('dark', dark);
            }

            function toggleTheme() {
                switch (themeMode.value) {
                    case 'system':
                        themeMode.value = 'light';
                        isDark.value = false;
                        setStoredTheme('light');
                        break;
                    case 'light':
                        themeMode.value = 'dark';
                        isDark.value = true;
                        setStoredTheme('dark');
                        break;
                    case 'dark':
                        themeMode.value = 'system';
                        setStoredTheme(null);
                        isDark.value = systemQuery.matches;
                        break;
                }
                nextTick(function () {
                    lucide.createIcons();
                });
            }

            watch(isDark, function (val) {
                document.documentElement.classList.add('theme-transitioning');
                void document.documentElement.offsetHeight;
                applyTheme(val);
                setTimeout(function () {
                    document.documentElement.classList.remove('theme-transitioning');
                }, 600);
                nextTick(function () {
                    lucide.createIcons();
                });
            });

            function onSystemThemeChange(e) {
                if (themeMode.value === 'system') {
                    isDark.value = e.matches;
                }
            }

            var sectionLabels = computed(function () {
                return translations[lang.value].sectionLabels;
            });

            // Apply theme immediately (before Vue mounts)
            applyTheme(resolveTheme() === 'dark');

            function handleNavClick(targetId) {
                closeSidebar(function () {
                    var el = document.getElementById(targetId);
                    if (el && lenis) lenis.scrollTo(el, { duration: 1.2 });
                });
            }

            function scrollToTop() {
                if (isSidebarOpen.value) return;
                if (lenis) lenis.scrollTo(0, { duration: 1.2 });
            }

            function openVideoModal() {
                showVideoModal.value = true;
            }

            function closeVideoModal() {
                showVideoModal.value = false;
            }

            watch(showVideoModal, function (val) {
                if (val) {
                    // Wait for transition to start rendering before trying to play
                    nextTick(function () {
                        nextTick(function () {
                            lucide.createIcons();
                            if (modalVideo.value) {
                                modalVideo.value.play().catch(function () {});
                            }
                        });
                    });
                } else {
                    if (modalVideo.value) {
                        modalVideo.value.pause();
                    }
                }
            });

            var apps = [
                { id: 'DesktopRenamer', name: 'DesktopRenamer', desc: 'Customize the name of your current desktop in the menubar.', img: 'resources/works/desktop-renamer.png', fullImg: 'resources/works/desktop-renamer-full.png', fullImgDark: 'resources/works/desktop-renamer-full-dark.png', link: 'https://desktoprenamer.mqiu.dev' },
                { id: 'OptClick', name: 'OptClicker', desc: 'Simulate right-click via Option key.', img: 'resources/works/opt-clicker.png', fullImg: 'resources/works/opt-clicker-full.png', fullImgDark: 'resources/works/opt-clicker-full-dark.png', link: 'https://optclicker.mqiu.dev' },
                { id: 'SpaceSwitcher', name: 'SpaceSwitcher', desc: 'Control app visibility across specific workspaces.', img: 'resources/works/space-switcher.png', fullImg: 'resources/works/space-switcher-full.png', fullImgDark: 'resources/works/space-switcher-full-dark.png', link: 'https://spaceswitcher.mqiu.dev' }
            ];

            var photos = [
                { url: 'resources/photos/01.jpeg', title: 'Sunsetz', titleZh: '日落', date: 'Ko Chang, Thailand, 2023', dateZh: '泰国象岛，2023', flag: '🇹🇭' },
                { url: 'resources/photos/02.jpeg', title: 'Golden Hour', titleZh: '黄金时刻', date: 'Ko Chang, Thailand, 2023', dateZh: '泰国象岛，2023', flag: '🇹🇭' },
                { url: 'resources/photos/03.jpeg', title: 'Luna Hooked on A Twig', titleZh: '月挂枝头', date: 'Hangzhou, China, 2024', dateZh: '中国杭州，2024', flag: '🇨🇳' },
                { url: 'resources/photos/04.jpeg', title: 'Shed A Light', titleZh: '微光', date: 'Abu Dhabi, UAE, 2025', dateZh: '阿联酋阿布扎比，2025', flag: '🇦🇪' },
                { url: 'resources/photos/05.jpeg', title: 'Mountain Ferry', titleZh: '山间渡轮', date: 'Hokkaido, Japan, 2025', dateZh: '日本北海道，2025', flag: '🇯🇵' },
                { url: 'resources/photos/06.jpeg', title: 'Lighthouse', titleZh: '灯塔', date: 'Hokkaido, Japan, 2025', dateZh: '日本北海道，2025', flag: '🇯🇵' },
                { url: 'resources/photos/07.jpeg', title: 'Path', titleZh: '小径', date: 'Hokkaido, Japan, 2025', dateZh: '日本北海道，2025', flag: '🇯🇵' }
            ];

            // ── Sidebar ──

            function closeSidebar(callback) {
                gsap.to('.sidebar-rk .mask-inner', {
                    y: "105%",
                    duration: 0.5,
                    stagger: 0.05,
                    ease: "expo.in",
                    onComplete: function () {
                        isSidebarOpen.value = false;
                        if (callback) callback();
                    }
                });
            }

            function toggleSidebar() {
                if (isSidebarOpen.value) {
                    closeSidebar();
                } else {
                    isSidebarOpen.value = true;
                }
            }

            watch(isSidebarOpen, function (val) {
                if (val) {
                    nextTick(function () {
                        lucide.createIcons();
                        gsap.from('.sidebar-rk .mask-inner', {
                            y: "105%",
                            duration: 1,
                            stagger: 0.1,
                            ease: "expo.out",
                            delay: 0.3
                        });
                    });
                }
            });

            // ── Section Label Animation ──
            var sectionLabelTween;
            var sectionLabelClone;
            var sectionOrder = ['home', 'profile', 'works', 'photos', 'connect'];

            watch(activeSection, function (newSection, oldSection) {
                if (!oldSection || oldSection === newSection) return;

                // Clean up previous animation and any leftover clone
                if (sectionLabelTween) {
                    sectionLabelTween.kill();
                    sectionLabelTween = null;
                }
                if (sectionLabelClone && sectionLabelClone.parentNode) {
                    sectionLabelClone.remove();
                    sectionLabelClone = null;
                }

                var dock = document.querySelector('.nav-dock');
                var label = document.querySelector('.nav-dock__label');
                var labelText = document.querySelector('.nav-dock__label-text');
                if (!dock || !label || !labelText) return;

                // Determine scroll direction
                var oldIdx = sectionOrder.indexOf(oldSection);
                var newIdx = sectionOrder.indexOf(newSection);
                var isForward = newIdx > oldIdx;
                var outDir = isForward ? -110 : 110;
                var inDir = isForward ? 110 : -110;

                // Freeze dock width at current size
                var currentWidth = dock.offsetWidth;
                dock.style.width = currentWidth + 'px';

                // Take labelText out of flow so the clone can replace it naturally
                labelText.style.position = 'absolute';
                gsap.set(labelText, { opacity: 0 });

                // Create a clone with the OLD text — in normal flow so position matches exactly
                sectionLabelClone = document.createElement('span');
                sectionLabelClone.textContent = sectionLabels.value[oldSection] || oldSection;
                sectionLabelClone.style.cssText = 'display:block;white-space:nowrap;';
                label.appendChild(sectionLabelClone);

                // Animate old text out in the direction of travel
                sectionLabelTween = gsap.to(sectionLabelClone, {
                    yPercent: outDir,
                    opacity: 0,
                    duration: 0.2,
                    ease: 'power2.in',
                    onComplete: function () {
                        // Remove clone
                        if (sectionLabelClone && sectionLabelClone.parentNode) {
                            sectionLabelClone.remove();
                            sectionLabelClone = null;
                        }
                        sectionLabelTween = null;

                        // Restore labelText to flow (Vue has updated its content by now)
                        labelText.style.position = '';

                        // Measure natural width with new text (now in flow)
                        dock.style.width = '';
                        var newWidth = dock.offsetWidth;

                        // Re-freeze and offset new text ready to slide in
                        dock.style.width = currentWidth + 'px';
                        gsap.set(labelText, { yPercent: inDir, opacity: 0 });

                        // Animate dock width and new text in simultaneously
                        sectionLabelTween = gsap.timeline({
                            onComplete: function () {
                                dock.style.width = '';
                                sectionLabelTween = null;
                            }
                        });
                        sectionLabelTween
                            .to(dock, {
                                width: newWidth,
                                duration: 0.4,
                                ease: 'power2.inOut'
                            }, 0)
                            .to(labelText, {
                                yPercent: 0,
                                opacity: 1,
                                duration: 0.3,
                                ease: 'power2.out'
                            }, 0.07);
                    }
                });
            });

            // ── Scroll Tracking (throttled via rAF) ──

            function updateScrollProgress() {
                scrollRafPending = false;
                var winHeight = window.innerHeight;
                showNavDock.value = window.scrollY > winHeight * 0.2;
                var sections = ['home', 'profile', 'works', 'photos', 'connect'];
                var current = 'home';
                sections.forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) {
                        var rect = el.getBoundingClientRect();
                        if (rect.top <= winHeight * 0.4) current = id;
                    }
                });
                activeSection.value = current;

                var footer = document.querySelector('footer');
                if (footer) {
                    var footerRect = footer.getBoundingClientRect();
                    if (footerRect.top < winHeight) {
                        var offset = winHeight - footerRect.top + 16;
                        navDockBottom.value = offset + 'px';
                    } else {
                        navDockBottom.value = '2rem';
                    }
                }
            }

            function onScroll() {
                if (!scrollRafPending) {
                    scrollRafPending = true;
                    requestAnimationFrame(updateScrollProgress);
                }
            }

            // ── Lenis Smooth Scroll ──

            function initLenis() {
                lenis = new Lenis({ duration: 1.5, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smooth: true });
                function raf(time) { lenis.raf(time); ScrollTrigger.update(); requestAnimationFrame(raf); }
                requestAnimationFrame(raf);
            }

            // ── Lifecycle ──

            onMounted(function () {
                initLenis();
                window.addEventListener('scroll', onScroll, { passive: true });
                systemQuery.addEventListener('change', onSystemThemeChange);

                nextTick().then(function () {
                    lucide.createIcons();

                    // Particle constellation system
                    particles = initParticles('particle-layer');

                    // Project 3D Icons (disabled — using full screenshots instead)
                    // if (window.initProject3D) {
                    //     apps.forEach(function (app) {
                    //         window.initProject3D('project-3d-' + app.id, app.img);
                    //     });
                    // }

                    // ── Animation Sequence ──
                    var tl = gsap.timeline();

                    tl.set('body', { opacity: 1 })
                        .set('.hero__text .mask-inner', { y: '120%' })
                        .to('#preloader', { opacity: 0, duration: 0.8, ease: "power2.inOut", delay: 0.3, onComplete: function () {
                            var el = document.getElementById('preloader');
                            if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
                        } })
                        .to('.hero__bg', { opacity: 1, duration: 1.5, ease: "power2.inOut" }, "-=0.5")
                        .from('.grid-line', { scaleY: 0, duration: 0.6, stagger: 0.015, ease: "expo.inOut" }, "-=0.7")
                        .from('.hero__logo', { scale: 0.92, opacity: 0, y: 24, duration: 0.7, ease: "power3.out" }, "-=0.45")
                        .to('.hero__text .mask-inner', { y: 0, visibility: 'visible', duration: 0.8, stagger: 0.15, ease: "expo.out" }, "-=0.3")
                        .from('.hero__quicknav', { opacity: 0, duration: 0.5, ease: "power2.out" }, "-=0.3");

                    // Particles start spreading immediately
                    gsap.to(particles.state, { progress: 1, duration: 3.0, ease: "power2.out" });

                    initScrollAnimations();

                    // ── Hover Follower (RK-style) ──
                    var cards = document.querySelectorAll('[data-hover-follow]');
                    cards.forEach(function (item) {
                        var follower = item.querySelector('[data-hover-follower]');
                        if (!follower) return;

                        var ticking = false;
                        var x = 0, y = 0, tx = 0, ty = 0;
                        var trailLerp = 0.08;
                        var offset = 16;
                        var lastEvent = null;

                        function setTargetFromEvent(e) {
                            var rect = item.getBoundingClientRect();
                            tx = e.clientX - rect.left + offset;
                            ty = e.clientY - rect.top + offset;
                        }

                        function updatePosition() {
                            follower.style.left = Math.round(x) + 'px';
                            follower.style.top = Math.round(y) + 'px';
                        }

                        function tick() {
                            // Recompute target each frame so the subimage tracks
                            // the cursor even when scrolling without mouse movement
                            if (lastEvent) {
                                setTargetFromEvent(lastEvent);
                            }
                            x += (tx - x) * trailLerp;
                            y += (ty - y) * trailLerp;
                            updatePosition();
                        }

                        function startTicker() {
                            if (ticking) return;
                            ticking = true;
                            gsap.ticker.add(tick);
                        }

                        function stopTicker() {
                            if (!ticking) return;
                            ticking = false;
                            gsap.ticker.remove(tick);
                        }

                        function hideNow() {
                            gsap.killTweensOf(follower);
                            follower.style.display = 'none';
                            stopTicker();
                        }

                        function showNow(e) {
                            follower.style.display = 'block';
                            setTargetFromEvent(e);
                            x = tx;
                            y = ty;
                            updatePosition();

                            gsap.killTweensOf(follower);
                            gsap.fromTo(follower,
                                { scale: 0.6 },
                                { scale: 1, duration: 0.45, ease: "elastic.out(1,0.5)", overwrite: true }
                            );

                            startTicker();
                        }

                        item.addEventListener('mouseenter', function (e) {
                            item.style.zIndex = '9999';
                            lastEvent = e;
                            showNow(e);
                        });

                        item.addEventListener('mousemove', function (e) {
                            lastEvent = e;
                            if (follower.style.display !== 'block') return;
                            setTargetFromEvent(e);
                        });

                        item.addEventListener('mouseleave', function () {
                            item.style.zIndex = '';
                            hideNow();
                        });
                    });
                });
            });

            onUnmounted(function () {
                window.removeEventListener('scroll', onScroll);
                systemQuery.removeEventListener('change', onSystemThemeChange);
                if (particles) particles.destroy();
                if (lenis) lenis.destroy();
            });

            return {
                isSidebarOpen: isSidebarOpen,
                activeSection: activeSection,
                toggleSidebar: toggleSidebar,
                apps: apps,
                photos: photos,
                handleNavClick: handleNavClick,
                isBooting: isBooting,
                scrollToTop: scrollToTop,
                showNavDock: showNavDock,
                navDockBottom: navDockBottom,
                sectionLabels: sectionLabels,
                isDark: isDark,
                themeMode: themeMode,
                toggleTheme: toggleTheme,
                lang: lang,
                setLang: setLang,
                t: t,
                showVideoModal: showVideoModal,
                openVideoModal: openVideoModal,
                closeVideoModal: closeVideoModal,
                modalVideo: modalVideo
            };
        }
    }).mount('#app');
})();

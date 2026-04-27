/**
 * Vue 3 Application — state, GSAP animations, Lenis smooth scroll.
 * Depends on: Vue, GSAP + ScrollTrigger, Lenis, Lucide (all via CDN).
 * Depends on: initParticles() from particles.js.
 */
(function () {
    var createApp = Vue.createApp;
    var ref = Vue.ref;
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
            var sectionLabels = { home: 'Home', profile: 'Philosophy', works: 'Projects', photos: 'Story', connect: 'Contact' };

            var lenis;
            var particles;
            var scrollRafPending = false;

            // ── Theme ──
            var STORAGE_KEY = 'theme';
            var systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

            function getStoredTheme() {
                try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
            }
            function setStoredTheme(val) {
                try { localStorage.setItem(STORAGE_KEY, val); } catch (e) {}
            }

            function resolveTheme() {
                var stored = getStoredTheme();
                if (stored === 'dark' || stored === 'light') return stored;
                return systemQuery.matches ? 'dark' : 'light';
            }

            var isDark = ref(resolveTheme() === 'dark');

            function applyTheme(dark) {
                document.documentElement.classList.toggle('dark', dark);
            }

            function toggleTheme() {
                var next = !isDark.value;
                isDark.value = next;
                setStoredTheme(next ? 'dark' : 'light');
            }

            watch(isDark, function (val) {
                applyTheme(val);
                nextTick(function () {
                    lucide.createIcons();
                });
            });

            function onSystemThemeChange(e) {
                if (getStoredTheme() === null) {
                    isDark.value = e.matches;
                }
            }

            // Apply theme immediately (before Vue mounts)
            applyTheme(resolveTheme() === 'dark');

            function handleNavClick(targetId) {
                closeSidebar(function () {
                    var el = document.getElementById(targetId);
                    if (el && lenis) lenis.scrollTo(el, { duration: 1.2 });
                });
            }

            function scrollToTop() {
                if (lenis) lenis.scrollTo(0, { duration: 1.2 });
            }

            var apps = [
                { id: 'DesktopRenamer', name: 'DesktopRenamer', desc: 'Customizes the name of your current desktop in the menubar.', img: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/works/desktop-renamer.png', link: 'https://gitmichaelqiu.github.io/DesktopRenamer' },
                { id: 'OptClick', name: 'OptClicker', desc: 'Simulate right-click via Option key.', img: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/works/opt-clicker.png', link: 'https://gitmichaelqiu.github.io/OptClicker' },
                { id: 'SpaceSwitcher', name: 'SpaceSwitcher', desc: 'Control app visibility across specific workspaces.', img: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/works/space-switcher.png', link: 'https://gitmichaelqiu.github.io/SpaceSwitcher' }
            ];

            var photos = [
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/01.jpeg', title: 'Sunsetz', date: 'Ko Chang, Thailand, 2023' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/02.jpeg', title: 'Golden Hour', date: 'Ko Chang, Thailand, 2023' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/03.jpeg', title: 'Luna Hooked on A Twig', date: 'Hangzhou, China, 2024' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/04.jpeg', title: 'Shed A Light', date: 'Abu Dhabi, UAE, 2025' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/05.jpeg', title: 'Mountain Ferry', date: 'Hokkaido, Japan, 2025' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/06.jpeg', title: 'Lighthouse', date: 'Hokkaido, Japan, 2025' },
                { url: 'https://raw.githubusercontent.com/gitmichaelqiu/gitmichaelqiu.github.io/refs/heads/main/resources/photos/07.jpeg', title: 'Path', date: 'Hokkaido, Japan, 2025' }
            ];

            // ── Sidebar ──

            function closeSidebar(callback) {
                gsap.to('.sidebar-rk .mask-inner', {
                    y: "100%",
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
                            y: "100%",
                            duration: 1,
                            stagger: 0.1,
                            ease: "expo.out",
                            delay: 0.3
                        });
                    });
                }
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

                    // ── Animation Sequence ──
                    var tl = gsap.timeline();

                    tl.set('body', { opacity: 1 })
                        .to('#preloader', { opacity: 0, duration: 0.8, ease: "power2.inOut", delay: 0.3, onComplete: function () {
                            var el = document.getElementById('preloader');
                            if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
                        } })
                        .to('.hero__bg', { opacity: 1, duration: 1.2, ease: "power2.inOut" }, "-=0.5")
                        .from('.grid-line', { scaleY: 0, duration: 0.6, stagger: 0.015, ease: "expo.inOut" }, "-=0.7")
                        .from('.hero__text .mask-inner', { y: "100%", duration: 0.6, stagger: 0.06, ease: "power3.out" }, "-=0.6")
                        .from('.hero__logo', { scale: 0.92, opacity: 0, y: 24, duration: 0.7, ease: "power3.out" }, "-=0.45")
                        .from('.hero__quicknav', { opacity: 0, duration: 0.5, ease: "power2.out" }, "-=0.4");

                    // Particles start spreading immediately
                    gsap.to(particles.state, { progress: 1, duration: 3.0, ease: "power2.out" });

                    // Mask Reveals for subsequent sections
                    gsap.utils.toArray('.section-rk:not(#home)').forEach(function (sec) {
                        var masks = sec.querySelectorAll('.mask-inner');
                        if (masks.length > 0) {
                            gsap.from(masks, {
                                y: "100%",
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
                toggleTheme: toggleTheme
            };
        }
    }).mount('#app');
})();

/**
 * Three.js Project 3D Icon Interaction
 * Renders an interactive 3D icon block for each project.
 * Exposes window.initProject3D(containerId, imageUrl) → { destroy }
 */
(function () {
    var loader = new THREE.TextureLoader();

    window.initProject3D = function (containerId, imageUrl) {
        if (typeof THREE === 'undefined') return { destroy: function () {} };

        var container = document.getElementById(containerId);
        if (!container) return { destroy: function () {} };

        // --- Scene Setup ---
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.z = 6;

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // --- Lights ---
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);

        var blueLight = new THREE.PointLight(0x002FA7, 1.5, 8);
        blueLight.position.set(-3, -2, 3);
        scene.add(blueLight);

        // --- Geometry & Materials ---
        var iconTexture = loader.load(imageUrl);
        
        var sideMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x1a1a1a,
            metalness: 0.8,
            roughness: 0.2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
        });

        var frontMaterial = new THREE.MeshPhysicalMaterial({
            map: iconTexture,
            transparent: true,
            roughness: 0.1,
            metalness: 0.1,
            clearcoat: 1.0
        });

        var materials = [
            sideMaterial, sideMaterial, sideMaterial, sideMaterial, frontMaterial, sideMaterial
        ];

        var geometry = new THREE.BoxGeometry(2.8, 2.8, 0.35);
        var iconBlock = new THREE.Mesh(geometry, materials);
        scene.add(iconBlock);

        // --- Interaction ---
        var targetRotation = { x: 0, y: 0 };
        var currentRotation = { x: 0, y: 0 };
        var isHovered = false;

        var onMouseMove = function (e) {
            var rect = container.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width * 2 - 1;
            var y = -((e.clientY - rect.top) / rect.height * 2 - 1);
            
            targetRotation.y = x * 0.45;
            targetRotation.x = -y * 0.45;
        };

        var onMouseEnter = function () { isHovered = true; };
        var onMouseLeave = function () { 
            isHovered = false;
            targetRotation.x = 0;
            targetRotation.y = 0;
        };

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mouseenter', onMouseEnter);
        container.addEventListener('mouseleave', onMouseLeave);

        // --- Animation ---
        var animationId;
        var isVisible = false;

        var observer = new IntersectionObserver(function(entries) {
            isVisible = entries[0].isIntersecting;
        }, { threshold: 0.1 });
        observer.observe(container);

        function animate() {
            animationId = requestAnimationFrame(animate);
            if (!isVisible) return;
            
            var lerpSpeed = isHovered ? 0.08 : 0.04;
            currentRotation.x += (targetRotation.x - currentRotation.x) * lerpSpeed;
            currentRotation.y += (targetRotation.y - currentRotation.y) * lerpSpeed;
            
            iconBlock.rotation.x = currentRotation.x;
            iconBlock.rotation.y = currentRotation.y;
            
            // Subtle idle motion
            var time = performance.now() * 0.001;
            if (!isHovered) {
                iconBlock.position.y = Math.sin(time * 0.8) * 0.05;
                iconBlock.rotation.z = Math.sin(time * 0.4) * 0.02;
            } else {
                iconBlock.position.y += (0 - iconBlock.position.y) * 0.1;
                iconBlock.rotation.z += (0 - iconBlock.rotation.z) * 0.1;
            }
            
            renderer.render(scene, camera);
        }
        animate();

        // --- Resize ---
        var onResize = function () {
            var w = container.clientWidth, h = container.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', onResize);

        return {
            destroy: function () {
                window.removeEventListener('resize', onResize);
                container.removeEventListener('mousemove', onMouseMove);
                container.removeEventListener('mouseenter', onMouseEnter);
                container.removeEventListener('mouseleave', onMouseLeave);
                observer.disconnect();
                if (animationId) cancelAnimationFrame(animationId);
                geometry.dispose();
                materials.forEach(function(m) { m.dispose(); });
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
    };
})();

/**
 * Three.js Project 3D Icon Interaction
 * Renders a high-end 3D rounded icon block with tilt and parallax.
 */
(function () {
    var loader = new THREE.TextureLoader();

    // Helper to create a rounded rectangle shape
    function createRoundedRectShape(width, height, radius) {
        var shape = new THREE.Shape();
        var x = -width / 2, y = -height / 2;
        
        // Start from bottom left corner
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
        
        return shape;
    }

    window.initProject3D = function (containerId, imageUrl) {
        if (typeof THREE === 'undefined') return { destroy: function () {} };

        var container = document.getElementById(containerId);
        if (!container) return { destroy: function () {} };
        
        var trigger = container.closest('.work-card') || container;

        // --- Scene Setup ---
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.z = 7;

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // --- Lights ---
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        var dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);

        var blueLight = new THREE.PointLight(0x002FA7, 2, 12);
        blueLight.position.set(-4, -2, 4);
        scene.add(blueLight);

        // --- Geometry & Materials ---
        var iconTexture = loader.load(imageUrl);
        
        var sideMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
        });

        var frontMaterial = new THREE.MeshPhysicalMaterial({
            map: iconTexture,
            transparent: true,
            roughness: 0.1,
            metalness: 0.2,
            clearcoat: 1.0
        });

        // Shape dimensions
        var w = 3.2, h = 3.2, r = 0.8, depth = 0.35;
        var shape = createRoundedRectShape(w, h, r);
        
        var extrudeSettings = {
            steps: 1,
            depth: depth,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.04,
            bevelOffset: 0,
            bevelSegments: 8
        };

        var geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        geometry.computeBoundingBox();
        var min = geometry.boundingBox.min;
        var max = geometry.boundingBox.max;
        var size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);

        var uvAttribute = geometry.attributes.uv;
        for (var i = 0; i < uvAttribute.count; i++) {
            var u = uvAttribute.getX(i);
            var v = uvAttribute.getY(i);
            uvAttribute.setXY(i, (u - min.x) / size.x, (v - min.y) / size.y);
        }

        var mesh = new THREE.Mesh(geometry, [frontMaterial, sideMaterial]);
        mesh.position.z = -depth/2;
        scene.add(mesh);

        // --- Interaction ---
        var targetRotation = { x: 0, y: 0 };
        var currentRotation = { x: 0, y: 0 };
        var isHovered = false;

        var onMouseMove = function (e) {
            var rect = container.getBoundingClientRect();
            var centerX = rect.left + rect.width / 2;
            var centerY = rect.top + rect.height / 2;
            
            // Normalize distance to window size for broad response
            var dx = (e.clientX - centerX) / (window.innerWidth / 2);
            var dy = (e.clientY - centerY) / (window.innerHeight / 2);
            
            // To face the cursor:
            // Cursor right (dx > 0) -> Rotate around Y axis to turn front towards right (Negative Y rotation)
            // Cursor left (dx < 0) -> Positive Y rotation
            // Cursor up (dy < 0) -> Rotate around X axis to turn front towards up (Negative X rotation)
            // Cursor down (dy > 0) -> Positive X rotation
            
            targetRotation.y = -dx * 0.6;
            targetRotation.x = dy * 0.6;
        };

        var onMouseEnter = function () { isHovered = true; };
        var onMouseLeave = function () { 
            isHovered = false;
            targetRotation.x = 0;
            targetRotation.y = 0;
        };

        trigger.addEventListener('mousemove', onMouseMove);
        trigger.addEventListener('mouseenter', onMouseEnter);
        trigger.addEventListener('mouseleave', onMouseLeave);

        // --- Animation & Parallax ---
        var animationId;
        var isVisible = false;

        var observer = new IntersectionObserver(function(entries) {
            isVisible = entries[0].isIntersecting;
        }, { threshold: 0.05 });
        observer.observe(container);

        function animate() {
            animationId = requestAnimationFrame(animate);
            if (!isVisible) return;
            
            var lerpSpeed = isHovered ? 0.08 : 0.04;
            currentRotation.x += (targetRotation.x - currentRotation.x) * lerpSpeed;
            currentRotation.y += (targetRotation.y - currentRotation.y) * lerpSpeed;
            
            mesh.rotation.x = currentRotation.x;
            mesh.rotation.y = currentRotation.y;
            
            var rect = container.getBoundingClientRect();
            var center = window.innerHeight / 2;
            var offset = (rect.top + rect.height / 2 - center) / window.innerHeight;
            mesh.position.y = -offset * 1.8;
            
            var time = performance.now() * 0.001;
            if (!isHovered) {
                mesh.position.y += Math.sin(time * 0.8) * 0.05;
                mesh.rotation.z = Math.sin(time * 0.4) * 0.02;
            } else {
                mesh.rotation.z += (0 - mesh.rotation.z) * 0.1;
            }
            
            renderer.render(scene, camera);
        }
        animate();

        // --- Resize ---
        var onResize = function () {
            var w = container.clientWidth, h = container.clientHeight;
            if (w === 0 || h === 0) return;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', onResize);

        return {
            destroy: function () {
                window.removeEventListener('resize', onResize);
                trigger.removeEventListener('mousemove', onMouseMove);
                trigger.removeEventListener('mouseenter', onMouseEnter);
                trigger.removeEventListener('mouseleave', onMouseLeave);
                observer.disconnect();
                if (animationId) cancelAnimationFrame(animationId);
                geometry.dispose();
                frontMaterial.dispose();
                sideMaterial.dispose();
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
    };
})();

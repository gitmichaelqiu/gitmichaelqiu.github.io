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
        shape.moveTo(x, y + radius);
        shape.lineTo(x, y + height - radius);
        shape.quadraticCurveTo(x, y + height, x + radius, y + height);
        shape.lineTo(x + width - radius, y + height);
        shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
        shape.lineTo(x + width, y + radius);
        shape.quadraticCurveTo(x + width, y, x + width - radius, y);
        shape.lineTo(x + radius, y);
        shape.quadraticCurveTo(x, y, x, y + radius);
        return shape;
    }

    window.initProject3D = function (containerId, imageUrl) {
        if (typeof THREE === 'undefined') return { destroy: function () {} };

        var container = document.getElementById(containerId);
        if (!container) return { destroy: function () {} };

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
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);

        var dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);

        var blueLight = new THREE.PointLight(0x002FA7, 1.5, 10);
        blueLight.position.set(-4, -2, 4);
        scene.add(blueLight);

        // --- Geometry & Materials ---
        var iconTexture = loader.load(imageUrl);
        
        var sideMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x222222,
            metalness: 0.9,
            roughness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
        });

        var frontMaterial = new THREE.MeshPhysicalMaterial({
            map: iconTexture,
            transparent: true,
            roughness: 0.2,
            metalness: 0.2,
            clearcoat: 1.0
        });

        // Shape dimensions
        var w = 3.2, h = 3.2, r = 0.5, depth = 0.35;
        var shape = createRoundedRectShape(w, h, r);
        
        var extrudeSettings = {
            steps: 2,
            depth: depth,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelOffset: 0,
            bevelSegments: 5
        };

        var geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Center geometry and fix UVs for the front face
        geometry.computeBoundingBox();
        var min = geometry.boundingBox.min;
        var max = geometry.boundingBox.max;
        var size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);

        var uvAttribute = geometry.attributes.uv;
        for (var i = 0; i < uvAttribute.count; i++) {
            var u = uvAttribute.getX(i);
            var v = uvAttribute.getY(i);
            // Simple mapping for front face (approximate)
            uvAttribute.setXY(i, (u - min.x) / size.x, (v - min.y) / size.y);
        }

        var mesh = new THREE.Mesh(geometry, [frontMaterial, sideMaterial]);
        // Adjust position so the front face is at z=0 (approx)
        mesh.position.z = -depth/2;
        scene.add(mesh);

        // --- Interaction ---
        var targetRotation = { x: 0, y: 0 };
        var currentRotation = { x: 0, y: 0 };
        var isHovered = false;

        var onMouseMove = function (e) {
            var rect = container.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width * 2 - 1;
            var y = -((e.clientY - rect.top) / rect.height * 2 - 1);
            targetRotation.y = x * 0.4;
            targetRotation.x = -y * 0.4;
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

        // --- Animation & Parallax ---
        var animationId;
        var isVisible = false;

        var observer = new IntersectionObserver(function(entries) {
            isVisible = entries[0].isIntersecting;
        }, { threshold: 0.1 });
        observer.observe(container);

        function animate() {
            animationId = requestAnimationFrame(animate);
            if (!isVisible) return;
            
            var lerpSpeed = isHovered ? 0.08 : 0.05;
            currentRotation.x += (targetRotation.x - currentRotation.x) * lerpSpeed;
            currentRotation.y += (targetRotation.y - currentRotation.y) * lerpSpeed;
            
            mesh.rotation.x = currentRotation.x;
            mesh.rotation.y = currentRotation.y;
            
            // Parallax effect: use container's relative position in viewport
            var rect = container.getBoundingClientRect();
            var center = window.innerHeight / 2;
            var offset = (rect.top + rect.height / 2 - center) / window.innerHeight;
            mesh.position.y = -offset * 1.5; // Parallax factor
            
            // Subtle idle motion
            var time = performance.now() * 0.001;
            if (!isHovered) {
                mesh.position.y += Math.sin(time * 0.8) * 0.05;
                mesh.rotation.z = Math.sin(time * 0.4) * 0.02;
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
                frontMaterial.dispose();
                sideMaterial.dispose();
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
    };
})();

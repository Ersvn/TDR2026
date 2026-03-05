import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { GameMap } from './Map.js';

// --- 1. SETUP & TEXTURES ---
const textureLoader = new THREE.TextureLoader();
const paletteTexture = textureLoader.load('Textures/colormap.png');
paletteTexture.flipY = false;
paletteTexture.colorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcae1ff);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 50, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;

// --- 2. GAME STATE ---
let gold = 1000;
let lives = 20;
const MAP_BOUNDARY = 45; // Hur långt kameran får åka
const enemies = [];
const towers = [];
const projectiles = [];
let isBuilding = false;
let selectedConfig = null;
let ghostTower = null;
let rangeIndicator = null;

const loader = new GLTFLoader();
const gameMap = new GameMap(scene, paletteTexture);
gameMap.init();

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(40, 60, 20);
sun.castShadow = true;
scene.add(sun);

// --- 3. TOWER CONFIGS (Fixade filnamn för Square) ---
const towerConfigs = {
    square: {
        name: "Square Tower",
        cost: 250,
        range: 15,
        // Matchar dina tidigare skickade namn: tower-square-bottom-a osv.
        parts: ['tower-square-bottom-a.glb', 'snow-wood-structure-part.glb', 'tower-square-top-a.glb']
    },
    round: {
        name: "Round Hunter",
        cost: 400,
        range: 22,
        parts: ['tower-round-base.glb', 'tower-round-middle-a.glb', 'tower-round-top-b.glb']
    }
};

// --- 4. CORE FUNCTIONS ---

async function createTower(config, isGhost = false) {
    const group = new THREE.Group();
    for (let i = 0; i < config.parts.length; i++) {
        try {
            const gltf = await loader.loadAsync(config.parts[i]);
            const part = gltf.scene;

            part.traverse(node => {
                if (node.isMesh) {
                    node.material = new THREE.MeshStandardMaterial({
                        map: paletteTexture,
                        transparent: isGhost,
                        opacity: isGhost ? 0.5 : 1
                    });
                }
                if (node.name.toLowerCase().includes('tree')) node.visible = false;
            });

            part.position.y = i * 2.0; // Stapling
            group.add(part);
        } catch (err) {
            console.error("Kunde inte ladda del:", config.parts[i], err);
        }
    }
    return group;
}

function spawnEnemy() {
    loader.load('enemy-ufo-a.glb', (gltf) => {
        const ufo = gltf.scene;
        ufo.position.set(-20, 6, 26);
        ufo.userData = { health: 100, targetIdx: 0 };
        ufo.traverse(node => { if(node.isMesh) node.material = new THREE.MeshStandardMaterial({ map: paletteTexture }); });
        scene.add(ufo);
        enemies.push(ufo);
    });
}
setInterval(spawnEnemy, 4000);

function shoot(startPos, target) {
    loader.load('enemy-ufo-beam.glb', (gltf) => {
        const beam = gltf.scene;
        beam.position.copy(startPos);
        beam.traverse(node => { if(node.isMesh) node.material = new THREE.MeshStandardMaterial({ map: paletteTexture }); });
        scene.add(beam);
        projectiles.push({ mesh: beam, target: target, speed: 1.8 });
    });
}

// --- LÅST KAMERA (Edge Scrolling med Bounds) ---
function handleEdgeScrolling(rawX, rawY) {
    const edge = 50;
    const speed = 0.8;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3(0,0,0);

    if (rawX < edge) move.addScaledVector(right, -speed);
    if (rawX > window.innerWidth - edge) move.addScaledVector(right, speed);
    if (rawY < edge) move.addScaledVector(forward, speed);
    if (rawY > window.innerHeight - edge) move.addScaledVector(forward, -speed);

    // Beräkna nästa position
    const nextCamPos = camera.position.clone().add(move);
    const nextTargetPos = controls.target.clone().add(move);

    // CLAMP: Stoppa om vi går utanför MAP_BOUNDARY
    if (Math.abs(nextTargetPos.x) < MAP_BOUNDARY && Math.abs(nextTargetPos.z) < MAP_BOUNDARY) {
        camera.position.copy(nextCamPos);
        controls.target.copy(nextTargetPos);
    }
}

// --- 5. UI ---
const ui = document.createElement('div');
ui.style = "position:absolute; top:20px; left:20px; color:white; font-family:sans-serif; font-size:24px; text-shadow:2px 2px #000; pointer-events:none; z-index:10;";
document.body.appendChild(ui);

const menu = document.createElement('div');
menu.style = "position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:15px; background:rgba(0,0,0,0.8); padding:15px; border:2px solid gold; border-radius:10px; z-index:100;";
document.body.appendChild(menu);

Object.keys(towerConfigs).forEach(key => {
    const cfg = towerConfigs[key];
    const btn = document.createElement('button');
    btn.style = "padding:10px; color:white; background:#333; cursor:pointer; border:1px solid #777;";
    btn.innerHTML = `<strong>${cfg.name}</strong><br>${cfg.cost}g`;
    btn.onclick = async () => {
        selectedConfig = cfg;
        isBuilding = true;
        if(ghostTower) scene.remove(ghostTower);
        if(rangeIndicator) scene.remove(rangeIndicator);

        ghostTower = await createTower(cfg, true);
        scene.add(ghostTower);

        const circleGeo = new THREE.RingGeometry(cfg.range - 0.2, cfg.range, 64);
        const circleMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        rangeIndicator = new THREE.Mesh(circleGeo, circleMat);
        rangeIndicator.rotation.x = Math.PI / 2;
        scene.add(rangeIndicator);
    };
    menu.appendChild(btn);
});

// --- 6. ANIMATION LOOP ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const rawMouse = { x: 0, y: 0 };
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function animate() {
    requestAnimationFrame(animate);
    handleEdgeScrolling(rawMouse.x, rawMouse.y);

    if(isBuilding && ghostTower) {
        raycaster.setFromCamera(mouse, camera);
        const inter = new THREE.Vector3();
        if(raycaster.ray.intersectPlane(plane, inter)) {
            const gx = Math.round(inter.x/2)*2;
            const gz = Math.round(inter.z/2)*2;
            ghostTower.position.set(gx, 0, gz);
            rangeIndicator.position.set(gx, 0.1, gz);
        }
    }

    // Fiender & Projektiler logik...
    enemies.forEach((ufo, i) => {
        const target = gameMap.path[ufo.userData.targetIdx];
        if(target) {
            const dir = new THREE.Vector3(target.x, 6, target.z).sub(ufo.position);
            if(dir.length() < 0.5) ufo.userData.targetIdx++;
            ufo.position.add(dir.normalize().multiplyScalar(0.12));
            ufo.rotation.y += 0.03;
        } else {
            scene.remove(ufo);
            enemies.splice(i, 1);
            lives--;
        }
    });

    towers.forEach(t => {
        t.userData.cd = (t.userData.cd || 0) - 1;
        if(t.userData.cd <= 0) {
            const target = enemies.find(e => e.position.distanceTo(new THREE.Vector3(t.position.x, 6, t.position.z)) < t.userData.range);
            if(target) {
                shoot(t.position.clone().add(new THREE.Vector3(0, 6, 0)), target);
                t.userData.cd = 60;
            }
        }
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if(!enemies.includes(p.target)) { scene.remove(p.mesh); projectiles.splice(i, 1); continue; }
        const dir = p.target.position.clone().sub(p.mesh.position).normalize();
        p.mesh.position.add(dir.multiplyScalar(p.speed));
        p.mesh.lookAt(p.target.position);
        if(p.mesh.position.distanceTo(p.target.position) < 1.2) {
            p.target.userData.health -= 35;
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            if(p.target.userData.health <= 0) {
                gold += 50;
                scene.remove(p.target);
                const eIdx = enemies.indexOf(p.target);
                if(eIdx > -1) enemies.splice(eIdx, 1);
            }
        }
    }

    ui.innerText = `GULD: ${gold} | LIV: ${lives}`;
    controls.update();
    renderer.render(scene, camera);
}

// --- 7. INPUT ---
window.addEventListener('mousemove', (e) => {
    rawMouse.x = e.clientX; rawMouse.y = e.clientY;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', async (e) => {
    if(e.button === 0 && isBuilding && ghostTower && gold >= selectedConfig.cost) {
        if(gameMap.isBuildable(ghostTower.position.x, ghostTower.position.z)) {
            const tower = await createTower(selectedConfig, false);
            tower.position.copy(ghostTower.position);
            tower.userData = { range: selectedConfig.range, cd: 0 };
            scene.add(tower);
            towers.push(tower);
            gold -= selectedConfig.cost;
        }
    }
    if(e.button === 2) {
        isBuilding = false;
        if(ghostTower) { scene.remove(ghostTower); scene.remove(rangeIndicator); }
    }
});

animate();
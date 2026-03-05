import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class GameMap {
    constructor(scene, paletteTexture) {
        this.scene = scene;
        this.paletteTexture = paletteTexture;
        this.loader = new GLTFLoader();
        this.path = [
            {x: -20, z: 24}, {x: -20, z: 10}, {x: -20, z: 0},
            {x: -10, z: 0}, {x: 0, z: 0}, {x: 10, z: 0}, {x: 24, z: 0}
        ];
        this.obstacles = [];
        this.MAP_SIZE = 40;
    }

    async init() {
        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        this.path.forEach(p => this.loadAsset('snow-tile-straight.glb', p.x, p.z));
        this.loadAsset('snow-tile-spawn.glb', -20, 26);
        this.loadAsset('snow-tile-end.glb', 26, 0, Math.PI/2);
    }

    loadAsset(name, x, z, rot = 0) {
        this.loader.load(name, (gltf) => {
            const model = gltf.scene;
            model.position.set(x, 0, z);
            model.rotation.y = rot;
            model.traverse(node => {
                if (node.isMesh) node.material = new THREE.MeshStandardMaterial({ map: this.paletteTexture });
            });
            this.scene.add(model);
            this.obstacles.push({x, z});
        });
    }

    isBuildable(x, z) {
        return !this.obstacles.some(o => Math.abs(o.x - x) < 1.5 && Math.abs(o.z - z) < 1.5);
    }
}
/**
 * MathMon 3D overworld — terrain + water built from MathMonWorldData.
 *
 *  - Heightfield: 1 vertex per meter, heights blended between tile centers
 *    (MathMonWorldData.get(key).heightAt) plus soft noise; the mesh extends
 *    PAD tiles beyond the map so hills / cliffs / sea hide the world edge.
 *  - Splat shading: an RGBA weight texture (1 texel per tile, bilinear-blended
 *    on the GPU) mixes four tiled PBR albedo textures — grass, dirt, sand,
 *    rock — and steep slopes fade to rock automatically.
 */
import * as THREE from 'three';
import { surfaceTextures } from '../battle-3d/core.js';

export const PAD = 14;   // tiles of scenery beyond each map edge

const THEME_GROUND = {
    grass: { grass: ['#4f8f3a', '#2d5a22', '#78b356'], dirt: ['#b0916a', '#7a5f42', '#cdb08a'], sand: ['#d9c08a', '#a88a5a', '#efdcae'], rock: ['#7a746c', '#3c3834', '#a39a90'] },
    cave:  { grass: ['#4a4560', '#26233a', '#6c6688'], dirt: ['#5a5070', '#2c2640', '#7a6f96'], sand: ['#6a6280', '#3a3450', '#8c84a6'], rock: ['#4a4458', '#1c1a26', '#6e6684'] },
    water: { grass: ['#5c9a3e', '#335f24', '#86c25c'], dirt: ['#a07c52', '#5c4430', '#c4a27a'], sand: ['#e6cf96', '#b89b66', '#f6e7c0'], rock: ['#7f786f', '#403b35', '#a8a097'] }
};

/** Splat weights (grass, dirt, sand, rock) per tile type. */
function splatFor(T, t) {
    switch (t) {
        case T.PATH: case T.FLOOR: return [0, 255, 0, 0];
        case T.FIELD: return [40, 215, 0, 0];
        case T.SAND: case T.PALM: case T.PIER: return [0, 0, 255, 0];
        case T.WATER: return [0, 60, 195, 0];
        case T.WALL: case T.CRYSTAL: return [0, 40, 0, 215];
        default: return [255, 0, 0, 0];
    }
}

/**
 * @param {object} map    MathMonWorldData.get(key)
 * @param {object} world  MathMonWorldData (constants)
 * @param {object} quality { tier }
 */
export function buildTerrain(map, world, quality) {
    const T = world.T;
    const TM = world.TILE_METERS;
    const W = map.width + PAD * 2;
    const H = map.height + PAD * 2;
    const theme = map.theme;
    const seed = map.seed;
    const noise = world.noise2;

    // ---- Height function (tile-space, includes the scenery pad) ----------------------
    const tileHeight = (tx, ty) => {
        const cx = Math.max(0, Math.min(map.width - 1, tx));
        const cy = Math.max(0, Math.min(map.height - 1, ty));
        let h = map.heightAt(cx, cy);
        const outY = ty < 0 ? -ty : ty >= map.height ? ty - map.height + 1 : 0;
        const outX = tx < 0 ? -tx : tx >= map.width ? tx - map.width + 1 : 0;
        if (theme === 'grass') h += outY * 0.9 + noise(tx * 0.3, ty * 0.3, seed) * outY * 0.5;
        if (theme === 'cave') h += Math.min(14, (outY + Math.max(0, outX - 3)) * 2.4) + noise(tx * 0.5, ty * 0.5, seed) * 2 * Math.min(1, outY);
        if (theme === 'water') h += tx >= map.width ? -0.4 : outY * 0.7 + (tx < 0 ? outX * 0.2 : 0);
        return h;
    };
    // bilinear between tile centers
    const heightAtTile = (fx, fy) => {
        const x = fx - 0.5, y = fy - 0.5;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const u = x - x0, v = y - y0;
        const a = tileHeight(x0, y0), b = tileHeight(x0 + 1, y0), c = tileHeight(x0, y0 + 1), d = tileHeight(x0 + 1, y0 + 1);
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    };
    const detail = (x, z) => (noise(x * 0.18, z * 0.18, seed + 9) - 0.5) * (theme === 'cave' ? 0.5 : 0.35);
    /** Ground height in meters at world (x, z). */
    const heightAtWorld = (x, z) => {
        const fx = x / TM, fy = z / TM;
        let h = heightAtTile(fx, fy);
        const t = map.tileAt(Math.floor(fx), Math.floor(fy));
        const inside = fx >= 0 && fy >= 0 && fx < map.width && fy < map.height;
        if (!inside || (t !== T.PATH && t !== T.FLOOR && t !== T.PIER)) h += detail(x, z);
        if (t === T.WALL && inside) h += noise(x * 0.6, z * 0.6, seed + 4) * 1.6;
        return h;
    };

    // ---- Mesh --------------------------------------------------------------------------
    const res = quality.tier === 'low' ? 1 : 2;                      // vertices per tile
    const geo = new THREE.PlaneGeometry(W * TM, H * TM, W * res, H * res);
    geo.rotateX(-Math.PI / 2);
    geo.translate((map.width * TM) / 2, 0, (map.height * TM) / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAtWorld(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();

    // Splat texture: 1 texel per tile (pad included), bilinear filtering blends edges.
    const data = new Uint8Array(W * H * 4);
    for (let ty = -PAD; ty < map.height + PAD; ty++) {
        for (let tx = -PAD; tx < map.width + PAD; tx++) {
            const inside = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
            let t = inside ? map.tileAt(tx, ty) : (theme === 'cave' ? T.WALL : theme === 'water' && tx >= map.width ? T.SAND : T.GRASS);
            if (!inside && theme === 'grass' && Math.abs(ty < 0 ? ty : ty - map.height) > 4) t = T.GRASS;
            const w = splatFor(T, t);
            const i = ((ty + PAD) * W + (tx + PAD)) * 4;
            data[i] = w[0]; data[i + 1] = w[1]; data[i + 2] = w[2]; data[i + 3] = w[3];
        }
    }
    const splat = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    splat.magFilter = THREE.LinearFilter;
    splat.minFilter = THREE.LinearFilter;
    splat.flipY = false;
    splat.needsUpdate = true;

    const g = THEME_GROUND[theme] || THEME_GROUND.grass;
    const tex = (name, colors, pattern, seedOff, cracks) => surfaceTextures(`ground-${theme}-${name}`, {
        pattern, color: colors[0], dark: colors[1], light: colors[2], seed: seed + seedOff, size: 256, period: 8, roughness: 0.9, cracks
    });
    const grass = tex('grass', g.grass, 'skin', 1, false);
    const dirt = tex('dirt', g.dirt, 'skin', 2, false);
    const sand = tex('sand', g.sand, 'skin', 3, false);
    const rock = tex('rock', g.rock, 'rock', 4, true);

    const uniforms = {
        tSplat: { value: splat }, tGrass: { value: grass.map }, tDirt: { value: dirt.map }, tSand: { value: sand.map }, tRock: { value: rock.map },
        uOrigin: { value: new THREE.Vector2(-PAD * TM, -PAD * TM) }, uSize: { value: new THREE.Vector2(W * TM, H * TM) }, uRepeat: { value: 0.22 }
    };
    const normalMap = rock.normalMap.clone();
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(W * TM * 0.22, H * TM * 0.22);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec2 vWorldXZ; varying float vSlope;\n' + shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\nvSlope = normalize(mat3(modelMatrix) * objectNormal).y;');
        shader.fragmentShader = `uniform sampler2D tSplat, tGrass, tDirt, tSand, tRock; uniform vec2 uOrigin, uSize; uniform float uRepeat;
            varying vec2 vWorldXZ; varying float vSlope;\n` + shader.fragmentShader.replace('#include <map_fragment>', `
            vec2 suv = (vWorldXZ - uOrigin) / uSize;
            vec4 w = texture2D(tSplat, suv);
            vec2 tuv = vWorldXZ * uRepeat;
            vec3 c = texture2D(tGrass, tuv).rgb * w.r + texture2D(tDirt, tuv).rgb * w.g + texture2D(tSand, tuv).rgb * w.b + texture2D(tRock, tuv * 0.7).rgb * w.a;
            c /= max(w.r + w.g + w.b + w.a, 0.001);
            float steep = 1.0 - smoothstep(0.62, 0.86, vSlope);
            c = mix(c, texture2D(tRock, tuv * 0.7).rgb, steep);
            diffuseColor.rgb *= c;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';

    // ---- Water ----------------------------------------------------------------------------
    let water = null;
    const waterUniforms = { uTime: { value: 0 }, uAmp: { value: 1 } };
    let hasWater = theme === 'water';
    for (let i = 0; i < map.grid.length && !hasWater; i++) if (map.grid[i] === T.WATER) hasWater = true;
    if (hasWater) {
        const color = theme === 'water' ? '#167a95' : theme === 'cave' ? '#14204a' : '#2b6f80';
        const wmat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
            transparent: true, opacity: 0.88, envMapIntensity: 1.2 });
        wmat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, waterUniforms);
            shader.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + shader.vertexShader
                .replace('#include <beginnormal_vertex>', `
                    float wa = sin(position.x * 0.35 + uTime * 1.3) * 0.06 + sin(position.z * 0.5 - uTime * 1.7) * 0.05;
                    vec3 objectNormal = normalize(vec3(-cos(position.x * 0.35 + uTime * 1.3) * 0.021 * uAmp, 1.0, -cos(position.z * 0.5 - uTime * 1.7) * 0.025 * uAmp));`)
                .replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(0.0, wa * uAmp, 0.0);');
        };
        const wgeo = new THREE.PlaneGeometry(W * TM, H * TM, W, H);
        wgeo.rotateX(-Math.PI / 2);
        wgeo.translate((map.width * TM) / 2, -0.45, (map.height * TM) / 2);
        water = new THREE.Mesh(wgeo, wmat);
        water.receiveShadow = true;
        water.name = 'water';
    }

    return {
        mesh, water, heightAtWorld,
        update(t, reducedMotion) {
            waterUniforms.uTime.value = t;
            waterUniforms.uAmp.value = reducedMotion ? 0.25 : 1;
        }
    };
}

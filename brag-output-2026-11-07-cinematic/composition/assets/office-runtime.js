const THREE = window.THREE;

const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;

function rounded(w, h, depth, radius) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2, r = radius;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .018, bevelThickness: .015, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    return g;
}

function homography(points, w, h) {
    const source = [[0, 0], [w, 0], [w, h], [0, h]];
    const rows = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = source[i], [u, v] = points[i];
        rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let i = 0; i < 8; i++) {
        let pivot = i;
        for (let j = i + 1; j < 8; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
        [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
        const d = rows[i][i];
        for (let k = i; k < 9; k++) rows[i][k] /= d;
        for (let j = 0; j < 8; j++) {
            if (i === j) continue;
            const f = rows[j][i];
            for (let k = i; k < 9; k++) rows[j][k] -= f * rows[i][k];
        }
    }
    const a = rows.map(row => row[8]);
    return `matrix3d(${[a[0], a[3], 0, a[6], a[1], a[4], 0, a[7], 0, 0, 1, 0, a[2], a[5], 0, 1].join(',')})`;
}

function createOffice({ canvas, screen, petCanvas, petWrapper, power, videoWrapper, id, start, duration, returning }) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(1920, 1080, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const world = new THREE.Scene();
    world.background = new THREE.Color('#08090c');
    world.fog = new THREE.FogExp2('#08090c', .036);
    const camera = new THREE.PerspectiveCamera(34, 1920 / 1080, .05, 80);
    const material = (color, roughness = .7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const metal = material('#74757c', .36, .78);
    const darkMetal = material('#26272e', .42, .65);
    const black = material('#08090b', .5, .1);
    const wall = material('#222126', .95);
    const add = (geo, mat, pos, parent = world) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const box = (size, mat, pos, parent) => add(new THREE.BoxGeometry(...size), mat, pos, parent);
    const texCanvas = document.createElement('canvas'); texCanvas.width = 512; texCanvas.height = 512;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#352a24'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i++) {
        const tone = Math.round(38 + 10 * Math.sin(i * .17) + 5 * Math.sin(i * 1.73));
        ctx.strokeStyle = `rgba(${tone + 31},${tone + 15},${tone + 6},.5)`;
        ctx.beginPath(); ctx.moveTo(0, i); ctx.bezierCurveTo(160, i + Math.sin(i * .04) * 9, 320, i - 5, 512, i); ctx.stroke();
    }
    const wood = new THREE.CanvasTexture(texCanvas); wood.colorSpace = THREE.SRGBColorSpace;
    const deskMat = new THREE.MeshStandardMaterial({ map: wood, roughness: .67, metalness: .05 });
    box([12, .20, 6.8], deskMat, [0, -.12, .5]);
    for (const x of [-5, 5]) for (const z of [-2, 3]) box([.18, 3, .18], darkMetal, [x, -1.7, z]);
    box([24, 9, .2], wall, [0, 1.2, -6]);
    box([.2, 9, 18], wall, [-9, 1.2, 0]);
    box([28, .2, 24], material('#141416', .9), [0, -3.2, 0]);
    for (let i = 0; i < 9; i++) box([.022, 3.1, .025], material('#38363a', .9), [-6.5 + i * .58, 2.6, -5.86]);
    const base = add(rounded(4.7, 3.18, .14, .16), metal, [0, .12, 0]); base.rotation.x = -Math.PI / 2;
    const keyboard = box([3.87, .025, 1.35], black, [0, .215, -.48]);
    const keyMat = material('#101116', .4, .1);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 13; col++) {
        const key = add(rounded(.235, .18, .015, .035), keyMat, [-1.69 + col * .282, .24, -1.0 + row * .247]);
        key.rotation.x = -Math.PI / 2;
    }
    box([1.5, .012, .19], keyMat, [0, .244, .22]);
    const pad = add(rounded(1.65, .83, .012, .06), material('#65666e', .37, .7), [0, .211, .89]); pad.rotation.x = -Math.PI / 2;
    for (const x of [-2.13, 2.13]) for (let r = 0; r < 26; r++) box([.16, .008, .018], black, [x, .225, -.95 + r * .046]);
    const lip = box([1.04, .015, .028], darkMetal, [0, .12, 1.606]);
    const lid = new THREE.Group(); lid.position.set(0, 1.67, -1.36); lid.rotation.x = -.105; world.add(lid);
    add(rounded(4.72, 3.02, .09, .13), darkMetal, [0, 0, 0], lid);
    add(rounded(4.59, 2.91, .014, .10), black, [0, 0, .056], lid);
    add(rounded(4.43, 2.77, .008, .055), material('#030305', .25), [0, 0, .067], lid);
    const notch = add(rounded(.43, .115, .028, .035), black, [0, 1.335, .088], lid);
    add(new THREE.SphereGeometry(.011, 12, 8), material('#181b22', .08, .9), [.10, 1.35, .11], lid);
    const hinge = add(new THREE.CylinderGeometry(.09, .09, 4.25, 24), black, [0, .20, -1.40]); hinge.rotation.z = Math.PI / 2;
    const notebook = add(rounded(1.62, 2.05, .07, .045), material('#29282e', .83), [-3.55, .09, .54]); notebook.rotation.x = -Math.PI / 2; notebook.rotation.z = -.14;
    box([.018, .018, 1.8], material('#9c8d7c', .4, .3), [-3.9, .15, .6]);
    const cupMat = material('#39363b', .29);
    const cup = add(new THREE.CylinderGeometry(.34, .29, .69, 48, 1, true), cupMat, [3.5, .36, -.7]);
    add(new THREE.CylinderGeometry(.323, .323, .012, 48), material('#17100c', .17), [3.5, .65, -.7]);
    const handle = add(new THREE.TorusGeometry(.23, .058, 12, 32), cupMat, [3.88, .38, -.7]); handle.rotation.y = Math.PI / 2;
    add(new THREE.CylinderGeometry(.40, .45, .07, 48), darkMetal, [-4.5, .05, -1.5]);
    box([.055, 2.4, .055], darkMetal, [-4.5, 1.23, -1.5]);
    const lampHead = add(new THREE.ConeGeometry(.55, .43, 40, 1, true), darkMetal, [-4.5, 2.55, -1.5]);
    const bulb = add(new THREE.SphereGeometry(.08, 16, 10), new THREE.MeshBasicMaterial({ color: '#e7cfb4' }), [-4.5, 2.35, -1.5]);
    const ambient = new THREE.HemisphereLight('#a4a5be', '#171113', .25); world.add(ambient);
    const rim = new THREE.DirectionalLight('#a398c4', 1.7); rim.position.set(2.5, 4, -4); world.add(rim);
    const key = new THREE.SpotLight('#f0d4b7', 45, 18, .62, .8, 2); key.position.set(-4.5, 2.36, -1.5); key.target.position.set(-2, 0, .5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0002; key.shadow.normalBias = .025; world.add(key, key.target);
    const screenLight = new THREE.PointLight('#bbb5e2', 0, 7, 2); screenLight.position.set(0, 1.6, -.7); world.add(screenLight);
    const front = new THREE.DirectionalLight('#b9bdcf', .35); front.position.set(1, 5, 7); world.add(front);
    const pet = new window.MochiBotEngine(); pet.catEars = true; pet.hands = 0;
    const points = [[-2.215, 1.385, .078], [2.215, 1.385, .078], [2.215, -1.385, .078], [-2.215, -1.385, .078]].map(p => new THREE.Vector3(...p));
    const temp = new THREE.Vector3();

    function renderAt(time) {
        const t = Math.max(0, Math.min(duration, time));
        const light = returning ? 1 : smooth((t - 4.75) / 1.0);
        screenLight.intensity = mix(.06, 8, light);
        ambient.intensity = mix(.12, .30, light);
        key.intensity = mix(14, 29, light);
        const energy = window.MUSIC_ENERGY?.[Math.min(2399, Math.round((t + start) * 30))] ?? 0;
        front.intensity = .20 + light * .28 + energy * .018;
        if (returning) {
            const pull = smooth((t - 5.2) / 2.4);
            camera.position.set(mix(0, 5.3, pull), mix(2.82, 3.2, pull), mix(.70, 9.8, pull));
            camera.lookAt(mix(0, -2.1, pull), mix(2.76, 1.15, pull), -1.35);
            videoWrapper.style.opacity = '1';
            petWrapper.style.left = '765px'; petWrapper.style.top = '-17px'; petWrapper.style.width = '70px'; petWrapper.style.height = '70px';
            pet.open = 1 - .90 * Math.exp(-Math.pow((t - 3.1) / .10, 2));
            pet.eyeOverride = t > 4.0 ? 'happy' : 'pill';
            pet.yaw = .18 * Math.sin(t * .7); pet.pitch = -.04; pet.roll = .025 * Math.sin(t);
        } else {
            const p = smooth(t / 10), dive = smooth((t - 9.5) / 6.5);
            camera.position.set(mix(mix(5.9, 2.5, p), .03, dive), mix(mix(3.4, 2.7, p), 1.66, dive), mix(mix(9.2, 5.7, p), 2.35, dive));
            camera.lookAt(mix(.1, 0, p), mix(.95, 1.66, p), mix(-.6, -1.36, p));
            videoWrapper.style.opacity = String(smooth((t - 4.85) / .8));
            const move = smooth((t - 2.9) / 1.6), settle = smooth((t - 5.4) / 3.0);
            const px = mix(mix(640, 1040, move), 765, settle), py = mix(mix(340, 560, move), -17, settle);
            petWrapper.style.left = `${px}px`; petWrapper.style.top = `${py}px`;
            const size = mix(320, 70, settle); petWrapper.style.width = `${size}px`; petWrapper.style.height = `${size}px`;
            pet.open = mix(.07, 1, smooth((t - 1.4) / .8));
            pet.yaw = t < 2.7 ? .40 * Math.sin((t - 1.5) * 2.2) * smooth((t - 1.4) / .5) : mix(.35, 0, settle);
            pet.pitch = .10 * move; pet.roll = -.06 * move * (1 - settle);
            pet.sx = 1 + .13 * Math.exp(-Math.pow((t - 4.70) / .12, 2));
            pet.sy = 1 - .15 * Math.exp(-Math.pow((t - 4.70) / .12, 2));
            pet.eyeOverride = t < 1.7 ? 'closed' : 'pill';
        }
        pet.draw(petCanvas.getContext('2d'), 500, 500);
        petWrapper.style.opacity = returning ? '1' : String(mix(.35, 1, smooth(t / 2)));
        power.style.opacity = returning ? '0' : String((1 - smooth((t - 5.0) / .6)) * smooth((t - 2.5) / .7));
        power.style.background = t >= 4.75 ? '#bfb1e9' : '#38323e';
        world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const projected = points.map(p => { temp.copy(p).applyMatrix4(lid.matrixWorld).project(camera); return [(temp.x + 1) * 960, (1 - temp.y) * 540]; });
        screen.style.transform = homography(projected, 1600, 1000);
        renderer.render(world, camera);
    }
    const clock = { time: 0 };
    const tl = window.gsap.timeline({ paused: true });
    tl.to(clock, { time: duration, duration, ease: 'none', onUpdate: () => renderAt(clock.time) }, 0);
    window.addEventListener('hf-seek', event => renderAt(event.detail.time - start));
    renderAt(0);
    window.__timelines[id] = tl;
    return { renderAt, world, camera };
}

window.KronOffice = { createOffice };

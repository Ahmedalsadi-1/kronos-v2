// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as THREE from "three";
import { IslandDepots, IslandLaunch } from "./island-flight";

const Outline = [1, 0.98, 1.08, 0.88, 0.98, 1.02, 0.93, 1.06, 0.98, 0.93, 1.04, 0.96];
const DepotColors = [0xf5b65f, 0x86c1ea, 0xe69ba4];
const RockColors = [0x38494d, 0x4c5b58, 0x62706a, 0x7c7f6b, 0x556463];

function rim(index: number, radius: number, y: number, offset = 0) {
    const i = index % Outline.length;
    const angle = (i / Outline.length) * Math.PI * 2 + offset;
    return new THREE.Vector3(Math.cos(angle) * radius * Outline[i], y, Math.sin(angle) * radius * Outline[i]);
}

export function makeIslandScene(playable: boolean) {
    const scene = new THREE.Scene();
    const island = new THREE.Group();
    scene.add(island);
    const materials = new Map<number, THREE.MeshStandardMaterial>();
    const material = (color: number) => {
        if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true }));
        return materials.get(color)!;
    };
    const mesh = (
        parent: THREE.Object3D,
        geometry: THREE.BufferGeometry,
        color: number,
        x: number,
        y: number,
        z: number
    ) => {
        const object = new THREE.Mesh(geometry, material(color));
        object.position.set(x, y, z);
        parent.add(object);
        return object;
    };
    const box = (
        parent: THREE.Object3D,
        color: number,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number
    ) => mesh(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z);
    const cylinder = (
        parent: THREE.Object3D,
        color: number,
        x: number,
        y: number,
        z: number,
        radius: number,
        h: number
    ) => mesh(parent, new THREE.CylinderGeometry(radius, radius, h, 12), color, x, y, z);

    const positions: number[] = [];
    const colors: number[] = [];
    const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) => {
        const tint = new THREE.Color(color);
        for (const point of [a, b, c]) {
            positions.push(point.x, point.y, point.z);
            colors.push(tint.r, tint.g, tint.b);
        }
    };
    const grass = [0x779a66, 0x8dae73, 0x85a06a, 0x9eb781];
    for (let i = 0; i < Outline.length; i++) {
        const j = i + 1;
        const a = rim(i, 5.65, 0);
        const b = rim(j, 5.65, 0);
        const c = rim(i, 4.9, -1.36 - (i % 3) * 0.17, 0.11);
        const d = rim(j, 4.9, -1.36 - ((j % Outline.length) % 3) * 0.17, 0.11);
        const e = rim(i, 2.7, -3.45, -0.08);
        const f = rim(j, 2.7, -3.45, -0.08);
        const g = rim(i, 0.65, -4.4 + (i % 2) * 0.15, 0.15);
        const h = rim(j, 0.65, -4.4 + ((j % Outline.length) % 2) * 0.15, 0.15);
        triangle(new THREE.Vector3(), b, a, grass[i % grass.length]);
        triangle(a, b, c, RockColors[i % RockColors.length]);
        triangle(b, d, c, RockColors[(i + 2) % RockColors.length]);
        triangle(c, d, f, RockColors[(i + 1) % RockColors.length]);
        triangle(c, f, e, RockColors[(i + 3) % RockColors.length]);
        triangle(e, f, g, RockColors[(i + 4) % RockColors.length]);
        triangle(f, h, g, RockColors[i % RockColors.length]);
        triangle(g, h, new THREE.Vector3(0, -4.8, 0), RockColors[0]);
    }
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    island.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })));

    const path = (x1: number, z1: number, x2: number, z2: number) => {
        const segment = box(
            island,
            0xb4b18b,
            (x1 + x2) / 2,
            0.015,
            (z1 + z2) / 2,
            0.36,
            0.025,
            Math.hypot(x2 - x1, z2 - z1)
        );
        segment.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    };
    path(-0.95, 0.5, 0.1, 2);
    path(0.1, 2, 2.7, 3.5);
    path(-0.95, 0.5, -3.65, 1.3);
    path(-0.95, -0.3, 0.1, -3.9);
    path(0.1, 2, IslandLaunch.x, IslandLaunch.z);

    const pines = [
        [-4.0, -0.2, 1.3],
        [-3.45, -1.35, 1.7],
        [-2.65, -2.5, 1.3],
        [-3.2, -3.05, 1.1],
        [2.3, -3.2, 1.55],
        [3.25, -2.5, 1.95],
        [3.95, -1.73, 1.25],
        [3.6, -0.7, 1.48],
        [-0.7, 3.8, 1.05],
        [-1.3, 3.7, 1.55],
        [-2.05, 3.35, 1.27],
        [4.35, 1.35, 1.72],
        [3.95, 2.15, 1.28],
        [1.35, -3.85, 0.92],
        [-2.15, -3.8, 1.05],
    ];
    for (const [x, z, height] of pines) {
        cylinder(island, 0x796656, x, height * 0.2, z, height * 0.07, height * 0.4);
        mesh(island, new THREE.ConeGeometry(height * 0.32, height * 0.66, 5), 0x3a6d58, x, height * 0.57, z);
        mesh(island, new THREE.ConeGeometry(height * 0.25, height * 0.63, 5), 0x50856a, x, height * 0.83, z);
    }
    for (const [x, z, scale] of [
        [-4.6, 0.45, 0.44],
        [1.3, 4.4, 0.34],
        [4.65, 0, 0.48],
        [-0.65, -4.65, 0.31],
    ]) {
        const rock = mesh(island, new THREE.DodecahedronGeometry(scale), 0x8c9684, x, scale * 0.44, z);
        rock.scale.y = 0.68;
        rock.rotation.y = x;
    }

    const house = new THREE.Group();
    house.position.set(-0.95, 0, -0.65);
    island.add(house);
    box(house, 0xc8bb9a, 0, 0.14, 0, 1.7, 0.28, 1.38);
    box(house, 0xf7d294, 0, 0.64, 0, 1.45, 0.82, 1.13);
    const roof = mesh(house, new THREE.CylinderGeometry(1.02, 1.02, 1.37, 3), 0x9e4c3c, 0, 0.94, 0);
    roof.rotation.x = Math.PI / 2;
    roof.scale.z = 0.61;
    box(house, 0x4b655a, -0.23, 0.48, 0.583, 0.28, 0.49, 0.045);
    box(house, 0x597d76, 0.32, 0.72, 0.583, 0.37, 0.31, 0.045);
    box(house, 0xf5d9a6, 0.32, 0.72, 0.609, 0.038, 0.31, 0.015);
    box(house, 0x7b6759, 0.43, 1.23, -0.19, 0.2, 0.61, 0.23);

    const beacons = IslandDepots.map(({ x, z }, index) => {
        cylinder(island, 0x495c57, x, 0.07, z, 0.78, 0.14);
        cylinder(island, DepotColors[index], x, 0.16, z, 0.66, 0.055);
        cylinder(island, 0x62756b, x, 0.194, z, 0.48, 0.035);
        box(island, 0xf4e8c9, x, 0.22, z, 0.43, 0.02, 0.085);
        box(island, 0xf4e8c9, x, 0.22, z, 0.085, 0.02, 0.43);
        const poleX = x - 0.64;
        cylinder(island, 0x455654, poleX, 0.47, z - 0.42, 0.04, 0.94);
        box(island, DepotColors[index], poleX + 0.16, 0.82, z - 0.42, 0.32, 0.2, 0.05);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.83, 0.036, 7, 40),
            new THREE.MeshBasicMaterial({ color: 0xffe098 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.29, z);
        ring.visible = false;
        island.add(ring);
        return ring;
    });
    cylinder(island, 0x596e64, IslandLaunch.x, 0.07, IslandLaunch.z, 0.62, 0.14);
    cylinder(island, 0xe8d8af, IslandLaunch.x, 0.15, IslandLaunch.z, 0.51, 0.045);

    const windsock = new THREE.Group();
    island.add(windsock);
    cylinder(windsock, 0x535e57, 0, 0.66, 0, 0.045, 1.32);
    const fabric = new THREE.Group();
    fabric.position.y = 1.27;
    windsock.add(fabric);
    for (let i = 0; i < 4; i++) {
        const band = mesh(
            fabric,
            new THREE.CylinderGeometry(0.18 - i * 0.026, 0.15 - i * 0.026, 0.145, 8),
            i % 2 ? 0xf8dfb5 : 0xd55a37,
            0.12 + i * 0.14,
            0,
            0
        );
        band.rotation.z = Math.PI / 2;
    }
    const selection = new THREE.Mesh(
        new THREE.TorusGeometry(0.37, 0.024, 6, 28),
        new THREE.MeshBasicMaterial({ color: 0xffdf9a })
    );
    selection.rotation.x = -Math.PI / 2;
    selection.position.y = 0.06;
    selection.visible = false;
    windsock.add(selection);

    const ship = new THREE.Group();
    ship.visible = playable;
    island.add(ship);
    box(ship, 0xf3d39a, 0, 0, 0, 0.33, 0.23, 0.78);
    box(ship, 0xeb9562, 0, -0.06, 0, 1.04, 0.09, 0.33);
    box(ship, 0x526e69, 0, 0.1, 0.17, 0.22, 0.15, 0.27);
    box(ship, 0xe7a457, 0, 0.11, -0.33, 0.08, 0.24, 0.21);
    box(ship, 0xfbeace, -0.45, 0, 0.02, 0.13, 0.08, 0.26);
    box(ship, 0xfbeace, 0.45, 0, 0.02, 0.13, 0.08, 0.26);

    scene.add(new THREE.HemisphereLight(0xfff3d7, 0x8295a4, 2.1));
    const sun = new THREE.DirectionalLight(0xffedcb, 2.4);
    sun.position.set(-4, 10, 5);
    scene.add(sun);
    return { scene, ship, beacons, windsock, fabric, selection };
}

export function disposeIsland(scene: THREE.Scene) {
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        materials.add(object.material);
    });
    for (const material of materials) material.dispose();
}

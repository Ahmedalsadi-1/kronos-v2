// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const LiquidChromeVertexShader = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

export const LiquidChromeFragmentShader = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float dark;

float surface(vec2 p) {
    p += 0.36 * vec2(sin(p.y * 1.5 + time * 0.21), cos(p.x * 1.1 - time * 0.17));
    return sin(p.x * 1.6 + p.y * 2.1 + sin(p.y * 1.8 - time * 0.24))
        + 0.48 * sin(p.x * 2.8 - p.y * 1.4 + time * 0.19)
        + 0.22 * cos(p.y * 4.0 + p.x + time * 0.12);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 3.2;
    float h = surface(p);
    float dx = (surface(p + vec2(0.015, 0.0)) - h) / 0.015;
    float dy = (surface(p + vec2(0.0, 0.015)) - h) / 0.015;
    vec3 normal = normalize(vec3(-dx, -dy, 1.3));
    vec3 reflection = reflect(vec3(0.0, 0.0, -1.0), normal);
    float band = reflection.y * 0.8 + reflection.x * 0.35 + h * 0.12;
    float silver = smoothstep(-0.55, 0.5, sin(band * 5.5));
    float edge = pow(0.5 + 0.5 * cos(band * 12.0), 18.0);
    vec3 graphite = mix(vec3(0.025, 0.027, 0.03), vec3(0.42, 0.44, 0.47), silver);
    graphite += edge * 0.35;
    vec3 lavender = mix(vec3(0.25, 0.13, 0.53), vec3(0.77, 0.71, 0.91), silver);
    lavender += edge * vec3(0.23, 0.22, 0.25);
    gl_FragColor = vec4(mix(lavender, graphite, dark), 1.0);
}
`;

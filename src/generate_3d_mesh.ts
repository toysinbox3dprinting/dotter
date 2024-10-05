import { DotData, OUTER_RING_RADIUS, hole_size_lookup, scene, INNER_RING_RADIUS } from ".";
import { Vertex } from "./math";
import { Entity } from "./svg_lib/object";
import * as THREE from 'three';
import earcut from 'earcut';
// @ts-ignore
import { MeshLine, MeshLineMaterial, MeshLineRaycast } from 'three.meshline';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./svg_lib/main";

const HOLE_RESOLUTION = 16;
const DISK_RESOLUTION = 64;
const DISK_THICKNESS = 2.5;
const DISK_BORDER_THICKNESS = 3;

let view_object: THREE.Mesh | undefined = undefined;
let view_outline_object: THREE.LineSegments | undefined = undefined;

export const generate_3d_mesh = (dots: Entity<DotData, any>[]) => {
    const points = dots.map(dot => [
        dot.data.r * INNER_RING_RADIUS * Math.cos(dot.data.phi),
        dot.data.r * INNER_RING_RADIUS * Math.sin(dot.data.phi),
        hole_size_lookup[dot.data.hole_size] * 0.5
    ]).filter(triplet => Math.sqrt(triplet[0] ** 2 + triplet[1] ** 2) + triplet[2] < INNER_RING_RADIUS);
    points.push([0, -INNER_RING_RADIUS * 0.9, 3]);
    const vertices: number[][] = [];
    const indices: number[] = [];

    // lower big circle
    const lower_big_circle_offset = vertices.length;
    const lower_big_circle_vertices: number[][] = [];
    for(let i = 0; i < DISK_RESOLUTION; i++){
        let theta = i / DISK_RESOLUTION * 2 * Math.PI;
        let dx = INNER_RING_RADIUS * Math.cos(theta);
        let dy = INNER_RING_RADIUS * Math.sin(theta)

        let v = [dx, 0, dy];
        vertices.push(v);
        lower_big_circle_vertices.push(v);
    }

    // lower dot circles
    const lower_dot_offset = vertices.length;
    const lower_dot_hole_offsets: number[] = [];
    const lower_dot_vertices: number[][] = [];
    points.forEach((p, i) => {
        const current_offset = vertices.length;
        lower_dot_hole_offsets.push(current_offset);

        let radius = p[2];
        for(let i = 0; i < HOLE_RESOLUTION; i++){
            let theta = i / HOLE_RESOLUTION * 2 * Math.PI;
            let dx = radius * Math.cos(theta);
            let dy = radius * Math.sin(theta)

            let v = [p[0] + dx, 0, p[1] + dy]
            vertices.push(v);
            lower_dot_vertices.push(v);
        }
    });

    // lower faces to join big circle and dot circles
    const lower_face_indices = earcut(vertices.map(v => [v[0], v[2], v[1]]).flat(), lower_dot_hole_offsets, 3);
    indices.push(...lower_face_indices);

    // upper big circle
    const upper_big_circle_offset = vertices.length;
    const upper_big_circle_vertices: number[][] = [];
    for(let ov of lower_big_circle_vertices){
        let nv = [ov[0], DISK_THICKNESS, ov[2]];
        vertices.push(nv);
        upper_big_circle_vertices.push(nv)
    }

    // upper dot circles
    const upper_dot_offset = vertices.length;
    const upper_dot_vertices: number[][] = [];
    for(let ov of lower_dot_vertices){
        let nv = [ov[0], DISK_THICKNESS, ov[2]];
        vertices.push(nv);
        upper_dot_vertices.push(nv)
    }

    // upper faces to join big circle and dot circles
    const upper_face_indices = chunk_into_3s(lower_face_indices.map(i => i + upper_big_circle_offset))
        .map(triplet => [triplet[0], triplet[2], triplet[1]]).flat();
    indices.push(...upper_face_indices);

    // big disk edge stitches
    // for(let i = 0; i < DISK_RESOLUTION; i++){
    //     indices.push(
    //         lower_big_circle_offset + i,
    //         upper_big_circle_offset + i,
    //         lower_big_circle_offset + (i + 1) % DISK_RESOLUTION
    //     );
    //     indices.push(
    //         upper_big_circle_offset + i,
    //         upper_big_circle_offset + (i + 1) % DISK_RESOLUTION,
    //         lower_big_circle_offset + (i + 1) % DISK_RESOLUTION
    //     );
    // }

    // inner hole edge stiches
    for(let i = 0; i < points.length; i++){
        let current_offset = i * 16;

        for(let i = 0; i < HOLE_RESOLUTION; i++){
            indices.push(
                lower_dot_offset + current_offset + i,
                lower_dot_offset + current_offset + (i + 1) % HOLE_RESOLUTION,
                upper_dot_offset + current_offset + i
            );
            indices.push(
                upper_dot_offset + current_offset + i,
                lower_dot_offset + current_offset + (i + 1) % HOLE_RESOLUTION,
                upper_dot_offset + current_offset + (i + 1) % HOLE_RESOLUTION
            );
        }    
    }
    
    // outmost ring vertices
    const lower_outmost_circle_offset = vertices.length;
    const lower_outmost_circle_vertices: number[][] = [];
    for(let i = 0; i < DISK_RESOLUTION; i++){
        let theta = i / DISK_RESOLUTION * 2 * Math.PI;
        let dx = OUTER_RING_RADIUS * Math.cos(theta);
        let dy = OUTER_RING_RADIUS * Math.sin(theta)
        let v = [dx, 0, dy];
        vertices.push(v);
        lower_outmost_circle_vertices.push(v);
    }
    const top_outmost_circle_offset = vertices.length;
    const top_outmost_circle_vertices: number[][] = [];
    for(let i = 0; i < DISK_RESOLUTION; i++){
        let theta = i / DISK_RESOLUTION * 2 * Math.PI;
        let dx = OUTER_RING_RADIUS * Math.cos(theta);
        let dy = OUTER_RING_RADIUS * Math.sin(theta)
        let v = [dx, DISK_BORDER_THICKNESS, dy];
        vertices.push(v);
        top_outmost_circle_vertices.push(v);
    }
    const top_big_circle_offset = vertices.length;
    const top_big_circle_vertices: number[][] = [];
    for(let i = 0; i < DISK_RESOLUTION; i++){
        let theta = i / DISK_RESOLUTION * 2 * Math.PI;
        let dx = INNER_RING_RADIUS * Math.cos(theta);
        let dy = INNER_RING_RADIUS * Math.sin(theta)
        let v = [dx, DISK_BORDER_THICKNESS, dy];
        vertices.push(v);
        top_big_circle_vertices.push(v);
    }

    // outmost ring indices
    for(let i = 0; i < DISK_RESOLUTION; i++){
        indices.push(
            lower_outmost_circle_offset + i,
            lower_outmost_circle_offset + (i + 1) % DISK_RESOLUTION,
            lower_big_circle_offset + i
        );
        indices.push(
            lower_big_circle_offset + i,
            lower_outmost_circle_offset + (i + 1) % DISK_RESOLUTION,
            lower_big_circle_offset + (i + 1) % DISK_RESOLUTION
        );
        indices.push(
            lower_outmost_circle_offset + i,
            top_outmost_circle_offset + i,
            lower_outmost_circle_offset + (i + 1) % DISK_RESOLUTION
        );
        indices.push(
            top_outmost_circle_offset + i,
            top_outmost_circle_offset + (i + 1) % DISK_RESOLUTION,
            lower_outmost_circle_offset + (i + 1) % DISK_RESOLUTION
        );
        indices.push(
            top_big_circle_offset + i,
            top_big_circle_offset + (i + 1) % DISK_RESOLUTION,
            top_outmost_circle_offset + i
        );
        indices.push(
            top_outmost_circle_offset + i,
            top_big_circle_offset + (i + 1) % DISK_RESOLUTION,
            top_outmost_circle_offset + (i + 1) % DISK_RESOLUTION
        );
        indices.push(
            top_big_circle_offset + i,
            upper_big_circle_offset + i,
            top_big_circle_offset + (i + 1) % DISK_RESOLUTION
        );
        indices.push(
            upper_big_circle_offset + i,
            upper_big_circle_offset + (i + 1) % DISK_RESOLUTION,
            top_big_circle_offset + (i + 1) % DISK_RESOLUTION
        );
    }

    const data = {
        vertices: vertices.map(v => new Vertex(...v)),
        indices: indices
    };
    return view_indexed_triangle(scene, data, 0x00aaff);
}

export const chunk_into_3s = <T>(array: T[]) => {
    const result: T[][] = [];
    for(let i = 0; i < array.length; i += 3){
        result.push(array.slice(i, i + 3));
    }
    return result;
}

export type OBJData = {
    vertices: Vertex[];
    indices: number[];
}

export const view_indexed_triangle = (
    scene: THREE.Scene,
    data: OBJData, 
    color: number
) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
        data.vertices.map(v => v.to_THREE()).flat()
    ), 3));
    geometry.setIndex(data.indices);
    const edges = new THREE.EdgesGeometry(geometry, 30); 

    if(view_object === undefined && view_outline_object === undefined){
        const material = new THREE.MeshBasicMaterial({
            color: color
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffaa00 })); 
        // const lines = new MeshLine();
        // lines.setGeometry(edges);
        // const line_material = new MeshLineMaterial({
        //     resolution: new THREE.Vector2(CANVAS_WIDTH, CANVAS_HEIGHT)
        // });
        // const lines_mesh = new THREE.Mesh(lines, line_material);

        // scene.add(lines_mesh);
        scene.add(lines);
        view_object = mesh;
        view_outline_object = lines;
    }

    else {
        (view_object as THREE.Mesh).geometry = geometry;
        (view_outline_object as THREE.LineSegments).geometry = edges;

        // (view_outline_object as MeshLine).setGeometry(edges);
    }

    return view_object as THREE.Mesh;
}

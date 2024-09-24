import { rand_hex_color } from "./svg_lib/color";
import { download_file, timestamp } from "./download";
import { define, define_and_execute_once } from "./svg_lib/macro";
import { CANVAS_HEIGHT, CANVAS_WIDTH, el_svg, reaction_manager, set_CANVAS_HEIGHT, set_CANVAS_WIDTH, visual_objects } from "./svg_lib/main";
import { Entity } from "./svg_lib/object";
import { GlobalReaction, Reaction, ReactionManager, ReactionType } from "./svg_lib/reaction";
import Glide from '@glidejs/glide'

import { v4 as uuidv4 } from 'uuid';
import { kdTree } from 'kd-tree-javascript';

// @ts-ignore
import cactus_path from 'url:./assets/cactus_reference.png';

// THREE.js IMPORTS
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
// @ts-ignore
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
// @ts-ignore
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter';

import { generate_3d_mesh } from "./generate_3d_mesh";

console.log('hello world!');
const root_path = '/apps/dotter/';

const compute_ring_radius = () => Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.5 - 20;
const compute_r = (cx: number, cy: number) => Math.sqrt(cx*cx + cy*cy) / compute_ring_radius();
const compute_phi = (cx: number, cy: number) => Math.atan2(cy, cx);
const compute_x = (r: number, phi: number) => compute_ring_radius() * r * Math.cos(phi);
const compute_y = (r: number, phi: number) => compute_ring_radius() * r * Math.sin(phi);
document.addEventListener('contextmenu', event => event.preventDefault());

// BACKGROUND IMAGE FIRST
const background_image = new Entity({});
const background_image_node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
background_image_node.setAttribute('href', cactus_path);
background_image.attach_node(background_image_node);
visual_objects.push(background_image)

// MEASUREMENTS
export const INNER_RING_RADIUS = 100 * 0.5; // mm
export const OUTER_RING_RADIUS = 105 * 0.5; // mm
export enum HoleSize { S, M, L};
export const hole_size_lookup = {
    [HoleSize.S]: 2,
    [HoleSize.M]: 3,
    [HoleSize.L]: 3.5,
}
const hole_color_lookup = {
    [HoleSize.S]: '#ff0000',
    [HoleSize.M]: '#ee8800',
    [HoleSize.L]: '#88ee00',
}

enum ExportFormat { STL, OBJ, PLY};
let selected_export_format: ExportFormat = ExportFormat.STL;
const file_ending_lookup = {
    [ExportFormat.STL]: 'stl',
    [ExportFormat.OBJ]: 'obj',
    [ExportFormat.PLY]: 'ply',
}

// REACTIONS
let uuid_global_window_resize = reaction_manager.addReaction(new GlobalReaction(ReactionType.GlobalResize, 'global_window_resize', define_and_execute_once(() => {
    const new_size = el_svg.getBoundingClientRect();
    set_CANVAS_WIDTH(new_size.width);
    set_CANVAS_HEIGHT(new_size.height);
    el_svg.setAttribute("width", `${CANVAS_WIDTH}`);
    el_svg.setAttribute("height", `${CANVAS_HEIGHT}`);
    el_svg.setAttribute("viewBox", `${-CANVAS_WIDTH * 0.5} ${-CANVAS_HEIGHT * 0.5} ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`);
})))

let layout_to_be_saved = false;
let dragging_dot: boolean = false;
let dragging_dot_reaction_uuid = "";
let selected_dot: Entity<any, any> | undefined = undefined;

let uuid_global_mouse_move = reaction_manager.addReaction(new GlobalReaction(ReactionType.GlobalMouseMove, 'global_mouse_move', define((event: MouseEvent) => {
    if(!dragging_dot) return;
    const cx = event.offsetX - CANVAS_WIDTH * 0.5;
    const cy = event.offsetY - CANVAS_HEIGHT * 0.5;
    if(selected_dot) selected_dot.data.r = compute_r(cx, cy);
    if(selected_dot) selected_dot.data.phi = compute_phi(cx, cy);
})));

let uuid_global_mouse_up = reaction_manager.addReaction(new GlobalReaction(ReactionType.GlobalMouseUp, 'global_mouse_up', define((event: MouseEvent) => {
    if(dragging_dot && selected_dot) {
        reaction_manager.removeReaction(dragging_dot_reaction_uuid);
        dragging_dot_reaction_uuid = "";
    }
    dragging_dot = false;
    selected_dot = undefined;
})));

let selected_dot_size: HoleSize = HoleSize.S;
export type DotData = {
    r: number;
    phi: number;
    hole_size: HoleSize;

    cx?: number;
    cy?: number;
    computed_r?: number;
    uuid_recolor_reaction?: string;
}
let dots: Entity<DotData, any>[] = [];
let dots_reaction_uuids: string[] = [];
let dots_recolor_uuids: string[] = [];

const create_dot = (cx: number, cy: number, hole_size: HoleSize, from_click: boolean) => {
    const dot = new Entity<DotData, any>({
        hole_size: hole_size,
        r: compute_r(cx, cy),
        phi: compute_phi(cx, cy)
    });
    const dot_node = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    dot_node.setAttribute('fill', hole_color_lookup[hole_size]);
    dot_node.setAttribute('stroke', '#888');
    dot_node.setAttribute('stroke-width', '1.5');
    dot.attach_node(dot_node);
    dots.push(dot);

    // 2) then update position....
    const update_dot_position = define_and_execute_once(() => {
        const cx = compute_x(dot.data.r, dot.data.phi);
        const cy = compute_y(dot.data.r, dot.data.phi);
        dot.data.cx = cx;
        dot.data.cy = cy;
        dot_node.setAttribute('cx', `${cx}`);
        dot_node.setAttribute('cy', `${cy}`);
        const r = hole_size_lookup[dot.data.hole_size] * 0.5 / INNER_RING_RADIUS * compute_ring_radius();
        dot.data.computed_r = r;
        dot_node.setAttribute('rx', `${r}`);
        dot_node.setAttribute('ry', `${r}`);
        layout_to_be_saved = true;
    });
    // a) on global resize
    let uuid_reposition_dot = reaction_manager.addReaction(new Reaction(ReactionType.GlobalResize, 'reposition_dot', dot, update_dot_position));
    dots_reaction_uuids.push(uuid_reposition_dot);

    // b) while being dragged
    let uuid_click_dot = reaction_manager.addReaction(new Reaction(ReactionType.MouseDown, 'click_dot', dot, (from_click ? define_and_execute_once : define)(((event: MouseEvent) => {
       // left click = drag dot
        if(event == undefined || event.button === 0){
            dragging_dot = true;
            selected_dot = dot;
            if(dragging_dot_reaction_uuid !== "") reaction_manager.removeReaction(dragging_dot_reaction_uuid);
            dragging_dot_reaction_uuid = reaction_manager.addReaction(new Reaction(ReactionType.Update, 'moving_dot', dot, update_dot_position));
        }

        // right click = delete dot
        else if(event && event.button === 2){
            reaction_manager.removeReaction(uuid_reposition_dot);
            reaction_manager.removeReaction(uuid_click_dot);
            reaction_manager.removeReaction(uuid_recolor_dot);
            dot.remove_node();

            let index = dots.indexOf(dot);
            if(index === -1) throw Error("removing dot entity that is not in the list");
            dots.splice(index, 1);

            index = dots_reaction_uuids.indexOf(uuid_click_dot);
            if(index === -1) throw Error("removing dot reaction on entity that is not in the list");
            dots_reaction_uuids.splice(index, 1);
            index = dots_reaction_uuids.indexOf(uuid_reposition_dot);
            if(index === -1) throw Error("removing dot reaction on entity that is not in the list");
            dots_reaction_uuids.splice(index, 1);
            index = dots_reaction_uuids.indexOf(uuid_recolor_dot);
            if(index === -1) throw Error("removing dot reaction on entity that is not in the list");
            dots_reaction_uuids.splice(index, 1);
            
            index = dots_recolor_uuids.indexOf(uuid_recolor_dot);
            if(index === -1) throw Error("removing dot reaction on entity that is not in the list");
            dots_recolor_uuids.splice(index, 1);

            layout_to_be_saved = true;
        }
    }))), true);
    dots_reaction_uuids.push(uuid_click_dot);

    let uuid_recolor_dot = reaction_manager.addReaction(new Reaction(ReactionType.External, 'recolor_dot', dot, (is_invalid: boolean) => {
        if(is_invalid){
            dot_node.setAttribute('stroke', '#00aaff');
            dot_node.setAttribute('stroke-width', '3');
        } else {
            dot_node.setAttribute('stroke', '#888');
            dot_node.setAttribute('stroke-width', '1.5');
        }
    }));
    dot.data.uuid_recolor_reaction = uuid_recolor_dot;
    dots_reaction_uuids.push(uuid_recolor_dot);
    dots_recolor_uuids.push(uuid_recolor_dot);

    visual_objects.push(dot);
}
const load_from_serialized = (serialized_dots_data: string) => {
    const dots_data: DotData[] = JSON.parse(serialized_dots_data);
    dots_data.forEach(dot => {
        const R = compute_ring_radius();
        const cx = R * dot.r * Math.cos(dot.phi);
        const cy = R * dot.r * Math.sin(dot.phi);
        create_dot(cx, cy, dot.hole_size, false);
    });
}
const serialized_dots_data = localStorage.getItem("serialized_dots");
if(serialized_dots_data !== null) load_from_serialized(serialized_dots_data);

reaction_manager.addReaction(new GlobalReaction(ReactionType.GlobalMouseDown, 'global_add_dot', define((event: MouseEvent) => {
    if(event && event.button !== 0) return;
    // 1) create dot SVG node...
    const cx = event.offsetX - CANVAS_WIDTH * 0.5;
    const cy = event.offsetY - CANVAS_HEIGHT * 0.5;
    create_dot(cx, cy, selected_dot_size, true);
})));

// SERIALIZATION
const clear_project = () => {
    dots_reaction_uuids.forEach(uuid => reaction_manager.removeReaction(uuid));
    dots_reaction_uuids = [];
    dots.forEach(dot => dot.remove_node());
    dots = [];
    layout_to_be_saved = true;
}
const serialize = () => {
    const serialized_dots: DotData[] = dots.map(dot => ({
        r: dot.data.r,
        phi: dot.data.phi,
        hole_size: dot.data.hole_size
    }));
    return JSON.stringify(serialized_dots);
}
let action_processing = false;
let most_recent_action: ((callback: () => void) => void) | undefined = undefined;
let queue_action = (closure: (callback: () => void) => void) => {
    if(action_processing){
        most_recent_action = closure;
        return;
    }

    action_processing = true;
    closure(() => {
        action_processing = false;
        if(most_recent_action != undefined) {
            queue_action(most_recent_action);
            most_recent_action = undefined;
        }
    });
}
let uuid_global_serialize_layout = reaction_manager.addReaction(new GlobalReaction(ReactionType.Update, 'global_serialize_layout', define(() => {
    if(!layout_to_be_saved) return;
    queue_action((callback: () => void) => {
        setTimeout(() => {
            localStorage.setItem("serialized_dots", serialize());
            generate_3d_mesh(dots);
            callback();
        }, 10);
    });
    layout_to_be_saved = false;
})));

// SETUP
const outer_ring = new Entity({});
const ellipse_ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
ellipse_ring.setAttribute('stroke', `#000000`);
ellipse_ring.setAttribute('stroke-width', '5');
ellipse_ring.setAttribute('fill', 'none');
outer_ring.attach_node(ellipse_ring);
let uuid_resize_outer_ring = reaction_manager.addReaction(new Reaction(
    ReactionType.GlobalResize, 'resize_outer_ring', outer_ring, 
    define_and_execute_once(() => {
        const smaller_radius = compute_ring_radius();
        ellipse_ring.setAttribute('cx', `0`);
        ellipse_ring.setAttribute('cy', `0`);
        ellipse_ring.setAttribute('rx', `${smaller_radius}`);
        ellipse_ring.setAttribute('ry', `${smaller_radius}`);
    })));
visual_objects.push(outer_ring);

// ###########################
// TOP BUTTON IO
// ###########################

const el_button_save_project = document.getElementById("button_save_project") as HTMLButtonElement;
const el_button_load_project = document.getElementById("button_load_project") as HTMLButtonElement;
const el_button_clear_project = document.getElementById("button_clear_project") as HTMLButtonElement;
const el_input_project_upload = document.getElementById("project_upload") as HTMLInputElement;

el_button_save_project.addEventListener('click', () => {
    const data = serialize();
    download_file(`design-${timestamp()}.dotter`, data);
});

el_button_load_project.addEventListener('click', () => {
    el_input_project_upload.click();
});
el_input_project_upload.addEventListener('change', async () => {
    if(!el_input_project_upload.files) throw Error("No files uploaded");
    const file = el_input_project_upload.files[0];
    const serialized_data = await file.text();
    // TODO: sanitization;
    clear_project();
    load_from_serialized(serialized_data);
});

el_button_clear_project.addEventListener('click', () => {
    clear_project();
});

// ###########################
// PARAMS PANEL IO
// ###########################

const el_button_upload_image = document.getElementById("button_upload_image") as HTMLButtonElement;
const el_input_image_upload = document.getElementById("image_upload") as HTMLInputElement;
const el_image_preview = document.getElementById('image_preview') as HTMLImageElement;
el_image_preview.src = `${cactus_path}`;
const el_image_size_temp = document.createElement('img');
el_image_size_temp.src = `${cactus_path}`;
let image_dimension_width = 0;
let image_dimension_height = 0;
el_image_size_temp.onload = () => {
    image_dimension_width = el_image_size_temp.width;
    image_dimension_height = el_image_size_temp.height;
    reaction_manager.triggerExternal(uuid_image_repositioning);
}

el_button_upload_image.addEventListener('click', () => {
    el_input_image_upload.click();
});
const cached_image_string = localStorage.getItem('cached_image_string');
if(cached_image_string !== null){
    el_image_preview.src = cached_image_string; 
    el_image_size_temp.src = cached_image_string; 
    background_image_node.setAttribute('href', cached_image_string);
}
el_input_image_upload.addEventListener('change', async () => {
    if(!el_input_image_upload.files) throw Error("No files uploaded");
    const file = el_input_image_upload.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        if(!e.target) return;
        const image_string = e.target.result as string;
        localStorage.setItem('cached_image_string', image_string)
        el_image_preview.src = image_string; 
        el_image_size_temp.src = image_string; 
        background_image_node.setAttribute('href', image_string);
    };
    reader.readAsDataURL(file);
});

type SerializedImagePosition = {
    dx: number;
    dy: number;
    ds: number;
    do: number;
}
let background_image_dx = 0;
let background_image_dy = 0;
let background_image_ds = 1; // 0 0.5 2
let background_image_do = 0.5;
const serialized_image_position = localStorage.getItem("serialized_image_position");
if(serialized_image_position !== null) {
    const {
        dx: _dx,
        dy: _dy,
        do: _do,
        ds: _ds
    } = JSON.parse(serialized_image_position)
    background_image_dx = _dx;
    background_image_dy = _dy;
    background_image_do = _do;
    background_image_ds = _ds;
}
const background_image_repositioning = define_and_execute_once(() => {
    let ratio = image_dimension_height / image_dimension_width;
    let width = background_image_ds * compute_ring_radius() * 2;
    let height = background_image_ds * compute_ring_radius() * 2 * ratio;
    if(width < 0 || isNaN(width) || width === Infinity) width = 0; 
    if(height < 0 || isNaN(height) || height === Infinity) height = 0; 
    background_image_node.setAttribute('x', `${-width * 0.5 + background_image_dx}`);
    background_image_node.setAttribute('y', `${-height * 0.5 + background_image_dy}`);
    background_image_node.setAttribute('width', `${width}`);
    background_image_node.setAttribute('height', `${height}`);
    background_image_node.setAttribute('opacity', `${background_image_do}`);
    localStorage.setItem("serialized_image_position", JSON.stringify({
        dx: background_image_dx,
        dy: background_image_dy,
        ds: background_image_ds,
        do: background_image_do
    } as SerializedImagePosition))
});
let uuid_image_repositioning = reaction_manager.addReaction(new Reaction(ReactionType.External, 'image_repositioning', background_image, background_image_repositioning));
reaction_manager.addReaction(new GlobalReaction(ReactionType.GlobalResize, 'image_repositioning_resize', background_image_repositioning));

// image slider logic
const el_input_image_ds = document.getElementById("image_ds") as HTMLInputElement;
const el_input_image_dx = document.getElementById("image_dx") as HTMLInputElement;
const el_input_image_dy = document.getElementById("image_dy") as HTMLInputElement;
const el_input_image_do = document.getElementById("image_do") as HTMLInputElement;
el_input_image_ds.addEventListener('input', () => {
    background_image_ds = parseFloat(el_input_image_ds.value);
    reaction_manager.triggerExternal(uuid_image_repositioning);
});
el_input_image_dx.addEventListener('input', () => {
    background_image_dx = parseFloat(el_input_image_dx.value) * compute_ring_radius() * 0.5;
    reaction_manager.triggerExternal(uuid_image_repositioning);
});
el_input_image_dy.addEventListener('input', () => {
    background_image_dy = parseFloat(el_input_image_dy.value) * compute_ring_radius() * 0.5;
    reaction_manager.triggerExternal(uuid_image_repositioning);
});
el_input_image_do.addEventListener('input', () => {
    background_image_do = parseFloat(el_input_image_do.value);
    reaction_manager.triggerExternal(uuid_image_repositioning);
});

// check distances button
const button_check_dot_distances = document.getElementById('button_check_dot_distances') as HTMLButtonElement;
button_check_dot_distances.addEventListener('click', () => {
    const points = dots.map(dot => ({
        x: dot.data.cx || 0,
        y: dot.data.cy || 0,
        r: dot.data.computed_r || 0
    }));
    const tree = new kdTree(points, (a, b) => {
        const center_to_center_distance = Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2);
        return center_to_center_distance - a.r - b.r;
    }, ["x", "y", "r"]);

    // 1mm gap, different radii accounted for kd-tree distance metric
    const max_dist_pow2 = 1 / INNER_RING_RADIUS * compute_ring_radius();
    dots.forEach(dot => {
        if(!dot.data.uuid_recolor_reaction) throw Error("Dot missing uuid_recolor_reaction");
        const point = {
            x: dot.data.cx || 0,
            y: dot.data.cy || 0,
            r: dot.data.computed_r || 0
        }; 
        const nearest = tree
            .nearest(point, 5, max_dist_pow2)
            .filter(pair => pair[0].x !== point.x && pair[0].y !== point.y);
        if(nearest.length <= 0) reaction_manager.triggerExternal(dot.data.uuid_recolor_reaction, false);
        else reaction_manager.triggerExternal(dot.data.uuid_recolor_reaction, true);
    });
});

// dot size form
const el_dot_size_form = document.getElementById('dot_size_form') as HTMLFormElement;
el_dot_size_form.addEventListener('change', () => {
    const selected_radio = document.querySelector('input[name="dot_size"]:checked');
    if(!selected_radio) throw Error("No dot size checked");
    const dot_size = selected_radio.getAttribute('value');
    selected_dot_size =  dot_size === 'S' ? HoleSize.S : dot_size === 'M' ? HoleSize.M : HoleSize.L;
});

const button_download_svg = document.getElementById('button_download_svg') as HTMLButtonElement;
const button_download_3d = document.getElementById('button_download_3d') as HTMLButtonElement;
button_download_svg.addEventListener('click', () => {
    const export_svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    export_svg.setAttribute('width', `${INNER_RING_RADIUS * 2}`);
    export_svg.setAttribute('height', `${INNER_RING_RADIUS * 2}`);
    export_svg.setAttribute('viewBox', `0 0 ${INNER_RING_RADIUS * 2} ${INNER_RING_RADIUS * 2}`);

    const points = dots.map(dot => [
        dot.data.r * INNER_RING_RADIUS * Math.cos(dot.data.phi),
        dot.data.r * INNER_RING_RADIUS * Math.sin(dot.data.phi),
        hole_size_lookup[dot.data.hole_size] * 0.5
    ]);
    points.forEach(pt => {
        const export_dot = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        export_dot.setAttribute('cx', `${INNER_RING_RADIUS + pt[0]}`);
        export_dot.setAttribute('cy', `${INNER_RING_RADIUS + pt[1]}`);
        export_dot.setAttribute('rx', `${pt[2]}`);
        export_dot.setAttribute('ry', `${pt[2]}`);
        export_dot.setAttribute('fill', `none`);
        export_dot.setAttribute('stroke', `black`);
        export_svg.append(export_dot);
    });

    const export_ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    export_ring.setAttribute('cx', `${INNER_RING_RADIUS}`);
    export_ring.setAttribute('cy', `${INNER_RING_RADIUS}`);
    export_ring.setAttribute('rx', `${INNER_RING_RADIUS}`);
    export_ring.setAttribute('ry', `${INNER_RING_RADIUS}`);
    export_ring.setAttribute('fill', `none`);
    export_ring.setAttribute('stroke', `black`);
    export_svg.append(export_ring);

    const serializer = new XMLSerializer();
    const data = serializer.serializeToString(export_svg);
    download_file(`design-${timestamp()}-model.svg`, data);
});
button_download_3d.addEventListener('click', () => {
    const result = generate_3d_mesh(dots);
    result.geometry.rotateX(Math.PI * 0.5); // swap Y up to Z up for export
    const exporter = new (selected_export_format === ExportFormat.STL ? 
        STLExporter : selected_export_format === ExportFormat.OBJ ? 
        OBJExporter : PLYExporter)();
    const data = exporter.parse(result);
    download_file(`design-${timestamp()}-model.${file_ending_lookup[selected_export_format]}`, data);
    result.geometry.rotateX(-Math.PI * 0.5); // and reset for viewing
});

// 3d format form
const el_3d_format_form = document.getElementById('export_format_form') as HTMLFormElement;
el_3d_format_form.addEventListener('change', () => {
    const selected_radio = document.querySelector('input[name="3d_format"]:checked');
    if(!selected_radio) throw Error("No 3D format size checked");
    const format = selected_radio.getAttribute('value');
    selected_export_format = format === 'STL' ? ExportFormat.STL : format === 'OBJ' ? ExportFormat.OBJ : ExportFormat.PLY;
});


// #################################
// THREE JS PREVIEW
// #################################
const el_main_canvas = document.getElementById('main_canvas') as HTMLCanvasElement;
export const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, el_main_canvas.width / el_main_canvas.height, 0.1, 1000);
camera.position.set(0, 60, 10);
camera.lookAt(new THREE.Vector3(0, 0, 0));
const renderer = new THREE.WebGLRenderer({
   canvas: el_main_canvas 
});
// renderer.setPixelRatio(1.5);
renderer.setClearColor(0xffffff);
const controls = new OrbitControls(camera, renderer.domElement)

const grid = new THREE.GridHelper(INNER_RING_RADIUS * 3, 20, 0xff0000, 0xaaddff);
scene.add(grid);
let uuid_global_three_render = reaction_manager.addReaction(new GlobalReaction(ReactionType.Update, 'global_three_render', define(() => {
    renderer.render(scene, camera);
    controls.update();
}))); 
generate_3d_mesh(dots);

// #################################
// DIALOG LOGIC + FIX UI SCALING
// #################################

const help_dialog_button = document.getElementById('help_button') as HTMLElement;
const close_dialog_button = document.getElementById('close_tutorial_dialog_button') as HTMLElement;
const el_dialog = document.getElementById('tutorial_dialog') as HTMLDivElement;
help_dialog_button.addEventListener('click', () => {
    el_dialog.style.visibility = 'visible';
});
close_dialog_button.addEventListener('click', () => {
    el_dialog.style.visibility = 'hidden';
})

const el_right_column = document.getElementById('right_column') as HTMLDivElement;
const el_meta_buttons_row = document.getElementById('meta_buttons_row') as HTMLDivElement;
const el_params_container = document.getElementById('params_container') as HTMLDivElement;

const on_window_resize = define_and_execute_once(() => {
    const proper_width = el_params_container.getBoundingClientRect().width;
    const proper_height = el_right_column.getBoundingClientRect().height
        - el_meta_buttons_row.getBoundingClientRect().height
        - el_params_container.getBoundingClientRect().height
        - 16;
    el_main_canvas.height = proper_width;
    el_main_canvas.height = proper_height;

    camera.aspect = proper_width / proper_height;
    camera.updateProjectionMatrix();
    renderer.setSize(proper_width, proper_height);
});
window.addEventListener('resize', on_window_resize);

const glide = new Glide('.glide', {
    rewind: true,
    startAt: 0
}).mount();
let at_end = false;
glide.on('move', () => {
    if(glide.index === 0 && at_end) el_dialog.style.visibility = 'hidden';
    at_end = false;
});
glide.on('run.end', () => at_end = true);
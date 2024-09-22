import { rand_hex_color } from "./color";
import { define, define_and_execute_once } from "./macro";
import { Entity } from "./object";
import { GlobalReaction, Reaction, ReactionManager, ReactionType } from "./reaction";

// META VARIABLES
declare global {
    var main_loop: number;
}

export let CANVAS_WIDTH = 1080;
export let CANVAS_HEIGHT = 720;
export let set_CANVAS_WIDTH = (w: number) => CANVAS_WIDTH = w;
export let set_CANVAS_HEIGHT = (h: number) => CANVAS_HEIGHT = h;
export const FPS = 60;

export const el_fps_counter = document.getElementById('fps_counter') as HTMLDivElement;
export const el_svg = document.getElementById('main_svg') as HTMLElement & SVGSVGElement;

// INITIALIZATION
export const reaction_manager = new ReactionManager();
export const visual_objects: Entity<any, any[]>[] = [];

// MAIN LOOP 
let start_time = window.performance.now()
let old_time = start_time;
let new_time = start_time;
clearInterval(window.globalThis.main_loop);
window.globalThis.main_loop = setInterval(() => {
    new_time = window.performance.now();
    let delta_time = new_time - old_time;
    let eta_time = new_time - start_time;
    if(el_fps_counter) el_fps_counter.innerText = `${(1000 / delta_time).toFixed(2)} fps`;

    for(let obj of visual_objects){
        obj.update(eta_time);
    }
    for(let reaction of reaction_manager.reaction_collection_update){
        reaction.trigger(delta_time, eta_time);
    }

    console.log(reaction_manager.reaction_collection.length)

    old_time = new_time;
}, 1000 / FPS);

import '../index';
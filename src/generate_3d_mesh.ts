import { DotData, TRUE_RING_RADIUS } from ".";
import { Entity } from "./svg_lib/object";

export const generate_3d_mesh = (dots: Entity<DotData, any>[]) => {
    const points = dots.map(dot => [
        dot.data.r * TRUE_RING_RADIUS * Math.cos(dot.data.phi),
        dot.data.r * TRUE_RING_RADIUS * Math.sin(dot.data.phi),
    ]);
    console.log(points);
}
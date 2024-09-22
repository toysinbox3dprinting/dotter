import { el_svg } from "./main";
import { Reaction, ReactionType } from "./reaction";
import { v4 as uuidv4 } from 'uuid';

export class Entity<T, S extends any[]> {
    uuid: string = uuidv4();
    node?: SVGGraphicsElement;
    data: T;
    T: SVGTransform;
    M: SVGMatrix;
    _update?: (self: Entity<T, S>) => (...args: S) => void;

    reactions: Reaction<any>[] = [];
    reaction_listeners: {[key: string]: (...args: any[]) => any} = {};
    reaction_stop_propagations: {[key: string]: boolean} = {};

    constructor(
        data: T
    ){
        this.data = data;
        this.T = el_svg.createSVGTransform();
        this.M = el_svg.createSVGMatrix();
        this.M.translate(0, 0, 0);

        this.T.setMatrix(this.M);
    }

    set_xy(x: number, y: number){
        this.M.e = x;
        this.M.f = y;
    }

    update_transform(){
        this.T.setMatrix(this.M);
    }

    update(...args: S){
        if(this._update) this._update(this)(...args);
    }

    attach_update(update: (self: Entity<T, S>) => (...args: S) => void){
        this._update = update;
    }

    attach_node(node: SVGGraphicsElement){
        this.node = node;
        node.transform.baseVal.appendItem(this.T);
        el_svg.append(this.node);
    }

    attach_reaction(reaction: Reaction<any>, stop_propagation: boolean = false){
        this.reactions.push(reaction);
        this.reaction_listeners[reaction.uuid] = (event: MouseEvent) => {
            if(stop_propagation) {
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
            reaction.trigger(event);
        };
        this.reaction_stop_propagations[reaction.uuid] = stop_propagation;
        
        // mouse reactions
        if(reaction.type === ReactionType.MouseDown){
            this.node?.addEventListener('mousedown', this.reaction_listeners[reaction.uuid], stop_propagation);
        }
    }

    remove_node(){
        if(this.node) el_svg.removeChild(this.node);
    }

    remove_reaction(reaction_uuid: string){
        const index = this.reactions.findIndex(r => r.uuid === reaction_uuid);
        if(index === -1) throw Error("attempted to remove reaction that is not attached to entity");
        const removed_reaction = this.reactions.splice(index, 1)[0];

        if(removed_reaction.type === ReactionType.MouseDown){
            this.node?.removeEventListener('mousedown', this.reaction_listeners[reaction_uuid], this.reaction_stop_propagations[removed_reaction.uuid]);
        }

        delete this.reaction_listeners[reaction_uuid];
        delete this.reaction_stop_propagations[removed_reaction.uuid];
    }
}
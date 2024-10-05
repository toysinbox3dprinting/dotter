import { authenticated } from "..";
import { el_svg } from "./main";
import { Entity } from "./object";
import { v4 as uuidv4 } from 'uuid';

export enum ReactionType {
    // on entities
    MouseDown,
    External,

    // on window
    GlobalResize,

    // on svg
    GlobalMouseDown,
    GlobalMouseMove,
    GlobalMouseUp,
    GlobalMouseLeave,
    GlobalKeyDown,
    GlobalKeyUp,

    // on other
    Update
}

export class ReactionManager {
    reaction_collection: AbstractReaction<any>[] = [];

    reaction_collection_global_resize: AbstractReaction<any>[] = [];
    reaction_collection_global_mousedown: AbstractReaction<any>[] = [];
    reaction_collection_global_mousemove: AbstractReaction<any>[] = [];
    reaction_collection_global_mouseup: AbstractReaction<any>[] = [];

    reaction_collection_update: AbstractReaction<any>[]= [];
    reaction_collection_external: AbstractReaction<any>[]= [];

    suppression_rules: {[key: string]: string[]} = {};

    constructor(){
        window.addEventListener('resize', (event) => {
            if(!authenticated) return;
            this.reaction_collection_global_resize.forEach(reaction => {
                reaction.trigger(event);
            });
        });

        el_svg.addEventListener('mousedown', (event) => {
            if(!authenticated) return;
            this.reaction_collection_global_mousedown.forEach(reaction => {
                reaction.trigger(event);
            });
        });
        el_svg.addEventListener('mousemove', (event) => {
            if(!authenticated) return;
            this.reaction_collection_global_mousemove.forEach(reaction => {
                reaction.trigger(event);
            });
        });
        el_svg.addEventListener('mouseup', (event) => {
            if(!authenticated) return;
            this.reaction_collection_global_mouseup.forEach(reaction => {
                reaction.trigger(event);
            });
        });
    }

    addReaction(reaction: AbstractReaction<any>, stop_propagation: boolean = false){
        this.reaction_collection.push(reaction);
        if(reaction instanceof Reaction) reaction.target.attach_reaction(reaction, stop_propagation);

        if(reaction.type === ReactionType.GlobalResize) this.reaction_collection_global_resize.push(reaction);
        else if(reaction.type === ReactionType.GlobalMouseDown) this.reaction_collection_global_mousedown.push(reaction);
        else if(reaction.type === ReactionType.GlobalMouseMove) this.reaction_collection_global_mousemove.push(reaction);
        else if(reaction.type === ReactionType.GlobalMouseUp) this.reaction_collection_global_mouseup.push(reaction);

        else if(reaction.type === ReactionType.Update) this.reaction_collection_update.push(reaction);
        else if(reaction.type === ReactionType.External) this.reaction_collection_external.push(reaction);

        return reaction.uuid;
    }

    findReaction(uuid: string){
        const index = this.reaction_collection.findIndex(r => r.uuid === uuid);
        if(index === -1) return false;
        else return this.reaction_collection[index];
    }

    removeReaction(reaction_uuid: string){
        const remove_reaction_from_collection = (collection: AbstractReaction<any>[]) => {
            const index = collection.findIndex(r => r.uuid === reaction_uuid);
            if(index === -1) throw Error("Attempted to remove reaction uuid that does not exist");
            return collection.splice(index, 1)[0];
        }

        let removed_reaction = remove_reaction_from_collection(this.reaction_collection);
        const type = removed_reaction.type;
        
        if(type === ReactionType.GlobalResize) remove_reaction_from_collection(this.reaction_collection_global_resize);
        else if(type === ReactionType.GlobalMouseDown) remove_reaction_from_collection(this.reaction_collection_global_mousedown);
        else if(type === ReactionType.GlobalMouseMove) remove_reaction_from_collection(this.reaction_collection_global_mousemove);
        else if(type === ReactionType.GlobalMouseUp) remove_reaction_from_collection(this.reaction_collection_global_mouseup);

        else if(type === ReactionType.Update) remove_reaction_from_collection(this.reaction_collection_update);

        else if(type === ReactionType.MouseDown) {
            let _removed_reaction = removed_reaction as Reaction<any>;
            _removed_reaction.target.remove_reaction(removed_reaction.uuid);
        }
    }

    triggerExternal(uuid: string, ...args: any[]){
        this.reaction_collection_external.forEach(reaction => {
            if(reaction.uuid === uuid) reaction.trigger(...args);
        })
    }
}

export interface AbstractReaction<T extends any[]>{
    uuid: string;
    label: string;
    enabled: boolean;
    type: ReactionType;
    action: ((...args: T) => void) | ((target: Entity<any, any>) => void);

    toggle: (enabled: boolean) => void;
    trigger: (...args: T) => void;
}

export class GlobalReaction<T extends any[]> implements AbstractReaction<T> {
    uuid: string = uuidv4();
    label: string;
    enabled: boolean = true;
    type: ReactionType;
    action: (...args: T) => void;

    constructor(
        type: ReactionType,
        label: string,
        action: (...args: T) => void,
    ){
        this.type = type;
        this.action = action;
        this.label = label || "";
    }

    toggle(enabled: boolean){
        this.enabled = enabled;
    }

    trigger(...args: T){
        if(!this.enabled) return;
        this.action(...args);
    }
}

export class Reaction<T extends any[]> implements AbstractReaction<T> {
    uuid: string = uuidv4();
    enabled: boolean = true;
    type: ReactionType;
    target: Entity<any, any>;
    action: (...args: any[]) => void;
    label: string;

    constructor(
        type: ReactionType, 
        label: string,
        target: Entity<any, any>,
        action: (...args: any[]) => void
    ){
        this.type = type;
        this.label = label;
        this.target = target;
        this.action = action;
    }

    toggle(enabled: boolean){
        this.enabled = enabled;
    }

    trigger(...args: T){
        if(!this.enabled) return;
        
        this.action(...args);
    }
}
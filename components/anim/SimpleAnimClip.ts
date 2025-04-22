import { AnimEvent } from "../../types";
import * as pc from "../../lib/playcanvas";

const OneFrameTime = 1 / 60;

export interface AnimFrame {
    matrix_dic: { [key: string]: pc.Mat4 };
    time: number;
    frame: number;
    events: AnimEvent[];
}

interface CurvePath {
    component: string,
    entityPath: string[],
    propertyPath: string[]
}

const ShareClips: { [full_name: string]: SimpleAnimClip } = {};


export function getSimpleAnimClip(track:pc.AnimTrack){
    //@ts-ignore
    let key = track.url + '|' + track.name
    let clip = ShareClips[key];
    if(!clip){
        clip = ShareClips[key] = new SimpleAnimClip(track);
    }
    return clip;
}

export class SimpleAnimClip {

    private _track: pc.AnimTrack;
    totalFrame: number = 0;
    one_frame_time: number = 0;
    duration: number;
    full_name: string;

    private baseSpeed:number = 1;

    clip_name: string;

    frames:AnimFrame[];

    snapshots:pc.AnimSnapshot[];

    loop: boolean = true;

    constructor(track: pc.AnimTrack) {
        this._track = track;
        //@ts-ignore
        this.full_name = track.url + '|' + track.name;
        this.clip_name = track.name;
        this.duration = track.duration;
        this.totalFrame = Math.round(track.duration / OneFrameTime) + 1;
        this.one_frame_time = track.duration / (this.totalFrame - 1);
        this.prepare();
    }

    get track() {
        return this._track;
    }

    prepare() {

        let { curves, duration } = this._track;
        let frames: AnimFrame[] = this.frames = []
        let snapshots: pc.AnimSnapshot[] = this.snapshots = []

        let one_frame_time = this.one_frame_time;

        let root = new pc.GraphNode();
        let allNode: pc.GraphNode[] = [];

        curves.forEach(c => {
            let paths = c.paths as any as CurvePath[];
            paths.forEach(path => {
                let p: pc.GraphNode;
                path.entityPath.forEach((ent_name, ix) => {
                    if (ix == 0) {
                        root.name = ent_name;
                        p = root;
                    } else {
                        let child = p.children.find(c => c.name == ent_name);
                        if (!child) {
                            child = new pc.GraphNode(ent_name);
                            allNode.push(child);
                            p.addChild(child);
                        }
                        p = child;
                    }
                })
            })
        });
        for (let i = 0; i < this.totalFrame; ++i) {
            let snapshot = snapshots[i] = new pc.AnimSnapshot(this._track);
            snapshot._name += `_${i}`
            this._track.eval(i * one_frame_time, snapshot);

            //create matrix
            for (let j = 0; j < curves.length; ++j) {
                let curve = curves[j];
                let paths = curve.paths as any as CurvePath[];
                let output = snapshot._results[j];
                paths.forEach(path => {
                    // let node = findNodeByPath(root, path.entityPath);
                    let node = allNode.find(n => n.name == path.entityPath[path.entityPath.length - 1]);
                    if (node) {
                        switch (path.propertyPath[0]) {
                            case 'localPosition':
                                node.setLocalPosition(output[0], output[1], output[2]);
                                break;
                            case 'localRotation':
                                node.setLocalRotation(output[0], output[1], output[2], output[3]);
                                break;
                            case 'localScale':
                                node.setLocalScale(output[0], output[1], output[2]);
                                break;
                        }
                    }
                });
            }
            let frame = {} as AnimFrame
            frame.frame = i;
            frame.time = i == this.totalFrame - 1 ? duration : i * one_frame_time;
            frame.matrix_dic = {};
            let events: AnimEvent[] = [];
            frame.events = events;
            let trackEvents = this._track.events as AnimEvent[];
            for (let j = 0; j < trackEvents.length; ++j) {
                if (Math.abs(trackEvents[j].time - frame.time) < one_frame_time * 0.5) {
                    events.push(trackEvents[j])
                }
            }

            for (let j = 0; j < allNode.length; ++j) {
                let node = allNode[j];
                frame.matrix_dic[node.name] = node.getWorldTransform().clone();
            }
            frames.push(frame);
        }
    }
}

// function findNodeByPath(node: pc.GraphNode, path: string[]) {
//     let p = node;
//     for (let i = 1; i < path.length; ++i) {
//         let child = p.children.find(n => n.name == path[i]);
//         if (!child) return null;
//         p = child;
//     }
//     return p;
// }
import * as pc from '../../lib/playcanvas';
import { getSimpleAnimClip, SimpleAnimClip } from './SimpleAnimClip';
import { SimpleSkin } from './SimpleSkin';
import { SkinInstancingData } from "./SkinInstancingData";
import { freeVertexBuffer, getVertexBufferByCount } from '../VertexBufferPool';
interface VertexBufferItem {
    key: string;
    buffer: pc.VertexBuffer;
    instancing_arr: SkinInstancingData[];
    pool: number[];
    count: number;
    minstance?: pc.MeshInstance;
    sleep: boolean;
}

const ShareVertexBuffer: { [k: string]: VertexBufferItem } = {};// key: meshid_tex

const MaxInstanceCount = 1024;
const InitInstanceCount = 4;
const MaxAddCount = 64;

function getVertexBufferItem(key: string, count: number = InitInstanceCount): VertexBufferItem {
    let item = ShareVertexBuffer[key];
    if (!item) {
        let [buffer, realcount] = getVertexBufferByCount(count, 4);
        let pool: number[] = []
        for (let i = 0; i < realcount; ++i) {
            pool.push(i);
        }
        item = { buffer, key, instancing_arr: [], pool, count: realcount, sleep: false };
        ShareVertexBuffer[key] = item;
    }
    return item;
}

const AddRate = 0.25;
function calcNewCount(count: number) {
    return Math.min(count + pc.math.roundUp(Math.min(count * AddRate, MaxAddCount), 4), MaxInstanceCount);
}

function setInstancingBuffer(insData: SkinInstancingData, item?: VertexBufferItem) {
    if (!item) item = ShareVertexBuffer[insData.key];
    let offset = -1;
    if (item.pool.length) {
        offset = item.pool.shift();
    } else if (item.count < MaxInstanceCount) {

        let precount = item.count;
        let prebuffer = item.buffer;
        let prearr = prebuffer.storage as Float32Array;
        let newcount = calcNewCount(precount);
        let [buffer, realcount] = getVertexBufferByCount(newcount, 4);
        item.buffer = buffer;
        item.count = realcount;
        let newarr = buffer.storage as Float32Array;
        newarr.set(prearr);
        freeVertexBuffer(prebuffer);
        for (let i = precount; i < realcount; ++i) {
            item.pool.push(i);
        }
        item.instancing_arr.forEach(ins => {
            ins.setBuffer(item.buffer, ins.bufferOffset);
        })
        item.minstance.setInstancing(item.buffer);
        //recreate buffer
        offset = item.pool.shift();
    }
    insData.setBuffer(item.buffer, offset);
    item.instancing_arr.push(insData);
}

const zerobuffer = new Float32Array(16);
function freeInstancingBuffer(insData: SkinInstancingData) {
    let item = ShareVertexBuffer[insData.key];
    let offset = insData.bufferOffset;
    let ix = item.instancing_arr.indexOf(insData);
    if (ix != -1) item.instancing_arr.splice(ix, 1);
    insData.free();
    if (offset != -1) {
        let matrices = item.buffer.storage as Float32Array;
        matrices.set(zerobuffer, offset * 16);
        item.pool.push(offset);

        let usingCount = item.count - item.pool.length;
        let newcount = calcNewCount(usingCount);
        if (item.count / newcount > (1 + AddRate) && item.count > 4) {
            let prebuffer = item.buffer;
            let prearr = prebuffer.storage as Float32Array;

            let [buffer, realcount] = getVertexBufferByCount(newcount, 4);
            item.buffer = buffer;
            item.count = realcount;
            let newarr = buffer.storage as Float32Array;
            newarr.set(prearr.subarray(0, newarr.length), 0);
            item.pool.sort((a, b) => a - b);
            let endix = item.pool.findIndex(a => a >= realcount);
            if (endix != -1 && item.pool.length > endix) {
                item.pool.length = endix;
            }
            item.instancing_arr.forEach(ins => {
                let preoffset = ins.bufferOffset;
                let newoffset = ins.bufferOffset;
                if (ins.bufferOffset >= realcount) {
                    newoffset = item.pool.shift();
                }
                ins.setBuffer(item.buffer, newoffset);
                if (preoffset != newoffset) {
                    newarr.set(prearr.subarray(preoffset * 16, preoffset * 16 + 16), newoffset * 16);
                }
            })
            freeVertexBuffer(prebuffer);
            item.minstance.setInstancing(item.buffer);
        }
    }
}

const BatchMeshInstancing: { [k: string]: pc.MeshInstance } = {}

export function updateVertexBuffer(dt: number) {
    for (let i = 0; i < all_helper.length; ++i) {
        let h = all_helper[i];
        h.update(dt);
    }
    for (let key in ShareVertexBuffer) {
        let item = ShareVertexBuffer[key];
        if (!item.minstance) continue;
        if (!item.sleep) {
            if (item.pool.length == item.count) {
                item.sleep = true;
                (item.buffer.storage as Float32Array).fill(0);
                if (item.minstance.node.parent) item.minstance.node.parent.removeChild(item.minstance.node);
            }
            item.buffer.setData(item.buffer.storage);
        } else if (item.pool.length < item.count) {
            item.sleep = false;
            if (!item.minstance.node.parent) {
                let app = pc.AppBase.getApplication();
                app.root.addChild(item.minstance.node);
            }
            item.buffer.setData(item.buffer.storage);
        }
    }
}

function getInstanceKey(mins: pc.MeshInstance) {
    let material = mins.material as pc.StandardMaterial;
    return `${mins.mesh.id}_${material.name}_${material.aoMap?.name}_${material.diffuseMap?.name}_${material.emissiveMap?.name}`;
}

const all_helper: SkinBatchHelper[] = [];

export class SkinBatchHelper extends pc.EventHandler {


    originEntity: pc.Entity;

    skinList: SimpleSkin[];

    renders: pc.RenderComponent[];

    private _allInstancingData: SkinInstancingData[] = []

    private _inited: boolean = false;

    _useInstancing: boolean = true;;

    constructor(entity: pc.Entity, useInstancing: boolean = true) {
        super();
        this._useInstancing = useInstancing;
        let app = pc.AppBase.getApplication();
        useInstancing = useInstancing && app.graphicsDevice.supportsInstancing;
        all_helper.push(this);
        this.skinList = [];
        try {
            if (useInstancing) {
                this.setEntity(entity);
            } else {
                this.setEntityNoInstancing(entity);
            }

        } catch (error) {
            debugger
        }
        this._inited = true;
    }

    get inited() {
        return this._inited;
    }

    private setEntity(entity: pc.Entity) {
        this.originEntity = entity;

        let renders = this.renders = entity.findComponents('render') as pc.RenderComponent[];
        let anim = entity.anim;
        let anim_tracks: pc.AnimTrack[] = [];
        if (anim) {
            anim.layers.forEach(l => {
                let ctl = l._controller as pc.AnimController;
                for (let state_name in ctl._states) {
                    //@ts-ignore
                    ctl._states[state_name]._animationList.forEach(node => anim_tracks.push(node._animTrack));
                }
            })
            anim.enabled = false;
        }


        //recreate meshInstance
        for (let i = 0; i < renders.length; i++) {
            let r = renders[i];
            let oldMeshIns = r.meshInstances;
            //use bufferUpdater instead meshInstances
            let instancingDatas: SkinInstancingData[] = []
            for (let j = 0; j < oldMeshIns.length; ++j) {
                let mIns = oldMeshIns[j];
                if (!mIns.mesh.skin) continue;
                let key = getInstanceKey(mIns);
                let shareIns = BatchMeshInstancing[key];
                let item = getVertexBufferItem(key)
                if (!shareIns) {
                    let mesh = mIns.mesh;
                    let oldMat = mIns.material as pc.StandardMaterial;
                    const material = oldMat.clone();
                    material.onUpdateShader = function (options) {
                        options.litOptions.useInstancing = true;
                        options.litOptions.skin = true;
                        return options;
                    };
                    // material.normalMap = null;
                    material.update();
                    shareIns = new pc.MeshInstance(mesh, material);
                    BatchMeshInstancing[key] = shareIns;

                    let skin = new SimpleSkin(mesh);
                    for (let ti = 0; ti < anim_tracks.length; ++ti) {
                        let t = anim_tracks[ti];
                        let clip = getSimpleAnimClip(t);
                        skin.addClip(clip);
                    }
                    skin.bake();
                    shareIns.skinInstance = skin;
                    shareIns.setInstancing(item.buffer);
                    item.minstance = shareIns;

                    let batchEntity = new pc.Entity('batch_' + key);
                    batchEntity.addComponent('render');
                    batchEntity.render.meshInstances = [shareIns];
                    let app = pc.AppBase.getApplication();
                    app.root.addChild(batchEntity);
                }
                //get updater
                let skinIns = shareIns.skinInstance as SimpleSkin;
                this.skinList.push(skinIns);

                let instancingData = new SkinInstancingData(key);
                instancingData.skin = skinIns;

                setInstancingBuffer(instancingData, item);

                instancingDatas.push(instancingData);//
                this._allInstancingData.push(instancingData);
            }
            r.enabled = false;
            //@ts-ignore
            r.entity.instancingDatas = instancingDatas;
        }
    }

    private setEntityNoInstancing(entity: pc.Entity) {
        this.originEntity = entity;
        let renders = this.renders = entity.findComponents('render') as pc.RenderComponent[];
        let anim = entity.anim;
        let anim_tracks: pc.AnimTrack[] = [];
        if (anim) {
            anim.layers.forEach(l => {
                let ctl = l._controller as pc.AnimController;
                for (let state_name in ctl._states) {
                    //@ts-ignore
                    ctl._states[state_name]._animationList.forEach(node => anim_tracks.push(node._animTrack));
                }
            })
            anim.enabled = false;
        }

        //recreate meshInstance
        for (let i = 0; i < renders.length; i++) {
            let r = renders[i];
            let oldMeshIns = r.meshInstances;
            //use bufferUpdater instead meshInstances
            let meshInstances = []
            for (let j = 0; j < oldMeshIns.length; ++j) {
                let mIns = oldMeshIns[j];
                if (!mIns.mesh.skin) continue;


                let mesh = mIns.mesh;
                let oldMat = mIns.material as pc.StandardMaterial;
                const material = oldMat.clone();
                material.onUpdateShader = function (options) {
                    // options.litOptions.useInstancing = true;
                    options.litOptions.skin = true;
                    return options;
                };
                // material.normalMap = null;
                material.update();
                let newMeshIns = new pc.MeshInstance(mesh, material);

                let skin = new SimpleSkin(mesh);
                this.skinList.push(skin);
                skin.useInstancing = false;
                for (let ti = 0; ti < anim_tracks.length; ++ti) {
                    let t = anim_tracks[ti];
                    let clip = new SimpleAnimClip(t);
                    skin.addClip(clip);
                }
                skin.bake();
                newMeshIns.skinInstance = skin;
                meshInstances.push(newMeshIns);
            }
            r.meshInstances = meshInstances;
        }
    }

    private _cur_clip_name: string;

    get cur_clip_name() {
        return this._cur_clip_name;
    }

    play(name: string, blendTime: number, speed: number = 1) {
        let renders = this.renders;
        this._cur_clip_name = name;
        if (!this._useInstancing) {
            this.skinList.forEach(skin => {
                skin.animPlayer.play(name, 0, blendTime, speed);
            })
            return;
        }
        for (let i = 0; i < renders.length; ++i) {
            let r = renders[i];
            //@ts-ignore
            let instancingDatas: SkinInstancingData[] = r.entity.instancingDatas;
            if (instancingDatas) {
                instancingDatas.forEach(ins => {
                    ins.play(name, 0, blendTime, speed)
                })
            }
        }
    }

    update(dt: number) {
        this._fireEvent = false;
        if (!this._useInstancing) {
            this.skinList.forEach(skin => {
                skin.animPlayer.update(dt);
                this.fireEvents(skin.animPlayer);
            })
            return;
        }
        let renders = this.renders;
        let p_enabled = this.originEntity.parent && this.originEntity.enabled;
        let fireEvent: boolean = false;
        for (let j = 0; j < renders.length; ++j) {
            let r = renders[j]
            //@ts-ignore
            let instancingDatas: SkinInstancingData[] = r.entity.instancingDatas;
            if (!instancingDatas) continue;
            let enabled = p_enabled && r.entity.parent && r.entity.enabled;
            if (!enabled) {
                for (let k = 0; k < instancingDatas.length; ++k) {
                    let insdata = instancingDatas[k];
                    if (insdata.bufferOffset != -1) {
                        freeInstancingBuffer(insdata);
                    }
                }
            } else {
                for (let k = 0; k < instancingDatas.length; ++k) {
                    let insdata = instancingDatas[k];
                    if (insdata.bufferOffset == -1) {
                        setInstancingBuffer(insdata);
                    }
                    insdata.update(dt);
                    insdata._updateBuffer(r.entity);
                    this.fireEvents(insdata);
                }
            }
        }
    }

    private _fireEvent: boolean = false;
    private fireEvents(insdata: SkinInstancingData) {
        if (!this._fireEvent) {
            this._fireEvent = true;
            if (insdata.playing) {
                let clip = insdata.skin.clips[insdata.cur_clip_name];
                let events = clip.frames[insdata.frame].events;
                if (events.length) {
                    for (let i = 0; i < events.length; ++i) {
                        const e = events[i];
                        this.fire(e.name, { duration: clip.duration / insdata.speed, ...e });
                    }
                }
            }
        }
    }

    pause() {
        let renders = this.renders;
        for (let i = 0; i < renders.length; ++i) {
            let r = renders[i];
            //@ts-ignore
            let instancingDatas: SkinInstancingData[] = r.entity.instancingDatas;
            instancingDatas.forEach(ins => {
                ins.pause();
            })
        }
    }

    destroy() {
        let ix = all_helper.indexOf(this)
        if (ix != -1) {
            all_helper.splice(ix, 1);
        }
        this.renders.forEach(r => {
            //@ts-ignore
            let instancingDatas: SkinInstancingData[] = r.entity.instancingDatas;
            instancingDatas.forEach(insdata => {
                if (insdata.bufferOffset != -1) {
                    freeInstancingBuffer(insdata);
                }
            })
            //@ts-ignore
            r.entity.instancingDatas = null;
        })

        this.originEntity = null;
    }

}

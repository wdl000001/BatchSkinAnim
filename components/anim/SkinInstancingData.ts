import { InstancingData } from "../InstancingData";
import { SimpleAnimClip } from "./SimpleAnimClip";
import { SimpleSkin } from './SimpleSkin'

export class SkinInstancingData extends InstancingData {

    private _playing: boolean = false;

    private _cur_clip_name: string;
    private _frame: number = 0;
    private _animTime: number = 0;

    private _pre_clip_frame: number = 0;
    private _pre_clip_name: string;

    private _blend_weight: number = 0;

    private _speed: number = 1;

    _skin: SimpleSkin;

    constructor(key: string) {
        super(key)
    }

    get skin() {
        return this._skin;
    }

    set skin(skin: SimpleSkin) {
        this._skin = skin;
    }

    get frame() {
        return this._frame;
    }

    get animTime() {
        return this._animTime;
    }

    get playing() {
        return this._playing;
    }

    get cur_clip_name() {
        return this._cur_clip_name;
    }

    private blendStartTime: number = 0;
    private blendEndTime: number = 0;
    private animStartTime: number = 0;
    private animStartFrame: number = 0;
    play(clipname: string, frame: number, blendTime: number = 0, speed: number) {
        if (!this.skin) return;
        if (!this.skin.clips) return;
        if (!this.skin.clips[clipname]) return;
        this._speed = speed;
        this.animStartFrame = frame;
        this._pre_clip_name = this._cur_clip_name || clipname;
        this._pre_clip_frame = this._frame;
        this.blendStartTime = this.animStartTime = Date.now();
        this.blendEndTime = this.blendStartTime + blendTime * 1000;
        this._cur_clip_name = clipname;
        this._frame = frame;
        this._playing = true;
    }

    _updateBuffer(root: pc.GraphNode) {
        if (this.bufferOffset == -1) return;
        let matrix = root.getWorldTransform();
        let matrices = this._matrices;
        let { skin, _blend_weight } = this;
        let numBones = skin.skin.inverseBindPose.length;
        let clip_offset = skin.getClipOffset(this._cur_clip_name);
        let pre_offset = skin.getClipOffset(this._pre_clip_name);
        let offset = this._bufferOffset * 16;
        matrices.set(matrix.data, offset);
        matrices[offset + 3] = this.frame * numBones * 3 + clip_offset; //frame * numBones * 3 + clip_offset;
        matrices[offset + 7] = this._pre_clip_frame * numBones * 3 + pre_offset;
        matrices[offset + 11] = 1.0 - _blend_weight; //clip 1 weights
        matrices[offset + 15] = _blend_weight;
    }

    update(dt: number) {
        if (!this.skin || !this.skin.clips) return false;
        if (this._playing) {
            let clip = this.skin.clips[this._cur_clip_name];
            if (!clip) return false;
            let now = Date.now();
            this._blend_weight = 0;
            if (this.blendEndTime > this.blendStartTime) {
                this._blend_weight = now >= this.blendEndTime ? 0 : 1 - (now - this.blendStartTime) / (this.blendEndTime - this.blendStartTime);
            }
            let frame = this.updateFrame(clip, now);
            this._animTime = clip.one_frame_time * frame;
            return true;
        }
        return false;
    }

    private updateFrame(clip: SimpleAnimClip, now: number) {
        let frame = Math.round((now - this.animStartTime) * this.speed / 1000 / clip.one_frame_time) + this.animStartFrame;
        frame %= clip.totalFrame;
        if (!clip.loop && frame < this.frame) {
            this._frame = clip.totalFrame - 1;
        } else {
            this._frame = frame;
        }
        return frame;
    }

    set speed(v: number) {

        let clip = this.skin.clips[this._cur_clip_name];
        if (!clip) {
            this._speed = v;
        } else {
            let now = Date.now();
            let frame = this.updateFrame(clip, now);
            this.animStartFrame = frame;
            this.animStartTime = now;
            this._speed = v;
        }
    }

    get speed() {
        return this._speed;
    }

    pause() {
        this._playing = false;
    }
}
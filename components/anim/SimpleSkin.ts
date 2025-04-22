import * as pc from "../../lib/playcanvas";
import { SimpleAnimClip } from "./SimpleAnimClip"
import {SkinInstancingData} from "./SkinInstancingData"


const ShareInverseBindPose: { [meshid: string]: Float32Array } = {};


interface SkinData {
    matrices: { [clip_name: string]: pc.Mat4[][] }; //[frame][bone]
    matricesWithInv: { [clip_name: string]: pc.Mat4[][] };
    boneTexture: pc.Texture;
    clipOffset: { [key: string]: number }
}
const ShareSkinData: {
    [key: string]: SkinData
} = {};


export class SimpleSkin extends pc.SkinInstance {
    mesh: pc.Mesh;
    skin: pc.Skin;
    clips_arr: SimpleAnimClip[];

    private _key: string;

    matrixPalette: Float32Array;
    matrices_dic: { [clip_name: string]: pc.Mat4[][] }
    matrices_dic_with_inv: { [clip_name: string]: pc.Mat4[][] }
    clipOffset: { [key: string]: number }

    inverseBindPose: Float32Array;

    _useInstancing: boolean = true;

    private _clips: { [key: string]: SimpleAnimClip } = {};
    /** Use it only when useInstancing is false*/
    private _animPlayer: SkinInstancingData;


    static getSkinKey(meshid: number, full_names: string[]) {
        full_names.sort();
        let key = '' + meshid + '|';
        full_names.forEach(n => {
            n = n.replace('res/model/anim/', '');
            key += n + '|';
        });
        return key;
    }

    constructor(mesh: pc.Mesh) {
        super(mesh.skin)

        this.mesh = mesh;
        this.clips_arr = [];

        this._animPlayer = new SkinInstancingData('');
        this._animPlayer.skin = this;

        let inverseBindPose = this.mesh.skin.inverseBindPose;
        if (!ShareInverseBindPose[mesh.id]) {
            ShareInverseBindPose[mesh.id] = new Float32Array(inverseBindPose.length * 12);
            let mp = ShareInverseBindPose[mesh.id];

            for (let i = 0; i < inverseBindPose.length; i++) {
                const pe = inverseBindPose[i].data;
                // Copy the matrix into the palette, ready to be sent to the vertex shader, transpose matrix from 4x4 to 4x3 format as well
                const base = i * 12;
                mp[base] = pe[0];
                mp[base + 1] = pe[4];
                mp[base + 2] = pe[8];
                mp[base + 3] = pe[12];
                mp[base + 4] = pe[1];
                mp[base + 5] = pe[5];
                mp[base + 6] = pe[9];
                mp[base + 7] = pe[13];
                mp[base + 8] = pe[2];
                mp[base + 9] = pe[6];
                mp[base + 10] = pe[10];
                mp[base + 11] = pe[14];
            }
        }
        this.inverseBindPose = ShareInverseBindPose[mesh.id];
    }

    set useInstancing(b: boolean) {
        this._useInstancing = b;
    }

    get useInstancing() {
        return this._useInstancing && this.mesh.device.supportsBoneTextures;
    }

    get clips() {
        return this._clips;
    }

    get key() {
        return this._key;
    }

    addClip(clip: SimpleAnimClip) {
        if (this.clips[clip.clip_name]) return;

        this.clips[clip.clip_name] = clip;
        this.clips_arr.push(clip);
    }

    bake() {
        let device = this.mesh.device;
        let numBones = this.mesh.skin.inverseBindPose.length;

        if (!this.useInstancing) {
            if (device.supportsBoneTextures) {
                // texture size - roughly square that fits all bones, width is multiply of 3 to simplify shader math
                const numPixels = numBones * 3;
                let width = Math.ceil(Math.sqrt(numPixels));
                width = pc.math.roundUp(width, 3);
                const height = Math.ceil(numPixels / width);

                this.boneTexture = new pc.Texture(device, {
                    width: width,
                    height: height,
                    format: pc.PIXELFORMAT_RGBA32F,
                    mipmaps: false,
                    minFilter: pc.FILTER_NEAREST,
                    magFilter: pc.FILTER_NEAREST,
                    name: 'skin'
                });
                this.matrixPalette = this.boneTexture.lock() as Float32Array;
            } else {
                this.matrixPalette = new Float32Array(numBones * 12);
            }
        }

        let clipsname: string[] = this.clips_arr.map(c => c.full_name);
        let key = this._key = SimpleSkin.getSkinKey(this.mesh.id, clipsname);

        let sharedata = ShareSkinData[key];
        if (sharedata) {
            this.matrices_dic = sharedata.matrices;
            this.matrices_dic_with_inv = sharedata.matricesWithInv;
            this.clipOffset = sharedata.clipOffset;
            this.boneTexture = sharedata.boneTexture;
            return;
        }

        sharedata = ShareSkinData[key] = {} as SkinData;
        sharedata.clipOffset = {};
        sharedata.matrices = {} as { [clip_name: string]: pc.Mat4[][] };
        sharedata.matricesWithInv = {} as { [clip_name: string]: pc.Mat4[][] };


        for (let k = 0; k < this.clips_arr.length; ++k) {
            let clip = this.clips_arr[k];

            let matrices: pc.Mat4[][] = sharedata.matrices[clip.clip_name] = [];
            let matrices_dic_with_inv: pc.Mat4[][] = sharedata.matricesWithInv[clip.clip_name] = [];

            for (let i = 0; i < clip.totalFrame; ++i) {
                let frameinfo = clip.frames[i];
                let arr = matrices[i] = [] as pc.Mat4[];
                let arr2 = matrices_dic_with_inv[i] = [] as pc.Mat4[];
                let { boneNames, inverseBindPose } = this.mesh.skin;
                for (let j = 0; j < boneNames.length; ++j) {
                    let mat = frameinfo.matrix_dic[boneNames[j]];
                    if (!mat) {
                        mat = new pc.Mat4();
                    }
                    arr.push(mat);
                    arr2.push(new pc.Mat4().mulAffine2(mat, inverseBindPose[j]));
                }
            }
        }

        if (this.useInstancing) {

            let totalFrame = 0;
            for (let k in this.clips) {
                totalFrame += this.clips[k].totalFrame;
            }
            let numPixels = numBones * 3 * totalFrame;
            let width = Math.ceil(Math.sqrt(numPixels));
            width = pc.math.roundUp(width, 3 * numBones);
            const height = Math.ceil(numPixels / width);

            sharedata.boneTexture = new pc.Texture(device, {
                width: width,
                height: height,
                format: pc.PIXELFORMAT_RGBA32F,
                mipmaps: false,
                minFilter: pc.FILTER_NEAREST,
                magFilter: pc.FILTER_NEAREST,
                name: 'skin'
            });
            this.matrixPalette = sharedata.boneTexture.lock() as Float32Array;
            const clip_offset = sharedata.clipOffset;

            let base = 0;
            for (let i = 0; i < this.clips_arr.length; ++i) {
                let clip = this.clips_arr[i];
                clip_offset[clip.clip_name] = base / 4;
                const mp = this.matrixPalette;
                let matrices = sharedata.matrices[clip.clip_name];
                for (let i = 0; i < clip.totalFrame; ++i) {
                    let arr = matrices[i];
                    let { boneNames } = this.mesh.skin;
                    for (let j = 0; j < boneNames.length; ++j) {
                        let mat = arr[j];
                        // let pe = mat.data;
                        let s = mat.getScale();
                        let t = mat.getTranslation();
                        let r = new pc.Quat().setFromMat4(mat);
                        mp[base] = s.x;
                        mp[base + 1] = s.y;
                        mp[base + 2] = s.z;
                        mp[base + 3] = 0;
                        mp[base + 4] = t.x;
                        mp[base + 5] = t.y;
                        mp[base + 6] = t.z;
                        mp[base + 7] = 0;
                        mp[base + 8] = r.x;
                        mp[base + 9] = r.y;
                        mp[base + 10] = r.z;
                        mp[base + 11] = r.w;
                        base += 12;
                    }
                }
            }
            sharedata.boneTexture.lock();
            sharedata.boneTexture.unlock();
            //
            this.matrices_dic = sharedata.matrices;
            this.matrices_dic_with_inv = sharedata.matricesWithInv;
            this.clipOffset = sharedata.clipOffset;
            this.boneTexture = sharedata.boneTexture;
        }
    }

    getClipOffset(clip_name: string) {
        if (!clip_name) return 0;
        return this.clipOffset[clip_name];
    }

    getMatricesByFrame(clipname: string, frame: number): pc.Mat4[] {
        let matrices_with_inv = this.matrices_dic_with_inv[clipname];
        return matrices_with_inv[frame];
    }

    uploadBones(device: any) {
        if (device.supportsBoneTextures && !this._useInstancing) {
            this.boneTexture.lock();
            this.boneTexture.unlock();
        }
    }

    get animPlayer() {
        if (this.useInstancing) return null;
        return this._animPlayer;
    }

    _updateMatrices(rootNode: any, skinUpdateIndex: number) {
        if (!this._animPlayer.playing) return;
        let { cur_clip_name, frame } = this._animPlayer;

        let matrices = this.getMatricesByFrame(cur_clip_name, frame)
        const count = this.mesh.skin.boneNames.length;
        for (let i = 0; i < count; i++) {
            (this.matrices[i] as pc.Mat4).copy(matrices[i]);
        }
    }

    updateMatrices(rootNode: any, skinUpdateIndex: number) {
        if (this._updateBeforeCull) {
            this._updateMatrices(rootNode, skinUpdateIndex);
        }
    }

    updateMatrixPalette(rootNode: any, skinUpdateIndex: number) {
        if (this.useInstancing) return;
        if (!this._animPlayer.playing) return;
        this._updateMatrices(rootNode, skinUpdateIndex);
        // copy matrices to palette
        const mp = this.matrixPalette;
        const count = this.mesh.skin.boneNames.length;
        for (let i = 0; i < count; i++) {
            let pe = this.matrices[i].data;
            // Copy the matrix into the palette, ready to be sent to the vertex shader, transpose matrix from 4x4 to 4x3 format as well
            const base = i * 12;
            mp[base] = pe[0];
            mp[base + 1] = pe[4];
            mp[base + 2] = pe[8];
            mp[base + 3] = pe[12];
            mp[base + 4] = pe[1];
            mp[base + 5] = pe[5];
            mp[base + 6] = pe[9];
            mp[base + 7] = pe[13];
            mp[base + 8] = pe[2];
            mp[base + 9] = pe[6];
            mp[base + 10] = pe[10];
            mp[base + 11] = pe[14];
        }
        this.uploadBones(this.skin.device);
    }

    resolve(rootBone: any, entity: any) {

    }

    initSkin(skin: any) {
        this.skin = skin;
        const numBones = skin.inverseBindPose.length;
        this.matrices = [];
        for (let i = 0; i < numBones; i++) {
            this.matrices[i] = new pc.Mat4();
        }
    }



}
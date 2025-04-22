import { SimpleSkin } from '../components/anim/SimpleSkin';
import { GlobalIns } from '../GlobalIns';
import * as pc from '../lib/playcanvas'
import BatchSkinTex from '../components/anim/BatchSkinTex';
import BatchSkinNormal from '../components/anim/BatchSkinNormal';
import CustomTransform from '../components/anim/CustomTransform';

const tempGraphNode = new pc.GraphNode();

export function fixCollisionMeshSystemImpl(app: pc.Application) {
    let impl = app.systems.collision._createImplementation('mesh');
    impl.__proto__.createPhysicalShape = function (entity: pc.Entity, data: any) {
        //@ts-ignore
        if (typeof Ammo === 'undefined') return undefined;
        if (data.model || data.render) {
            //@ts-ignore
            const shape = new Ammo.btCompoundShape();
            if (data.model) {
                const meshInstances = data.model.meshInstances;
                for (let i = 0; i < meshInstances.length; i++) {
                    this.createAmmoMesh(meshInstances[i].mesh, meshInstances[i].node, shape);
                }
            } else if (data.render) {
                const meshes = data.render.simpleMeshes || data.render.meshes;
                for (let i = 0; i < meshes.length; i++) {
                    this.createAmmoMesh(meshes[i], tempGraphNode, shape);
                }
            }
            const entityTransform = entity.getWorldTransform();
            const scale = entityTransform.getScale();
            //@ts-ignore
            const vec = new Ammo.btVector3(scale.x, scale.y, scale.z);
            shape.setLocalScaling(vec);
            //@ts-ignore
            Ammo.destroy(vec);

            return shape;
        }
        return undefined;
    }

    let renderer = app.renderer;
    const boneTextureSize = [0, 0, 0, 0];
    //@ts-ignore
    renderer.__proto__.setSkinning = function (device, meshInstance) {
        if (meshInstance.skinInstance) {
            this._skinDrawCalls++;
            if (device.supportsBoneTextures) {
                const boneTexture = meshInstance.skinInstance.boneTexture as pc.Texture;
                this.boneTextureId.setValue(boneTexture);
                boneTextureSize[0] = boneTexture.width;
                boneTextureSize[1] = boneTexture.height;
                boneTextureSize[2] = 1.0 / boneTexture.width;
                boneTextureSize[3] = 1.0 / boneTexture.height;
                this.boneTextureSizeId.setValue(boneTextureSize);
            } else {
                this.poseMatrixId.setValue(meshInstance.skinInstance.matrixPalette);
            }
            if (meshInstance.skinInstance instanceof SimpleSkin){
                if (meshInstance.skinInstance.useInstancing) {
                    this.poseMatrixId.setValue(meshInstance.skinInstance.inverseBindPose);
                }
            }
        }
    }

    //@ts-ignore
    pc.shaderChunks.batchSkinTexVS = "#define BONE_LIMIT " + GlobalIns.app.graphicsDevice.getBoneLimit() + "\n" + BatchSkinTex;
    //@ts-ignore
    pc.shaderChunks.normalVS = BatchSkinNormal;
    //@ts-ignore
    pc.shaderChunks.transformVS = CustomTransform;
}

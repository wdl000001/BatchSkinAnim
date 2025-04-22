export default /* glsl */`

attribute vec4 vertex_boneWeights;
attribute vec4 vertex_boneIndices;

uniform highp sampler2D texture_poseMap;
uniform vec4 texture_poseMapSize;


uniform vec4 matrix_pose[BONE_LIMIT * 3];

void getBoneInvMatrix(const in float i, out vec4 v1, out vec4 v2, out vec4 v3) {
    // read 4x3 matrix
    v1 = matrix_pose[int(3.0 * i)];
    v2 = matrix_pose[int(3.0 * i + 1.0)];
    v3 = matrix_pose[int(3.0 * i + 2.0)];
}

void getBoneMatrix(const in float index, const in float clipoffset,  out vec4 v1, out vec4 v2, out vec4 v3) {

    float j = float(index)*3.0 + clipoffset;
    float dx = texture_poseMapSize.z;
    float dy = texture_poseMapSize.w;
    
    float y = floor(j * dx);
    float x = j - (y * texture_poseMapSize.x);
    y = dy * (y + 0.5);

    // read elements of 4x3 matrix
    v1 = texture2D(texture_poseMap, vec2(dx * (x + 0.5), y));
    v2 = texture2D(texture_poseMap, vec2(dx * (x + 1.5), y));
    v3 = texture2D(texture_poseMap, vec2(dx * (x + 2.5), y));
}

vec4 blendQuat(vec4 q1, vec4 q2, float w1, float w2) {
    
    if (dot(q1, q2) < 0.0) q2 = -q2;

    vec4 blended = w1 * q1 + w2 * q2;
    
    blended = normalize(blended);
    
    return blended;
}

void setTRS(vec4 t, vec4 r, vec4 s, out mat4 result) {
    float qx = r.x;
    float qy = r.y;
    float qz = r.z;
    float qw = r.w;
    
    float sx = s.x;
    float sy = s.y;
    float sz = s.z;
    
    float x2 = qx + qx;
    float y2 = qy + qy;
    float z2 = qz + qz;
    float xx = qx * x2;
    float xy = qx * y2;
    float xz = qx * z2;
    float yy = qy * y2;
    float yz = qy * z2;
    float zz = qz * z2;
    float wx = qw * x2;
    float wy = qw * y2;
    float wz = qw * z2;
    
    result = mat4(
        (1.0 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
        (xy - wz) * sy, (1.0 - (xx + zz)) * sy, (yz + wx) * sy, 0,
        (xz + wy) * sz, (yz - wx) * sz, (1.0 - (xx + yy)) * sz, 0,
        t.x, t.y, t.z, 1.0
    );
}

mat4 getSkinMatrix(const in vec4 indices, const in vec4 weights) {

    vec4 b1_inv_1,b1_inv_2,b1_inv_3;
    getBoneInvMatrix(indices.x, b1_inv_1,b1_inv_2,b1_inv_3);
    mat4 invmat1 = mat4(
        b1_inv_1.x, b1_inv_2.x, b1_inv_3.x, 0,
        b1_inv_1.y, b1_inv_2.y, b1_inv_3.y, 0,
        b1_inv_1.z, b1_inv_2.z, b1_inv_3.z, 0,
        b1_inv_1.w, b1_inv_2.w, b1_inv_3.w, 1.0
    );

    vec4 b2_inv_1,b2_inv_2,b2_inv_3;
    getBoneInvMatrix(indices.y, b2_inv_1,b2_inv_2,b2_inv_3);
    mat4 invmat2 = mat4(
        b2_inv_1.x, b2_inv_2.x, b2_inv_3.x, 0,
        b2_inv_1.y, b2_inv_2.y, b2_inv_3.y, 0,
        b2_inv_1.z, b2_inv_2.z, b2_inv_3.z, 0,
        b2_inv_1.w, b2_inv_2.w, b2_inv_3.w, 1.0
    );

    vec4 b3_inv_1,b3_inv_2,b3_inv_3;
    getBoneInvMatrix(indices.z, b3_inv_1,b3_inv_2,b3_inv_3);
    mat4 invmat3 = mat4(
        b3_inv_1.x, b3_inv_2.x, b3_inv_3.x, 0,
        b3_inv_1.y, b3_inv_2.y, b3_inv_3.y, 0,
        b3_inv_1.z, b3_inv_2.z, b3_inv_3.z, 0,
        b3_inv_1.w, b3_inv_2.w, b3_inv_3.w, 1.0
    );

    // vec4 b4_inv_1,b4_inv_2,b4_inv_3;
    // getBoneInvMatrix(indices.w, b4_inv_1,b4_inv_2,b4_inv_3);
    // mat4 invmat4 = mat4(
    //     b4_inv_1.x, b4_inv_2.x, b4_inv_3.x, 0,
    //     b4_inv_1.y, b4_inv_2.y, b4_inv_3.y, 0,
    //     b4_inv_1.z, b4_inv_2.z, b4_inv_3.z, 0,
    //     b4_inv_1.w, b4_inv_2.w, b4_inv_3.w, 1.0
    // );

    // get 4 bone matrices of clip 1
    vec4 s1_1, t1_1, r1_1;
    getBoneMatrix(indices.x,instance_line1.w,  s1_1, t1_1, r1_1);

    vec4 s1_2, t1_2, r1_2;
    getBoneMatrix(indices.y, instance_line1.w, s1_2, t1_2, r1_2);

    vec4 s1_3, t1_3, r1_3;
    getBoneMatrix(indices.z,instance_line1.w,  s1_3, t1_3, r1_3);

    // vec4 s1_4, t1_4, r1_4;
    // getBoneMatrix(indices.w, instance_line1.w, s1_4, t1_4, r1_4);

    // get 4 bone matrices of clip 2
    vec4 s2_1, t2_1, r2_1;
    vec4 s2_2, t2_2, r2_2;
    vec4 s2_3, t2_3, r2_3;
    // vec4 s2_4, t2_4, r2_4;

    mat4 bonemat;
    mat4 bonemat1, bonemat2, bonemat3;
    if(instance_line2.w > 0.0){
        getBoneMatrix(indices.x, instance_line2.w, s2_1, t2_1, r2_1);
        getBoneMatrix(indices.y,instance_line2.w,  s2_2, t2_2, r2_2);
        getBoneMatrix(indices.z,instance_line2.w,  s2_3, t2_3, r2_3);
        // getBoneMatrix(indices.w, instance_line2.w, s2_4, t2_4, r2_4);

        vec4 t1 = t1_1 * instance_line3.w + t2_1 * instance_line4.w;
        vec4 r1 = blendQuat(r1_1, r2_1, instance_line3.w, instance_line4.w);
        vec4 s1 = s1_1 * instance_line3.w + s2_1 * instance_line4.w;

        vec4 t2 = t1_2 * instance_line3.w + t2_2 * instance_line4.w;
        vec4 r2 = blendQuat(r1_2, r2_2, instance_line3.w, instance_line4.w);
        vec4 s2 = s1_2 * instance_line3.w + s2_2 * instance_line4.w;

        vec4 t3 = t1_3 * instance_line3.w + t2_3 * instance_line4.w;
        vec4 r3 = blendQuat(r1_3, r2_3, instance_line3.w, instance_line4.w);
        vec4 s3 = s1_3 * instance_line3.w + s2_3 * instance_line4.w;

        // vec4 t4 = t1_4 * instance_line3.w + t2_4 * instance_line4.w;
        // vec4 r4 = blendQuat(r1_4, r2_4, instance_line3.w, instance_line4.w);
        // vec4 s4 = s1_4 * instance_line3.w + s2_4 * instance_line4.w;

        setTRS(t1,r1,s1, bonemat1);
        setTRS(t2,r2,s2, bonemat2);
        setTRS(t3,r3,s3, bonemat3);
        //setTRS(t4,r4,s4, bonemat4);
    }else{
        setTRS(t1_1, r1_1, s1_1, bonemat1);
        setTRS(t1_2, r1_2, s1_2, bonemat2);
        setTRS(t1_3, r1_3, s1_3, bonemat3);
        //setTRS(t4,r4,s4, bonemat4);
    }
    bonemat = bonemat1 * invmat1 * weights.x + bonemat2 * invmat2 * weights.y + bonemat3 * invmat3 * weights.z;// + bonemat4 * invmat4 * weights.w;

    // transpose to 4x4 matrix
    mat4 modelmat =  mat4(
        vec4(instance_line1.x, instance_line1.y, instance_line1.z, 0),
        vec4(instance_line2.x, instance_line2.y, instance_line2.z, 0),
        vec4(instance_line3.x, instance_line3.y, instance_line3.z, 0),
        vec4(instance_line4.x, instance_line4.y, instance_line4.z, 1.0)
        );

    return modelmat * bonemat;
}
`;

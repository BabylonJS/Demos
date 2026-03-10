import {
    Mesh,
    MeshBuilder,
    StandardMaterial,
    TransformNode,
    Vector3,
} from "@babylonjs/core";


// Adapted from the piano model tutorial at https://learn.microsoft.com/en-us/windows/mixed-reality/develop/javascript/tutorials/babylonjs-webxr-piano/keyboard-model-02.

const whiteKeyDepth = 10;
const blackKeyDepth = 8.75;

export class PianoKeys extends TransformNode {
    constructor() {
        super(`PianoKeys`);

        const keyTopGap = 20
        const keyOffsetX = 52.8 + keyTopGap / 2;
        const keyRadius = 24
        const keyCircumference = 122.4 + keyTopGap;

        const whiteMaterial = new StandardMaterial(`pianoKeys.whiteMaterial`);
        whiteMaterial.diffuseColor.set(0.75, 0.75, 0.75);

        const blackMaterial = new StandardMaterial(`pianoKeys.blackMaterial`);
        blackMaterial.diffuseColor.set(0, 0, 0);

        const litMaterial = new StandardMaterial(`pianoKeys.litMaterial`);
        litMaterial.emissiveColor.set(1, 1, 1);

        this.radius = keyRadius;

        const keyAngle = (keyX) => {
            keyX += keyOffsetX;
            keyX /= keyCircumference;
            return (2 * Math.PI * keyX) + Math.PI;
        }

        const buildKey = function (props) {
            if (props.type === `white`) {
                const bottom = MeshBuilder.CreateBox(`whiteKeyBottom`, {width: props.bottomWidth, height: 1.5, depth: whiteKeyDepth});

                const top = MeshBuilder.CreateBox(`whiteKeyTop`, {width: props.topWidth, height: 1.5, depth: blackKeyDepth});
                top.position.z =  4.75;
                top.position.x += props.topPositionX;

                const key = Mesh.MergeMeshes([bottom, top], true, false, null, false, false);
                const keyX = props.referencePositionX + props.wholePositionX;
                const angle = keyAngle(keyX);
                key.position.y = -keyRadius;
                key.rotateAround(Vector3.ZeroReadOnly, Vector3.LeftHandedForwardReadOnly, angle);
                key.name = props.note + props.register;

                return { isWhite: true, mesh: key, angle: angle, note: `${props.note}${props.register}`, position: key.position, rotation: key.rotationQuaternion, litInstance: null, duration: 0, timeRemaining: 0 };
            }
            else if (props.type === `black`) {
                const key = MeshBuilder.CreateBox(props.note + props.register, {width: 1.4, height: 3, depth: blackKeyDepth});
                key.position.z = 4.75;
                key.position.y = -keyRadius;
                const keyX = props.referencePositionX + props.wholePositionX;
                const angle = keyAngle(keyX);
                key.rotateAround(Vector3.ZeroReadOnly, Vector3.LeftHandedForwardReadOnly, angle);

                return { isWhite: false, mesh: key, angle: angle, note: `${props.note}${props.register}`, position: key.position, rotation: key.rotationQuaternion, litInstance: null, duration: 0, timeRemaining: 0 };
            }
        }

        const keyParams = [
            {type: `white`, note: `C`, topWidth: 1.4, bottomWidth: 2.3, topPositionX: -0.45, wholePositionX: -14.4},
            {type: `black`, note: `C#`, wholePositionX: -13.45},
            {type: `white`, note: `D`, topWidth: 1.4, bottomWidth: 2.4, topPositionX: 0, wholePositionX: -12},
            {type: `black`, note: `D#`, wholePositionX: -10.6},
            {type: `white`, note: `E`, topWidth: 1.4, bottomWidth: 2.3, topPositionX: 0.45, wholePositionX: -9.6},
            {type: `white`, note: `F`, topWidth: 1.3, bottomWidth: 2.4, topPositionX: -0.55, wholePositionX: -7.2},
            {type: `black`, note: `F#`, wholePositionX: -6.35},
            {type: `white`, note: `G`, topWidth: 1.3, bottomWidth: 2.3, topPositionX: -0.2, wholePositionX: -4.8},
            {type: `black`, note: `G#`, wholePositionX: -3.6},
            {type: `white`, note: `A`, topWidth: 1.3, bottomWidth: 2.3, topPositionX: 0.2, wholePositionX: -2.4},
            {type: `black`, note: `A#`, wholePositionX: -0.85},
            {type: `white`, note: `B`, topWidth: 1.3, bottomWidth: 2.4, topPositionX: 0.55, wholePositionX: 0},
        ]

        let midiNoteNumber = 21; // Lowest A key on 88 key piano.

        const whiteKeyMeshes = [];
        const blackKeyMeshes = [];

        // Register 0
        {
            const builtKey = buildKey({type: `white`, note: `A`, topWidth: 1.9, bottomWidth: 2.3, topPositionX: -0.20, wholePositionX: -2.4, register: 0, referencePositionX: -2.4 * 21});
            this._keys[midiNoteNumber++] = builtKey;
            whiteKeyMeshes.push(builtKey.mesh);

            keyParams.slice(10, 12).forEach(key => {
                const builtKey = buildKey(Object.assign({register: 0, referencePositionX: -2.4 * 21}, key));
                this._keys[midiNoteNumber++] = builtKey;

                if (key.type == `white`) {
                    whiteKeyMeshes.push(builtKey.mesh);
                }
                else {
                    blackKeyMeshes.push(builtKey.mesh);
                }
            });
        }

        // Register 1 through 7
        {
            var referencePositionX = -2.4*14;
            for (let register = 1; register <= 7; register++) {
                keyParams.forEach(key => {
                    const builtKey = buildKey(Object.assign({register: register, referencePositionX: referencePositionX}, key));
                    this._keys[midiNoteNumber++] = builtKey;

                    if (key.type == `white`) {
                        whiteKeyMeshes.push(builtKey.mesh);
                    }
                    else {
                        blackKeyMeshes.push(builtKey.mesh);
                    }
                    })
                referencePositionX += 2.4*7;
            }
        }

        // Register 8
        {
            const builtKey = buildKey({type: `white`, note: `C`, topWidth: 2.3, bottomWidth: 2.3, topPositionX: 0, wholePositionX: -2.4*6, register: 8, referencePositionX: 84});
            this._keys[midiNoteNumber++] = builtKey;
            whiteKeyMeshes.push(builtKey.mesh);
        }

        const whiteKeysMesh = Mesh.MergeMeshes(whiteKeyMeshes, true, true);
        whiteKeysMesh.parent = this;
        whiteKeysMesh.renderingGroupId = 2;
        whiteKeysMesh.isPickable = false;
        whiteKeysMesh.material = whiteMaterial;

        const blackKeysMesh = Mesh.MergeMeshes(blackKeyMeshes, true, true);
        blackKeysMesh.parent = this;
        blackKeysMesh.renderingGroupId = 2;
        blackKeysMesh.isPickable = false;
        blackKeysMesh.material = blackMaterial;

        this.rotateAround(Vector3.ZeroReadOnly, Vector3.RightReadOnly, -Math.PI / 2);
        this.scaling.setAll(0.0175);
        this.position.y += 0.2;

        // Create lit instances.

        const whiteLitSource = buildKey({type: `white`, note: `C`, topWidth: 2.3, bottomWidth: 2.3, topPositionX: 0, wholePositionX: -2.4*6, register: 8, referencePositionX: 84}).mesh;
        whiteLitSource.material = litMaterial;
        whiteLitSource.renderingGroupId = 2;
        whiteLitSource.parent = this;
        whiteLitSource.isVisible = false;

        const blackLitSource = buildKey({type: `black`, note: `A#`, wholePositionX: -0.85}).mesh;
        blackLitSource.material = litMaterial;
        blackLitSource.renderingGroupId = 2;
        blackLitSource.parent = this;
        blackLitSource.isVisible = false;

        this._keys.forEach((key) => {
            if (key.isWhite) {
                key.litInstance = whiteLitSource.createInstance(``);
            }
            else {
                key.litInstance = blackLitSource.createInstance(``);
            }
            key.litInstance.scaling.setAll(1.01);
            key.litInstance.rotationQuaternion.copyFrom(key.rotation);
            key.litInstance.position.copyFrom(key.position);
            key.litInstance.isVisible = false;
            key.litInstance.parent = this;
        });
    }

    public radius = 0;

    public keyAngle = (midiNoteNumber: number): number => {
        return this._keys[midiNoteNumber].angle;
    }

    public noteOn(noteNumber, duration) {
        const key = this._keys[noteNumber];
        key.timeRemaining = key.duration = duration;
        key.litInstance.isVisible = true;
        key.litInstance.scaling.z = 1;
        key.litInstance.position.z = 0;
    }

    public render(deltaTime) {
        this._keys.forEach((key) => {
            if (0 < key.timeRemaining) {
                key.litInstance.scaling.z = key.timeRemaining / key.duration;
                key.litInstance.position.z = -0.01 - (1 - key.litInstance.scaling.z) * (key.isWhite ? whiteKeyDepth : blackKeyDepth) / 2;
                key.timeRemaining -= deltaTime;
                if (key.timeRemaining <= 0) {
                    key.litInstance.isVisible = false;
                }
            }
        });
    }

    private _keys = [];
}

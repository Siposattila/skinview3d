import * as THREE from "three";
import { PlayerObject } from "./model";
import { invokeAnimation } from "./animation";

function copyImage(context, sX, sY, w, h, dX, dY, flipHorizontal) {
	let imgData = context.getImageData(sX, sY, w, h);
	if (flipHorizontal) {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < (w / 2); x++) {
				let index = (x + y * w) * 4;
				let index2 = ((w - x - 1) + y * w) * 4;
				let pA1 = imgData.data[index];
				let pA2 = imgData.data[index + 1];
				let pA3 = imgData.data[index + 2];
				let pA4 = imgData.data[index + 3];

				let pB1 = imgData.data[index2];
				let pB2 = imgData.data[index2 + 1];
				let pB3 = imgData.data[index2 + 2];
				let pB4 = imgData.data[index2 + 3];

				imgData.data[index] = pB1;
				imgData.data[index + 1] = pB2;
				imgData.data[index + 2] = pB3;
				imgData.data[index + 3] = pB4;

				imgData.data[index2] = pA1;
				imgData.data[index2 + 1] = pA2;
				imgData.data[index2 + 2] = pA3;
				imgData.data[index2 + 3] = pA4;
			}
		}
	}
	context.putImageData(imgData, dX, dY);
}

function hasTransparency(context, x0, y0, w, h) {
	let imgData = context.getImageData(x0, y0, w, h);
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let offset = (x + y * w) * 4;
			if (imgData.data[offset + 3] !== 0xff) {
				return true;
			}
		}
	}
	return false;
}

function computeSkinScale(width) {
	return width / 64.0;
}

function convertSkinTo1_8(skinContext, width) {
	let scale = computeSkinScale(width);
	let copySkin = (sX, sY, w, h, dX, dY, flipHorizontal) => copyImage(skinContext, sX * scale, sY * scale, w * scale, h * scale, dX * scale, dY * scale, flipHorizontal);

	copySkin(4, 16, 4, 4, 20, 48, true); // Top Leg
	copySkin(8, 16, 4, 4, 24, 48, true); // Bottom Leg
	copySkin(0, 20, 4, 12, 24, 52, true); // Outer Leg
	copySkin(4, 20, 4, 12, 20, 52, true); // Front Leg
	copySkin(8, 20, 4, 12, 16, 52, true); // Inner Leg
	copySkin(12, 20, 4, 12, 28, 52, true); // Back Leg
	copySkin(44, 16, 4, 4, 36, 48, true); // Top Arm
	copySkin(48, 16, 4, 4, 40, 48, true); // Bottom Arm
	copySkin(40, 20, 4, 12, 40, 52, true); // Outer Arm
	copySkin(44, 20, 4, 12, 36, 52, true); // Front Arm
	copySkin(48, 20, 4, 12, 32, 52, true); // Inner Arm
	copySkin(52, 20, 4, 12, 44, 52, true); // Back Arm
}

function isSlimSkin(skinContext, width) {
	// Detects whether the skin is default or slim.
	//
	// The right arm area of *default* skins:
	// (44,16)->*-------*-------*
	// (40,20)  |top    |bottom |
	// \|/      |4x4    |4x4    |
	//  *-------*-------*-------*-------*
	//  |right  |front  |left   |back   |
	//  |4x12   |4x12   |4x12   |4x12   |
	//  *-------*-------*-------*-------*
	// The right arm area of *slim* skins:
	// (44,16)->*------*------*-*
	// (40,20)  |top   |bottom| |<----[x0=50,y0=16,w=2,h=4]
	// \|/      |3x4   |3x4   | |
	//  *-------*------*------***-----*-*
	//  |right  |front |left   |back  | |<----[x0=54,y0=20,w=2,h=12]
	//  |4x12   |3x12  |4x12   |3x12  | |
	//  *-------*------*-------*------*-*
	// Compared with default right arms, slim right arms have 2 unused areas.
	//
	// The same is true for left arm:
	// The left arm area of *default* skins:
	// (36,48)->*-------*-------*
	// (32,52)  |top    |bottom |
	// \|/      |4x4    |4x4    |
	//  *-------*-------*-------*-------*
	//  |right  |front  |left   |back   |
	//  |4x12   |4x12   |4x12   |4x12   |
	//  *-------*-------*-------*-------*
	// The left arm area of *slim* skins:
	// (36,48)->*------*------*-*
	// (32,52)  |top   |bottom| |<----[x0=42,y0=48,w=2,h=4]
	// \|/      |3x4   |3x4   | |
	//  *-------*------*------***-----*-*
	//  |right  |front |left   |back  | |<----[x0=46,y0=52,w=2,h=12]
	//  |4x12   |3x12  |4x12   |3x12  | |
	//  *-------*------*-------*------*-*
	//
	// If there is a transparent pixel in any of the 4 unused areas, the skin must be slim,
	// as transparent pixels are not allowed in the first layer.

	let scale = computeSkinScale(width);
	let checkArea = (x, y, w, h) => hasTransparency(skinContext, x * scale, y * scale, w * scale, h * scale);
	return checkArea(50, 16, 2, 4) ||
		checkArea(54, 20, 2, 12) ||
		checkArea(42, 48, 2, 4) ||
		checkArea(46, 52, 2, 12);
}

class SkinViewer {
	constructor(options) {
		this.domElement = options.domElement;
		this.animation = options.animation || null;
		this.animationPaused = false;
		this.animationTime = 0;
		this.disposed = false;

		// texture
		this.skinImg = new Image();
		this.skinCanvas = document.createElement("canvas");
		this.skinTexture = new THREE.Texture(this.skinCanvas);
		this.skinTexture.magFilter = THREE.NearestFilter;
		this.skinTexture.minFilter = THREE.NearestFilter;

		this.capeImg = new Image();
		this.capeCanvas = document.createElement("canvas");
		this.capeTexture = new THREE.Texture(this.capeCanvas);
		this.capeTexture.magFilter = THREE.NearestFilter;
		this.capeTexture.minFilter = THREE.NearestFilter;

		this.layer1Material = new THREE.MeshBasicMaterial({ map: this.skinTexture, side: THREE.FrontSide });
		this.layer2Material = new THREE.MeshBasicMaterial({ map: this.skinTexture, transparent: true, opacity: 1, side: THREE.DoubleSide, alphaTest: 0.5 });
		this.capeMaterial = new THREE.MeshBasicMaterial({ map: this.capeTexture, transparent: true, opacity: 1, side: THREE.DoubleSide, alphaTest: 0.5 });

		// scene
		this.scene = new THREE.Scene();

		// Use smaller fov to avoid distortion
		this.camera = new THREE.PerspectiveCamera(40);
		this.camera.position.y = -12;
		this.camera.position.z = 60;

		this.renderer = new THREE.WebGLRenderer({ angleRot: true, alpha: true, antialias: false });
		this.renderer.setSize(300, 300); // default size
		this.renderer.context.getShaderInfoLog = () => ""; // shut firefox up
		this.domElement.appendChild(this.renderer.domElement);

		this.playerObject = new PlayerObject(this.layer1Material, this.layer2Material, this.capeMaterial);
		this.scene.add(this.playerObject);

		// texture loading
		this.skinImg.crossOrigin = "anonymous";
		this.skinImg.onerror = () => console.error("Failed loading " + this.skinImg.src);
		this.skinImg.onload = () => {
			let isOldFormat = false;
			if (this.skinImg.width !== this.skinImg.height) {
				if (this.skinImg.width === 2 * this.skinImg.height) {
					isOldFormat = true;
				} else {
					console.error("Bad skin size");
					return;
				}
			}

			let skinContext = this.skinCanvas.getContext("2d");
			if (isOldFormat) {
				let width = this.skinImg.width;
				this.skinCanvas.width = width;
				this.skinCanvas.height = width;
				skinContext.clearRect(0, 0, width, width);
				skinContext.drawImage(this.skinImg, 0, 0, width, width / 2.0);
				convertSkinTo1_8(skinContext, width);
			} else {
				this.skinCanvas.width = this.skinImg.width;
				this.skinCanvas.height = this.skinImg.height;
				skinContext.clearRect(0, 0, this.skinCanvas.width, this.skinCanvas.height);
				skinContext.drawImage(this.skinImg, 0, 0, this.skinCanvas.width, this.skinCanvas.height);
			}

			this.playerObject.skin.slim = isSlimSkin(skinContext, this.skinCanvas.width);

			this.skinTexture.needsUpdate = true;
			this.layer1Material.needsUpdate = true;
			this.layer2Material.needsUpdate = true;

			this.playerObject.skin.visible = true;
		};

		this.capeImg.crossOrigin = "anonymous";
		this.capeImg.onerror = () => console.error("Failed loading " + this.capeImg.src);
		this.capeImg.onload = () => {
			let isOldFormat = false;
			if (this.capeImg.width !== 2 * this.capeImg.height) {
				if (this.capeImg.width * 17 == this.capeImg.height * 22) {
					// width/height = 22/17
					isOldFormat = true;
				} else {
					console.error("Bad cape size");
					return;
				}
			}

			let capeContext = this.capeCanvas.getContext("2d");
			if (isOldFormat) {
				let width = this.capeImg.width * 64 / 22;
				this.capeCanvas.width = width;
				this.capeCanvas.height = width / 2;
			} else {
				this.capeCanvas.width = this.capeImg.width;
				this.capeCanvas.height = this.capeImg.height;
			}
			capeContext.clearRect(0, 0, this.capeCanvas.width, this.capeCanvas.height);
			capeContext.drawImage(this.capeImg, 0, 0, this.capeImg.width, this.capeImg.height);

			this.capeTexture.needsUpdate = true;
			this.capeMaterial.needsUpdate = true;

			this.playerObject.cape.visible = true;
		};

		if (options.skinUrl) this.skinUrl = options.skinUrl;
		if (options.capeUrl) this.capeUrl = options.capeUrl;
		if (options.width) this.width = options.width;
		if (options.height) this.height = options.height;

		let draw = () => {
			if (this.disposed) return;
			window.requestAnimationFrame(draw);
			if (!this.animationPaused) {
				this.animationTime++;
				if (this.animation) {
					invokeAnimation(this.animation, this.playerObject, this.animationTime / 100.0);
				}
			}
			this.renderer.render(this.scene, this.camera);
		};
		draw();
	}

	setSize(width, height) {
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height);
	}

	dispose() {
		this.disposed = true;
		this.domElement.removeChild(this.renderer.domElement);
		this.renderer.dispose();
		this.skinTexture.dispose();
		this.capeTexture.dispose();
	}

	get skinUrl() {
		return this.skinImg.src;
	}

	set skinUrl(url) {
		this.skinImg.src = url;
	}

	get capeUrl() {
		return this.capeImg.src;
	}

	set capeUrl(url) {
		this.capeImg.src = url;
	}

	get width() {
		return this.renderer.getSize().width;
	}

	set width(newWidth) {
		this.setSize(newWidth, this.height);
	}

	get height() {
		return this.renderer.getSize().height;
	}

	set height(newHeight) {
		this.setSize(this.width, newHeight);
	}
}

export { SkinViewer };

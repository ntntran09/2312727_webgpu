import { mat4 } from 'https://unpkg.com/wgpu-matrix@3.0.0/dist/3.x/wgpu-matrix.module.js';

const cubeVertexSize = 4 * 10;
const cubePositionOffset = 0;
const cubeUVOffset = 4 * 8;
const cubeVertexCount = 36;
let showBoundingBoxes = false; // Mặc định là bật
 
const cubeVertexArray = new Float32Array([
	// float4 position, float4 color, float2 uv,
	1, -1, 1, 1,   1, 0, 1, 1,  0, 1,
	-1, -1, 1, 1,  0, 0, 1, 1,  1, 1,
	-1, -1, -1, 1, 0, 0, 0, 1,  1, 0,
	1, -1, -1, 1,  1, 0, 0, 1,  0, 0,
	1, -1, 1, 1,   1, 0, 1, 1,  0, 1,
	-1, -1, -1, 1, 0, 0, 0, 1,  1, 0,

	1, 1, 1, 1,    1, 1, 1, 1,  0, 1,
	1, -1, 1, 1,   1, 0, 1, 1,  1, 1,
	1, -1, -1, 1,  1, 0, 0, 1,  1, 0,
	1, 1, -1, 1,   1, 1, 0, 1,  0, 0,
	1, 1, 1, 1,    1, 1, 1, 1,  0, 1,
	1, -1, -1, 1,  1, 0, 0, 1,  1, 0,

	-1, 1, 1, 1,   0, 1, 1, 1,  0, 1,
	1, 1, 1, 1,    1, 1, 1, 1,  1, 1,
	1, 1, -1, 1,   1, 1, 0, 1,  1, 0,
	-1, 1, -1, 1,  0, 1, 0, 1,  0, 0,
	-1, 1, 1, 1,   0, 1, 1, 1,  0, 1,
	1, 1, -1, 1,   1, 1, 0, 1,  1, 0,

	-1, -1, 1, 1,  0, 0, 1, 1,  0, 1,
	-1, 1, 1, 1,   0, 1, 1, 1,  1, 1,
	-1, 1, -1, 1,  0, 1, 0, 1,  1, 0,
	-1, -1, -1, 1, 0, 0, 0, 1,  0, 0,
	-1, -1, 1, 1,  0, 0, 1, 1,  0, 1,
	-1, 1, -1, 1,  0, 1, 0, 1,  1, 0,

	1, 1, 1, 1,    1, 1, 1, 1,  0, 1,
	-1, 1, 1, 1,   0, 1, 1, 1,  1, 1,
	-1, -1, 1, 1,  0, 0, 1, 1,  1, 0,
	-1, -1, 1, 1,  0, 0, 1, 1,  1, 0,
	1, -1, 1, 1,   1, 0, 1, 1,  0, 0,
	1, 1, 1, 1,    1, 1, 1, 1,  0, 1,

	1, -1, -1, 1,  1, 0, 0, 1,  0, 1,
	-1, -1, -1, 1, 0, 0, 0, 1,  1, 1,
	-1, 1, -1, 1,  0, 1, 0, 1,  1, 0,
	1, 1, -1, 1,   1, 1, 0, 1,  0, 0,
	1, -1, -1, 1,  1, 0, 0, 1,  0, 1,
	-1, 1, -1, 1,  0, 1, 0, 1,  1, 0,
]);

const basicVertWGSL = `
struct Uniforms {
	modelViewProjectionMatrix : mat4x4f,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
	@builtin(position) Position : vec4f,
	@location(0) fragUV : vec2f,
	@location(1) fragPosition: vec4f,
}

@vertex
fn main(
	@location(0) position : vec4f,
	@location(1) uv : vec2f
) -> VertexOutput {
	var output : VertexOutput;
	output.Position = uniforms.modelViewProjectionMatrix * position;
	output.fragUV = uv;
	output.fragPosition = 0.5 * (position + vec4(1.0, 1.0, 1.0, 1.0));
	return output;
}
`;
 
const vertexPositionColorWGSL = `
@fragment
fn main(
	@location(0) fragUV: vec2f,
	@location(1) fragPosition: vec4f
) -> @location(0) vec4f {
	_ = fragUV;
	return fragPosition;
}
`;

const bboxVertWGSL = `
struct VertexOutput {
	@builtin(position) Position : vec4f,
}

@vertex
fn main(@location(0) position : vec2f) -> VertexOutput {
	var output : VertexOutput;
	output.Position = vec4f(position, 0.0, 1.0);
	return output;
}
`;

const bboxFragWGSL = `
@fragment
fn main() -> @location(0) vec4f {
	return vec4f(1.0, 0.96, 0.35, 1.0);
}
`;

const collisionBorderFragWGSL = `
@fragment
fn main() -> @location(0) vec4f {
	return vec4f(0.2, 0.95, 1.0, 1.0);
}
`;

async function init() {
	const status = document.querySelector('#status');
	const canvas = document.querySelector('canvas');

	function showStatus(message) {
		status.textContent = message;
		status.style.display = 'flex';
		canvas.style.display = 'none';
	}

	if (!navigator.gpu) {
		showStatus('Trinh duyet nay khong ho tro WebGPU. Hay dung ban Chrome/Edge moi nhat.');
		return;
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		showStatus('Khong tim thay GPUAdapter phu hop.');
		return;
	}

	const device = await adapter.requestDevice();
	const context = canvas.getContext('webgpu');
	const fov = Math.PI / 3;
	const zDistance = 6;
	const ndcMargin = 0;
	const maxDt = 1 / 20;

	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

	context.configure({
		device,
		format: presentationFormat,
		alphaMode: 'premultiplied',
	});

	// Create a vertex buffer from the cube data.
	const verticesBuffer = device.createBuffer({
		size: cubeVertexArray.byteLength,
		usage: GPUBufferUsage.VERTEX,
		mappedAtCreation: true,
	});
	new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
	verticesBuffer.unmap();

	// Dynamic 2D screen-space bounding box buffer (4 edges = 8 vertices, vec2 each)
	const bboxVertexCount = 8;
	const bboxLineArray = new Float32Array(bboxVertexCount * 2);
	const bboxBuffer = device.createBuffer({
		size: bboxLineArray.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});

	const collisionBorderVertexCount = 8;
	const collisionBorderArray = new Float32Array(collisionBorderVertexCount * 2);
	const collisionBorderBuffer = device.createBuffer({
		size: collisionBorderArray.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});

	const pipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: {
			module: device.createShaderModule({
				code: basicVertWGSL,
			}),
			buffers: [
				{
					arrayStride: cubeVertexSize,
					attributes: [
						{
							// position
							shaderLocation: 0,
							offset: cubePositionOffset,
							format: 'float32x4',
						},
						{
							// uv
							shaderLocation: 1,
							offset: cubeUVOffset,
							format: 'float32x2',
						},
					],
				},
			],
		},
		fragment: {
			module: device.createShaderModule({
				code: vertexPositionColorWGSL,
			}),
			targets: [
				{
					format: presentationFormat,
				},
			],
		},
		primitive: {
			topology: 'triangle-list',
			cullMode: 'back',
		},
		depthStencil: {
			depthWriteEnabled: true,
			depthCompare: 'less',
			format: 'depth24plus',
		},
	});

	const bboxPipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: {
			module: device.createShaderModule({
				code: bboxVertWGSL,
			}),
			buffers: [
				{
					arrayStride: 4 * 2,
					attributes: [
						{
							shaderLocation: 0,
							offset: 0,
							format: 'float32x2',
						},
					],
				},
			],
		},
		fragment: {
			module: device.createShaderModule({
				code: bboxFragWGSL,
			}),
			targets: [{ format: presentationFormat }],
		},
		primitive: {
			topology: 'line-list',
		},
		depthStencil: {
			depthWriteEnabled: false,
			depthCompare: 'always',
			format: 'depth24plus',
		},
	});

	const collisionBorderPipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: {
			module: device.createShaderModule({
				code: bboxVertWGSL,
			}),
			buffers: [
				{
					arrayStride: 4 * 2,
					attributes: [
						{
							shaderLocation: 0,
							offset: 0,
							format: 'float32x2',
						},
					],
				},
			],
		},
		fragment: {
			module: device.createShaderModule({
				code: collisionBorderFragWGSL,
			}),
			targets: [{ format: presentationFormat }],
		},
		primitive: {
			topology: 'line-list',
		},
		depthStencil: {
			depthWriteEnabled: false,
			depthCompare: 'always',
			format: 'depth24plus',
		},
	});

	const uniformBufferSize = 4 * 16; // 4x4 matrix
	const uniformBuffer = device.createBuffer({
		size: uniformBufferSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const uniformBindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: uniformBuffer }],
	});

	const renderPassDescriptor = {
		colorAttachments: [
			{
				view: undefined, // Assigned later
				clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
				loadOp: 'clear',
				storeOp: 'store',
			},
		],
		depthStencilAttachment: {
				view: undefined,
			depthClearValue: 1.0,
			depthLoadOp: 'clear',
			depthStoreOp: 'store',
		},
	};

	let depthTexture;
	const projectionMatrix = mat4.create();
	const modelMatrix = mat4.create();
	const modelViewProjectionMatrix = mat4.create();
	let aspect = 1;

	const positionNdc = [0.0, 0.0];
	const velocityNdc = [0.34, 0.27];
	const cubeCorners = [
		[-1, -1, -1, 1],
		[1, -1, -1, 1],
		[1, 1, -1, 1],
		[-1, 1, -1, 1],
		[-1, -1, 1, 1],
		[1, -1, 1, 1],
		[1, 1, 1, 1],
		[-1, 1, 1, 1],
	];

	function syncCanvasSize() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.floor(window.innerWidth * dpr));
		const height = Math.max(1, Math.floor(window.innerHeight * dpr));

		if (canvas.width === width && canvas.height === height) {
			return;
		}

		canvas.width = width;
		canvas.height = height;
		aspect = width / height;
		mat4.perspective(fov, aspect, 0.1, 100.0, projectionMatrix);

		if (depthTexture) {
			depthTexture.destroy();
		}

		depthTexture = device.createTexture({
			size: [width, height],
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});

		renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
	}
// Dùng cạnh hộp vàng để va chạm trực tiếp, không cần trừ hao theo tâm.
	const cubeCollisionRadius = 0; 

	function getBounceLimitsNdc() {
		// Viền xanh cố định theo NDC, độc lập với kích thước khối.
		const maxNdcX = Math.max(0, 1 - ndcMargin);
		const maxNdcY = Math.max(0, 1 - ndcMargin);
		return [maxNdcX, maxNdcY];
	}

	function getBoundingBox(mvpMatrix) {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const [x, y, z, w] of cubeCorners) {
			const clipX = mvpMatrix[0] * x + mvpMatrix[4] * y + mvpMatrix[8] * z + mvpMatrix[12] * w;
			const clipY = mvpMatrix[1] * x + mvpMatrix[5] * y + mvpMatrix[9] * z + mvpMatrix[13] * w;
			const clipW = mvpMatrix[3] * x + mvpMatrix[7] * y + mvpMatrix[11] * z + mvpMatrix[15] * w;

			if (clipW <= 0.00001) continue;

			const ndcX = clipX / clipW;
			const ndcY = clipY / clipW;

			minX = Math.min(minX, ndcX);
			minY = Math.min(minY, ndcY);
			maxX = Math.max(maxX, ndcX);
			maxY = Math.max(maxY, ndcY);
		}

		return { minX, minY, maxX, maxY };
	}

	function updatePhysics(dt, timeSeconds) {
		// 1. Di chuyển tạm thời
		positionNdc[0] += velocityNdc[0] * dt;
		positionNdc[1] += velocityNdc[1] * dt;

		// 2. Lấy ma trận nháp và đo Bounding Box vàng
		const tempMatrix = getTransformationMatrix(timeSeconds);
		const bbox = getBoundingBox(tempMatrix);

		// 3. Lấy giới hạn của viền xanh
		const [maxNdcX, maxNdcY] = getBounceLimitsNdc();

		let bounced = false;

		// 4. Kiểm tra mép hộp vàng so với viền xanh (Trục X)
		if (bbox.maxX > maxNdcX) {
			positionNdc[0] -= (bbox.maxX - maxNdcX);
			velocityNdc[0] *= -1;
			bounced = true;
		} else if (bbox.minX < -maxNdcX) {
			positionNdc[0] += (-maxNdcX - bbox.minX);
			velocityNdc[0] *= -1;
			bounced = true;
		}

		// 5. Kiểm tra trục Y
		if (bbox.maxY > maxNdcY) {
			positionNdc[1] -= (bbox.maxY - maxNdcY);
			velocityNdc[1] *= -1;
			bounced = true;
		} else if (bbox.minY < -maxNdcY) {
			positionNdc[1] += (-maxNdcY - bbox.minY);
			velocityNdc[1] *= -1;
			bounced = true;
		}

		// 6. Nếu có nảy, cần tính toán lại ma trận và Bounding Box để vẽ cho chuẩn
		if (bounced) {
			const finalMatrix = getTransformationMatrix(timeSeconds);
			return { matrix: finalMatrix, bbox: getBoundingBox(finalMatrix) };
		}

		return { matrix: tempMatrix, bbox };
	}

	function updateCollisionBorder() {
		const [maxNdcX, maxNdcY] = getBounceLimitsNdc();
		collisionBorderArray.set([
			-maxNdcX, -maxNdcY,
			maxNdcX, -maxNdcY,
			maxNdcX, -maxNdcY,
			maxNdcX, maxNdcY,
			maxNdcX, maxNdcY,
			-maxNdcX, maxNdcY,
			-maxNdcX, maxNdcY,
			-maxNdcX, -maxNdcY,
		]);

		device.queue.writeBuffer(collisionBorderBuffer, 0, collisionBorderArray);
	}

	function getTransformationMatrix(timeSeconds) {
		const halfViewHeight = Math.tan(fov * 0.5) * zDistance;
		const halfViewWidth = halfViewHeight * aspect;

		const worldX = positionNdc[0] * halfViewWidth;
		const worldY = positionNdc[1] * halfViewHeight;

		mat4.identity(modelMatrix);
		mat4.translate(modelMatrix, [worldX, worldY, -zDistance], modelMatrix);
		mat4.rotateX(modelMatrix, timeSeconds * 1.45, modelMatrix);
		mat4.rotateY(modelMatrix, timeSeconds * 1.1, modelMatrix);
		mat4.rotateZ(modelMatrix, timeSeconds * 0.65, modelMatrix);
		mat4.multiply(projectionMatrix, modelMatrix, modelViewProjectionMatrix);

		return modelViewProjectionMatrix;
	}

	function updateScreenSpaceBoundingBox(bbox) {
		if (!Number.isFinite(bbox.minX)) return;

		let { minX, minY, maxX, maxY } = bbox;
		// Ép giới hạn để hộp không tràn ra khỏi màn hình
		minX = Math.max(-1, Math.min(1, minX));
		minY = Math.max(-1, Math.min(1, minY));
		maxX = Math.max(-1, Math.min(1, maxX));
		maxY = Math.max(-1, Math.min(1, maxY));

		bboxLineArray.set([
			minX, minY,
			maxX, minY,
			maxX, minY,
			maxX, maxY,
			maxX, maxY,
			minX, maxY,
			minX, maxY,
			minX, minY,
		]);

		device.queue.writeBuffer(bboxBuffer, 0, bboxLineArray);
	}

	syncCanvasSize();
	window.addEventListener('resize', syncCanvasSize);

	let lastTime = performance.now() * 0.001;

	function frame(nowMs) {
		syncCanvasSize();

		const now = nowMs * 0.001;
		const dt = Math.min(maxDt, Math.max(0, now - lastTime));
		lastTime = now;

		const { matrix: transformationMatrix, bbox } = updatePhysics(dt, now);

		device.queue.writeBuffer(
			uniformBuffer,
			0,
			transformationMatrix.buffer,
			transformationMatrix.byteOffset,
			transformationMatrix.byteLength
		);
		updateScreenSpaceBoundingBox(bbox);
		updateCollisionBorder();
		renderPassDescriptor.colorAttachments[0].view = context
			.getCurrentTexture()
			.createView();

		const commandEncoder = device.createCommandEncoder();
		const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
		passEncoder.setPipeline(pipeline);
		passEncoder.setBindGroup(0, uniformBindGroup);
		passEncoder.setVertexBuffer(0, verticesBuffer);
		passEncoder.draw(cubeVertexCount);
		if (showBoundingBoxes) {
			passEncoder.setPipeline(bboxPipeline);
			passEncoder.setVertexBuffer(0, bboxBuffer);
			passEncoder.draw(bboxVertexCount);

			passEncoder.setPipeline(collisionBorderPipeline);
			passEncoder.setVertexBuffer(0, collisionBorderBuffer);
			passEncoder.draw(collisionBorderVertexCount);
		}
		passEncoder.end();
		device.queue.submit([commandEncoder.finish()]);

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

init().catch(console.error);

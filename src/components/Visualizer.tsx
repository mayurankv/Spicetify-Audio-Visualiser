import React, { useCallback, useMemo } from "react";
import { fragmentShader as BLUR_FRAG_SHADER, vertexShader as BLUR_VERT_SHADER } from "../shaders/blur";
import { fragmentShader as FINALIZE_FRAG_SHADER, vertexShader as FINALIZE_VERT_SHADER } from "../shaders/finalize";
import { fragmentShader as PARTICLE_FRAG_SHADER, vertexShader as PARTICLE_VERT_SHADER } from "../shaders/particle";
import { decibelsToAmplitude, mapLinear, sampleAmplitudeMovingAverage, sumArrays } from '../utils';
import AnimatedCanvas from "./AnimatedCanvas";

type CanvasData = {
	themeColor: Spicetify.Color;
	seed: number;
	spectrumCurve: {
		x: number;
		y: number[];
	}[];
};

type RendererState =
	| {
			isError: true;
	  }
	| {
			isError: false;
			particleShader: WebGLProgram;
			blurShader: WebGLProgram;
			finalizeShader: WebGLProgram;
			viewportSize: number;

			inPositionLoc: number;
			inPositionLocBlur: number;
			inPositionLocFinalize: number;

			uScaledTimeLoc: WebGLUniformLocation;
			uSpectrumLoc: WebGLUniformLocation;
			uSeedLoc: WebGLUniformLocation;
			uDotCountLoc: WebGLUniformLocation;
			uDotRadiusLoc: WebGLUniformLocation;
			uDotRadiusPXLoc: WebGLUniformLocation;
			uDotSpacingLoc: WebGLUniformLocation;
			uDotOffsetLoc: WebGLUniformLocation;
			uNoiseFrequencyLoc: WebGLUniformLocation;
			uNoiseAmplitudeLoc: WebGLUniformLocation;

			uBlurRadiusLoc: WebGLUniformLocation;
			uBlurDirectionLoc: WebGLUniformLocation;
			uBlurInputTextureLoc: WebGLUniformLocation;

			uOutputColorLoc: WebGLUniformLocation;
			uBlurredTextureLoc: WebGLUniformLocation;
			uOriginalTextureLoc: WebGLUniformLocation;

			quadBuffer: WebGLBuffer;

			particleFramebuffer: WebGLFramebuffer;
			particleTexture: WebGLTexture;
			blurXFramebuffer: WebGLFramebuffer;
			blurXTexture: WebGLTexture;
			blurYFramebuffer: WebGLFramebuffer;
			blurYTexture: WebGLTexture;
	  };

export default function Visualizer(props: {
	isEnabled: boolean;
	onError: (msg: string) => void;
	themeColor: Spicetify.Color;
	audioAnalysis?: SpotifyAudioAnalysis;
}) {
	const spectrumCurve = useMemo(() => {
		const TIMBREBASES = [
			[[1]]
		];



		const numSubSegments = TIMBREBASES[0][0].length; //154
		const numFrequencies = TIMBREBASES[0].length;  //110

		if (!props.audioAnalysis) return [{ x: 0, y: new Array(numFrequencies).fill(0) }];

		const segments = props.audioAnalysis.segments;

		const spectrumCurve: {x: number, y: number[]}[] = segments.flatMap(segment => [...Array(numSubSegments).keys()].map(subSegment_num => { return { x: (segment.start + (2 * subSegment_num + 1) * (segment.duration / (2 * numSubSegments))), y: sumArrays(segment.timbre.map((timbre_val, timbre_num) => [...Array(numFrequencies).keys()].map(f_num => TIMBREBASES[timbre_num][f_num][subSegment_num] * timbre_val))) } }));

		return spectrumCurve;
	}, [props.audioAnalysis]);

	const seed = props.audioAnalysis?.meta.timestamp ?? 0;

	const onInit = useCallback((gl: WebGL2RenderingContext | null): RendererState => {
		if (!gl) {
			props.onError("Error: WebGL2 is not supported");
			return { isError: true };
		}

		const createShader = (type: number, source: string, name: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);

			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
				const msg = `Error: Failed to compile ${name} shader`;
				const log = gl.getShaderInfoLog(shader);
				console.error(msg, log);

				props.onError(msg);
				return null;
			}

			return shader;
		};

		const createProgram = (vertShader: WebGLShader, fragShader: WebGLShader, name: string) => {
			const shader = gl.createProgram()!;
			gl.attachShader(shader, vertShader);
			gl.attachShader(shader, fragShader);
			gl.linkProgram(shader);

			if (!gl.getProgramParameter(shader, gl.LINK_STATUS) && !gl.isContextLost()) {
				const msg = `Error: Failed to link ${name} shader`;
				const log = gl.getProgramInfoLog(shader);
				console.error(msg, log);

				props.onError(msg);
				return null;
			}

			return shader;
		};

		const createFramebuffer = (filter: number) => {
			const framebuffer = gl.createFramebuffer()!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

			return { framebuffer, texture };
		};

		const particleVertShader = createShader(gl.VERTEX_SHADER, PARTICLE_VERT_SHADER, "particle vertex");
		if (!particleVertShader) return { isError: true };
		const particleFragShader = createShader(gl.FRAGMENT_SHADER, PARTICLE_FRAG_SHADER, "particle fragment");
		if (!particleFragShader) return { isError: true };
		const particleShader = createProgram(particleVertShader, particleFragShader, "particle");
		if (!particleShader) return { isError: true };

		const inPositionLoc = gl.getAttribLocation(particleShader, "inPosition")!;
		const uScaledTimeLoc = gl.getUniformLocation(particleShader, "uScaledTime")!;
		const uSpectrumLoc = gl.getUniformLocation(particleShader, "uSpectrum")!;
		const uSeedLoc = gl.getUniformLocation(particleShader, "uSeed")!;
		const uDotCountLoc = gl.getUniformLocation(particleShader, "uDotCount")!;
		const uDotRadiusLoc = gl.getUniformLocation(particleShader, "uDotRadius")!;
		const uDotRadiusPXLoc = gl.getUniformLocation(particleShader, "uDotRadiusPX")!;
		const uDotSpacingLoc = gl.getUniformLocation(particleShader, "uDotSpacing")!;
		const uDotOffsetLoc = gl.getUniformLocation(particleShader, "uDotOffset")!;
		const uNoiseFrequencyLoc = gl.getUniformLocation(particleShader, "uNoiseFrequency")!;
		const uNoiseAmplitudeLoc = gl.getUniformLocation(particleShader, "uNoiseAmplitude")!;

		const blurVertShader = createShader(gl.VERTEX_SHADER, BLUR_VERT_SHADER, "blur vertex");
		if (!blurVertShader) return { isError: true };
		const blurFragShader = createShader(gl.FRAGMENT_SHADER, BLUR_FRAG_SHADER, "blur fragment");
		if (!blurFragShader) return { isError: true };
		const blurShader = createProgram(blurVertShader, blurFragShader, "blur");
		if (!blurShader) return { isError: true };

		const inPositionLocBlur = gl.getAttribLocation(blurShader, "inPosition")!;
		const uBlurRadiusLoc = gl.getUniformLocation(blurShader, "uBlurRadius")!;
		const uBlurDirectionLoc = gl.getUniformLocation(blurShader, "uBlurDirection")!;
		const uBlurInputTextureLoc = gl.getUniformLocation(blurShader, "uInputTexture")!;

		const finalizeVertShader = createShader(gl.VERTEX_SHADER, FINALIZE_VERT_SHADER, "finalize vertex");
		if (!finalizeVertShader) return { isError: true };
		const finalizeFragShader = createShader(gl.FRAGMENT_SHADER, FINALIZE_FRAG_SHADER, "finalize fragment");
		if (!finalizeFragShader) return { isError: true };
		const finalizeShader = createProgram(finalizeVertShader, finalizeFragShader, "finalize");
		if (!finalizeShader) return { isError: true };

		const inPositionLocFinalize = gl.getAttribLocation(finalizeShader, "inPosition")!;
		const uOutputColorLoc = gl.getUniformLocation(finalizeShader, "uOutputColor")!;
		const uBlurredTextureLoc = gl.getUniformLocation(finalizeShader, "uBlurredTexture")!;
		const uOriginalTextureLoc = gl.getUniformLocation(finalizeShader, "uOriginalTexture")!;

		const { framebuffer: particleFramebuffer, texture: particleTexture } = createFramebuffer(gl.LINEAR);
		const { framebuffer: blurXFramebuffer, texture: blurXTexture } = createFramebuffer(gl.LINEAR);
		const { framebuffer: blurYFramebuffer, texture: blurYTexture } = createFramebuffer(gl.NEAREST);

		const quadBuffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		// prettier-ignore
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    		-1, -1,
    		-1,  1,
			 1,  1,
    		 1, -1
		]), gl.STATIC_DRAW);

		gl.enable(gl.BLEND);
		gl.blendEquation(gl.MAX);

		return {
			isError: false,
			particleShader,
			blurShader,
			finalizeShader,
			viewportSize: 0,

			inPositionLoc,
			inPositionLocBlur,
			inPositionLocFinalize,

			uScaledTimeLoc,
			uSpectrumLoc,
			uSeedLoc,
			uDotCountLoc,
			uDotRadiusLoc,
			uDotRadiusPXLoc,
			uDotSpacingLoc,
			uDotOffsetLoc,
			uNoiseFrequencyLoc,
			uNoiseAmplitudeLoc,

			uBlurRadiusLoc,
			uBlurDirectionLoc,
			uBlurInputTextureLoc,

			uOutputColorLoc,
			uBlurredTextureLoc,
			uOriginalTextureLoc,

			quadBuffer,

			particleFramebuffer,
			particleTexture,
			blurXFramebuffer,
			blurXTexture,
			blurYFramebuffer,
			blurYTexture
		};
	}, []);

	const onResize = useCallback((gl: WebGL2RenderingContext | null, state: RendererState) => {
		if (state.isError || !gl) return;

		state.viewportSize = Math.min(gl.canvas.width, gl.canvas.height);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		gl.bindTexture(gl.TEXTURE_2D, state.particleTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, state.viewportSize, state.viewportSize, 0, gl.RED, gl.UNSIGNED_BYTE, null);

		gl.bindTexture(gl.TEXTURE_2D, state.blurXTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, state.viewportSize, state.viewportSize, 0, gl.RED, gl.UNSIGNED_BYTE, null);

		gl.bindTexture(gl.TEXTURE_2D, state.blurYTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, state.viewportSize, state.viewportSize, 0, gl.RED, gl.UNSIGNED_BYTE, null);
	}, []);

	const onRender = useCallback((gl: WebGL2RenderingContext | null, data: CanvasData, state: RendererState) => {
		if (state.isError || !gl) return;

		// render particles
		gl.bindFramebuffer(gl.FRAMEBUFFER, state.particleFramebuffer);

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		const uScaledTime = (Spicetify.Player.getProgress() / 1000) * 75 * 0.01;
		const uSpectrum = sampleSpectrumMovingAverage(data.spectrumCurve, Spicetify.Player.getProgress() / 1000, 0.15);
		const uSeed = data.seed;
		const uDotCount = 100;
		const uDotRadius = 0.9 / uDotCount;
		const uDotRadiusPX = uDotRadius * 0.5 * state.viewportSize;
		const uDotSpacing = 0.9 / (uDotCount - 1);
		const uDotOffset = -0.9 / 2;
		const uNoiseFrequency = 4 * 0.01;
		const uNoiseAmplitude = 0.2 * 0.9;

		gl.useProgram(state.particleShader);
		gl.uniform1f(state.uScaledTimeLoc, uScaledTime);
		gl.uniform1f(state.uSpectrumLoc, uSpectrum);
		gl.uniform1i(state.uSeedLoc, uSeed);
		gl.uniform1i(state.uDotCountLoc, uDotCount);
		gl.uniform1f(state.uDotRadiusLoc, uDotRadius);
		gl.uniform1f(state.uDotRadiusPXLoc, uDotRadiusPX);
		gl.uniform1f(state.uDotSpacingLoc, uDotSpacing);
		gl.uniform1f(state.uDotOffsetLoc, uDotOffset);
		gl.uniform1f(state.uNoiseFrequencyLoc, uNoiseFrequency);
		gl.uniform1f(state.uNoiseAmplitudeLoc, uNoiseAmplitude);

		gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
		gl.enableVertexAttribArray(state.inPositionLoc);
		gl.vertexAttribPointer(state.inPositionLoc, 2, gl.FLOAT, false, 0, 0);

		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, uDotCount * uDotCount);
		gl.bindTexture(gl.TEXTURE_2D, state.particleTexture);

		// blur in X direction
		gl.bindFramebuffer(gl.FRAMEBUFFER, state.blurXFramebuffer);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.useProgram(state.blurShader);
		gl.uniform1f(state.uBlurRadiusLoc, 0.01 * state.viewportSize);
		gl.uniform2f(state.uBlurDirectionLoc, 1 / state.viewportSize, 0);
		gl.uniform1i(state.uBlurInputTextureLoc, 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state.particleTexture);

		gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
		gl.enableVertexAttribArray(state.inPositionLocBlur);
		gl.vertexAttribPointer(state.inPositionLocBlur, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		// blur in Y direction
		gl.bindFramebuffer(gl.FRAMEBUFFER, state.blurYFramebuffer);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.uniform2f(state.uBlurDirectionLoc, 0, 1 / state.viewportSize);
		gl.bindTexture(gl.TEXTURE_2D, state.blurXTexture);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// combine blurred and original
		gl.useProgram(state.finalizeShader);
		gl.uniform3f(state.uOutputColorLoc, data.themeColor.rgb.r / 255, data.themeColor.rgb.g / 255, data.themeColor.rgb.b / 255);
		gl.uniform1i(state.uBlurredTextureLoc, 0);
		gl.uniform1i(state.uOriginalTextureLoc, 1);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state.blurYTexture);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, state.particleTexture);

		gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuffer);
		gl.enableVertexAttribArray(state.inPositionLocFinalize);
		gl.vertexAttribPointer(state.inPositionLocFinalize, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	}, []);

	return (
		<AnimatedCanvas
			isEnabled={props.isEnabled}
			data={{ themeColor: props.themeColor, seed, spectrumCurve: spectrumCurve }}
			onInit={onInit}
			onResize={onResize}
			onRender={onRender}
		/>
	);
}

import React, { useCallback, useMemo } from "react";
import { fragmentShader as BLUR_FRAG_SHADER, vertexShader as BLUR_VERT_SHADER } from "../shaders/blur";
import { fragmentShader as FINALIZE_FRAG_SHADER, vertexShader as FINALIZE_VERT_SHADER } from "../shaders/finalize";
import { fragmentShader as PARTICLE_FRAG_SHADER, vertexShader as PARTICLE_VERT_SHADER } from "../shaders/particle";
import { sampleSpectrumMovingAverage, sumArrays } from '../utils';
import AnimatedCanvas from "./AnimatedCanvas";

type CanvasData = {
	themeColor: Spicetify.Color;
	seed: number;
	spectrumCurve: {x: number, y: number[]}[];
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
			[[0.54], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53],[0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53],[0.53], [0.53], [0.53], [0.54], [0.54], [0.54], [0.54], [0.53], [0.54], [0.54], [0.54],[0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.53], [0.53],[0.53], [0.53], [0.53], [0.53], [0.53], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54],[0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54],[0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53],[0.53], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.53], [0.53], [0.53],[0.53], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54],[0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.53], [0.54]],
			[[0.1] , [0.11], [0.13], [0.15], [0.16], [0.16], [0.16], [0.15], [0.14], [0.14], [0.14],[0.14], [0.14], [0.14], [0.14], [0.14], [0.14], [0.15], [0.15], [0.16], [0.16], [0.17],[0.18], [0.19], [0.2] , [0.21], [0.21], [0.22], [0.23], [0.23], [0.23], [0.23], [0.3] ,[0.32], [0.34], [0.34], [0.35], [0.37], [0.39], [0.4] , [0.42], [0.43], [0.45], [0.47],[0.5] , [0.53], [0.54], [0.55], [0.57], [0.58], [0.58], [0.59], [0.59], [0.67], [0.67],[0.68], [0.69], [0.69], [0.7] , [0.71], [0.72], [0.73], [0.73], [0.74], [0.76], [0.77],[0.77], [0.78], [0.79], [0.81], [0.82], [0.82], [0.83], [0.83], [0.84], [0.85], [0.86],[0.86], [0.87], [0.88], [0.89], [0.9] , [0.9] , [0.91], [0.93], [0.95], [0.96], [0.96],[0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.96], [0.96],[0.95], [0.95], [0.95], [0.94], [0.94], [0.94], [0.93], [0.93], [0.92], [0.92], [0.91]],
			[[0.81], [0.75], [0.55], [0.56], [0.57], [0.57], [0.57], [0.56], [0.56], [0.55], [0.54],[0.53], [0.52], [0.51], [0.5] , [0.48], [0.47], [0.45], [0.44], [0.42], [0.4] , [0.39],[0.37], [0.35], [0.34], [0.32], [0.3] , [0.21], [0.21], [0.21], [0.21], [0.2] , [0.2] ,[0.19], [0.19], [0.19], [0.18], [0.18], [0.17], [0.17], [0.16], [0.15], [0.15], [0.14],[0.13], [0.13], [0.13], [0.13], [0.13], [0.12], [0.13], [0.13], [0.13], [0.13], [0.13],[0.13], [0.13], [0.13], [0.14], [0.14], [0.15], [0.15], [0.15], [0.16], [0.17], [0.18],[0.18], [0.18], [0.19], [0.2] , [0.2] , [0.2] , [0.21], [0.21], [0.22], [0.22], [0.23],[0.23], [0.23], [0.23], [0.23], [0.23], [0.23], [0.23], [0.33], [0.37], [0.41], [0.43],[0.46], [0.48], [0.49], [0.5] , [0.52], [0.54], [0.56], [0.57], [0.57], [0.67], [0.69],[0.71], [0.72], [0.74], [0.76], [0.77], [0.81], [0.84], [0.86], [0.88], [0.88], [0.88]],
			[[0.84], [0.78], [0.73], [0.69], [0.66], [0.6] , [0.6] , [0.6] , [0.59], [0.59], [0.58],[0.58], [0.58], [0.57], [0.56], [0.55], [0.55], [0.55], [0.54], [0.53], [0.53], [0.52],[0.51], [0.51], [0.5] , [0.5] , [0.49], [0.48], [0.47], [0.46], [0.45], [0.45], [0.45],[0.44], [0.44], [0.44], [0.44], [0.44], [0.43], [0.43], [0.42], [0.42], [0.42], [0.41],[0.4] , [0.39], [0.39], [0.39], [0.38], [0.37], [0.37], [0.37], [0.37], [0.37], [0.36],[0.36], [0.35], [0.35], [0.35], [0.35], [0.35], [0.35], [0.35], [0.36], [0.36], [0.37],[0.37], [0.37], [0.38], [0.38], [0.39], [0.39], [0.39], [0.39], [0.39], [0.4] , [0.41],[0.42], [0.42], [0.43], [0.43], [0.44], [0.45], [0.47], [0.5] , [0.53], [0.55], [0.56],[0.58], [0.59], [0.6] , [0.64], [0.65], [0.65], [0.66], [0.67], [0.67], [0.69], [0.7] ,[0.71], [0.72], [0.73], [0.73], [0.74], [0.76], [0.77], [0.77], [0.78], [0.78], [0.79]],
			[[0.08], [0.13], [0.17], [0.19], [0.21], [0.21], [0.22], [0.22], [0.23], [0.22], [0.3] ,[0.32], [0.34], [0.36], [0.39], [0.43], [0.46], [0.47], [0.5] , [0.53], [0.57], [0.69],[0.69], [0.7] , [0.7] , [0.72], [0.74], [0.77], [0.79], [0.81], [0.81], [0.82], [0.84],[0.87], [0.89], [0.9] , [0.9] , [0.91], [0.92], [0.92], [0.93], [0.93], [0.92], [0.91],[0.9] , [0.89], [0.88], [0.87], [0.84], [0.8] , [0.79], [0.79], [0.77], [0.76], [0.74],[0.72], [0.71], [0.69], [0.68], [0.58], [0.55], [0.53], [0.52], [0.5] , [0.46], [0.42],[0.42], [0.41], [0.38], [0.35], [0.33], [0.32], [0.31], [0.3] , [0.29], [0.23], [0.23],[0.23], [0.23], [0.24], [0.24], [0.24], [0.24], [0.23], [0.23], [0.23], [0.23], [0.28],[0.3] , [0.32], [0.33], [0.35], [0.38], [0.41], [0.45], [0.47], [0.49], [0.53], [0.71],[0.73], [0.73], [0.75], [0.77], [0.79], [0.83], [0.86], [0.89], [0.91], [0.92], [0.92]],
			[[0.97], [0.97], [0.97], [0.97], [0.97], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98],[0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99],[0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99], [0.99],[0.99], [0.99], [0.99], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98],[0.97], [0.97], [0.97], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98],[0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98],[0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98], [0.98],[0.98], [0.98], [0.98], [0.98], [0.97], [0.97], [0.96], [0.93], [0.9] , [0.88], [0.86],[0.84], [0.82], [0.81], [0.79], [0.78], [0.77], [0.76], [0.74], [0.71], [0.7] , [0.7] ,[0.69], [0.69], [0.69], [0.69], [0.69], [0.71], [0.72], [0.73], [0.73], [0.74], [0.75]],
			[[0.84], [0.77], [0.71], [0.68], [0.65], [0.64], [0.64], [0.64], [0.65], [0.65], [0.66],[0.67], [0.68], [0.68], [0.69], [0.69], [0.69], [0.7] , [0.7] , [0.71], [0.71], [0.72],[0.73], [0.74], [0.74], [0.75], [0.75], [0.76], [0.75], [0.75], [0.76], [0.76], [0.76],[0.76], [0.76], [0.75], [0.75], [0.74], [0.74], [0.74], [0.73], [0.73], [0.71], [0.69],[0.67], [0.65], [0.65], [0.65], [0.61], [0.57], [0.55], [0.53], [0.51], [0.48], [0.46],[0.42], [0.39], [0.37], [0.35], [0.32], [0.29], [0.27], [0.24], [0.24], [0.24], [0.24],[0.24], [0.24], [0.27], [0.29], [0.31], [0.33], [0.34], [0.35], [0.38], [0.42], [0.45],[0.47], [0.48], [0.53], [0.58], [0.64], [0.64], [0.67], [0.76], [0.82], [0.87], [0.9] ,[0.91], [0.91], [0.91], [0.91], [0.91], [0.91], [0.91], [0.91], [0.9] , [0.88], [0.86],[0.84], [0.84], [0.82], [0.78], [0.5] , [0.45], [0.41], [0.39], [0.16], [0.14], [0.13]],
			[[0.77], [0.5] , [0.52], [0.53], [0.54], [0.55], [0.55], [0.55], [0.56], [0.56], [0.56],[0.57], [0.57], [0.57], [0.58], [0.58], [0.58], [0.59], [0.59], [0.59], [0.59], [0.6] ,[0.61], [0.65], [0.65], [0.65], [0.65], [0.65], [0.64], [0.64], [0.64], [0.64], [0.64],[0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.65], [0.65], [0.65], [0.64],[0.6] , [0.6] , [0.61], [0.65], [0.6] , [0.59], [0.58], [0.58], [0.58], [0.57], [0.57],[0.56], [0.55], [0.55], [0.55], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54], [0.54],[0.54], [0.55], [0.55], [0.56], [0.56], [0.57], [0.57], [0.57], [0.58], [0.58], [0.59],[0.59], [0.6] , [0.6] , [0.61], [0.64], [0.64], [0.64], [0.64], [0.65], [0.65], [0.65],[0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.65], [0.64], [0.64],[0.65], [0.66], [0.67], [0.58], [0.56], [0.54], [0.53], [0.52], [0.52], [0.51], [0.51]],
			[[0.99], [0.98], [0.98], [0.97], [0.96], [0.94], [0.92], [0.9] , [0.88], [0.85], [0.84],[0.82], [0.78], [0.74], [0.71], [0.68], [0.67], [0.68], [0.69], [0.54], [0.51], [0.47],[0.45], [0.42], [0.4] , [0.37], [0.34], [0.31], [0.23], [0.23], [0.23], [0.23], [0.3] ,[0.33], [0.35], [0.36], [0.37], [0.41], [0.44], [0.47], [0.5] , [0.52], [0.54], [0.57],[0.64], [0.64], [0.64], [0.64], [0.66], [0.68], [0.68], [0.68], [0.68], [0.69], [0.69],[0.7] , [0.7] , [0.69], [0.69], [0.57], [0.53], [0.52], [0.51], [0.48], [0.4] , [0.34],[0.33], [0.32], [0.2] , [0.19], [0.17], [0.17], [0.16], [0.14], [0.13], [0.1] , [0.08],[0.08], [0.07], [0.05], [0.02], 0.  , 0.  , [0.03], [0.11], [0.18], [0.21], [0.32],[0.34], [0.36], [0.37], [0.38], [0.39], [0.41], [0.43], [0.44], [0.44], [0.42], [0.4] ,[0.39], [0.39], [0.38], [0.36], [0.34], [0.21], [0.2] , [0.19], [0.18], [0.17], [0.17]],
			[[0.03], [0.02], [0.01], [0.02], [0.02], [0.02], [0.02], [0.02], [0.02], [0.02], [0.03],[0.03], [0.03], [0.04], [0.05], [0.06], [0.07], [0.08], [0.09], [0.1] , [0.11], [0.13],[0.14], [0.16], [0.17], [0.18], [0.19], [0.2] , [0.34], [0.35], [0.37], [0.38], [0.41],[0.44], [0.47], [0.48], [0.5] , [0.52], [0.55], [0.58], [0.6] , [0.67], [0.69], [0.71],[0.75], [0.77], [0.78], [0.79], [0.8] , [0.81], [0.81], [0.81], [0.81], [0.82], [0.83],[0.84], [0.85], [0.86], [0.86], [0.86], [0.87], [0.87], [0.88], [0.88], [0.88], [0.89],[0.89], [0.89], [0.89], [0.89], [0.89], [0.89], [0.89], [0.88], [0.88], [0.88], [0.88],[0.88], [0.88], [0.88], [0.88], [0.88], [0.89], [0.9] , [0.93], [0.95], [0.96], [0.97],[0.97], [0.98], [0.98], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.96], [0.96],[0.95], [0.94], [0.94], [0.93], [0.92], [0.91], [0.91], [0.9] , [0.9] , [0.89], [0.88]],
			[[0.98], [0.98], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97], [0.97],[0.97], [0.97], [0.97], [0.97], [0.97], [0.96], [0.96], [0.96], [0.95], [0.95], [0.95],[0.94], [0.94], [0.94], [0.93], [0.93], [0.92], [0.91], [0.91], [0.9] , [0.89], [0.89],[0.88], [0.87], [0.86], [0.86], [0.86], [0.85], [0.84], [0.83], [0.81], [0.8] , [0.77],[0.76], [0.74], [0.73], [0.72], [0.71], [0.71], [0.71], [0.71], [0.71], [0.7] , [0.69],[0.69], [0.68], [0.68], [0.68], [0.67], [0.66], [0.66], [0.66], [0.65], [0.64], [0.64],[0.64], [0.64], [0.64], [0.64], [0.64], [0.64], [0.63], [0.63], [0.64], [0.65], [0.66],[0.66], [0.67], [0.66], [0.65], [0.65], [0.65], [0.65], [0.65], [0.65], [0.64], [0.64],[0.59], [0.58], [0.56], [0.55], [0.54], [0.53], [0.52], [0.52], [0.52], [0.53], [0.54],[0.55], [0.57], [0.58], [0.6] , [0.66], [0.69], [0.7] , [0.72], [0.73], [0.74], [0.75]],
			[[0.78], [0.5] , [0.51], [0.52], [0.53], [0.52], [0.5] , [0.48], [0.47], [0.44], [0.42],[0.39], [0.37], [0.34], [0.31], [0.23], [0.22], [0.22], [0.22], [0.22], [0.22], [0.22],[0.22], [0.22], [0.22], [0.22], [0.22], [0.22], [0.22], [0.3] , [0.3] , [0.32], [0.37],[0.43], [0.47], [0.49], [0.51], [0.55], [0.58], [0.61], [0.65], [0.66], [0.68], [0.69],[0.72], [0.73], [0.74], [0.73], [0.7] , [0.67], [0.66], [0.66], [0.59], [0.54], [0.5] ,[0.46], [0.42], [0.4] , [0.38], [0.33], [0.19], [0.18], [0.18], [0.18], [0.17], [0.17],[0.17], [0.18], [0.2] , [0.35], [0.38], [0.4] , [0.42], [0.44], [0.49], [0.72], [0.74],[0.75], [0.76], [0.79], [0.83], [0.86], [0.86], [0.86], [0.84], [0.81], [0.78], [0.75],[0.73], [0.5] , [0.47], [0.44], [0.4] , [0.34], [0.22], [0.23], [0.24], [0.27], [0.27],[0.28], [0.3] , [0.33], [0.37], [0.42], [0.46], [0.5] , [0.52], [0.54], [0.74], [0.79]],
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
		const uDotCount = 2;
		const uDotRadius = 0.9 / uDotCount;
		const uDotRadiusPX = uDotRadius * 0.5 * state.viewportSize;
		const uDotSpacing = 0.9 / (uDotCount - 1);
		const uDotOffset = -0.9 / 2;
		const uNoiseFrequency = 4 * 0.01;
		const uNoiseAmplitude = 0.2 * 0.9;

		gl.useProgram(state.particleShader);
		gl.uniform1f(state.uScaledTimeLoc, uScaledTime);
		gl.uniform1fv(state.uSpectrumLoc, uSpectrum);
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

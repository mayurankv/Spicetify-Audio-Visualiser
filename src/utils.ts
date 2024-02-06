export function findPointIndex(amplitudeCurve: {x: number, y: number[]}[], position: number): number {
	let lowerBound = 0;
	let upperBound = amplitudeCurve.length;

	while (upperBound - lowerBound > 1) {
		const testIndex = Math.floor((upperBound + lowerBound) / 2);
		const pointPos = amplitudeCurve[testIndex].x;

		if (pointPos <= position) lowerBound = testIndex;
		else upperBound = testIndex;
	}

	return lowerBound;
}

export function smoothstep(x: number): number {
	return x * x * (3 - 2 * x);
}



export function sumArrays(...arrays: any[]) {
	const n = arrays.reduce((max, xs) => Math.max(max, xs.length), 0);
	const result = Array.from({ length: n });
	return result.map((_, i) => arrays.map(xs => xs[i] || 0).reduce((sum, x) => sum + x, 0));
}

export function mapLinear(value: number, iMin: number, iMax: number, oMin: number[], oMax: number[]): number[] {
	value = (value - iMin) / (iMax - iMin);
	return sumArrays(oMax.map(function (x) { return x * value; }), oMin.map(function (x) { return x * (1 - value); }));
}

// calculate the integral of the linear function through p1 and p2 between p1.x and p2.x
export function integrateLinearFunction(p1: {x: number, y: number[]}, p2: {x: number, y: number[]}): number[] {
	return sumArrays(p1.y, p2.y).map(function (x) { return x * 0.5 * (p2.x - p1.x) });
}

export function sampleSpectrumMovingAverage(spectrumCurve: {x: number, y: number[]}[], position: number, windowSize: number): number[] {
	if (windowSize == 0) return spectrumCurve[findPointIndex(spectrumCurve, position)].y;

	const windowStart = position - windowSize / 2;
	const windowEnd = position + windowSize / 2;
	const windowStartIndex = findPointIndex(spectrumCurve, windowStart);
	const windowEndIndex = findPointIndex(spectrumCurve, windowEnd);

	if (windowStartIndex == windowEndIndex) {
		const p1 = spectrumCurve[windowStartIndex];

		if (windowStartIndex > spectrumCurve.length - 2) return p1.y;
		const p2 = spectrumCurve[windowStartIndex + 1];

		const yA = mapLinear(windowStart, p1.x, p2.x, p1.y, p2.y);
		const yB = mapLinear(windowEnd, p1.x, p2.x, p1.y, p2.y);

		return sumArrays(yA,yB).map(function (x) { return x / 2; });
	} else {
		let p1 = spectrumCurve[windowStartIndex];
		let p2 = spectrumCurve[windowStartIndex + 1];

		let p = { x: windowStart, y: mapLinear(windowStart, p1.x, p2.x, p1.y, p2.y) };
		let integral = integrateLinearFunction(p, p2);

		for (let i = windowStartIndex + 1; i < windowEndIndex; i++) {
			p1 = p2;
			p2 = spectrumCurve[i + 1];

			integral = sumArrays(integral,integrateLinearFunction(p1, p2));
		}

		p1 = p2;
		if (windowEndIndex > spectrumCurve.length - 2) {
			integral = sumArrays(integral,p1.y.map(function (x) { return x * (windowEnd - p1.x) }));
		} else {
			p2 = spectrumCurve[windowEndIndex + 1];
			p = { x: windowEnd, y: mapLinear(windowEnd, p1.x, p2.x, p1.y, p2.y) };
			integral = sumArrays(integral,integrateLinearFunction(p1, p));
		}

		return integral.map(function (x) { return x / windowSize; });
	}
}

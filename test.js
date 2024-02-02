let audioAnalysis = await Spicetify.getAudioData()

function decibelsToAmplitude(decibels) {
	return Math.pow(10, decibels / 20);
}

function getAmplitudeCurve(audioAnalysis) {
	if (!audioAnalysis) return [{ x: 0, y: 0 }];

	const segments = audioAnalysis.segments;

	const amplitudeCurve = segments.flatMap(segment =>
		segment.loudness_max_time ? [
				{ x: segment.start, y: decibelsToAmplitude(segment.loudness_start) },
				{ x: segment.start + segment.loudness_max_time, y: decibelsToAmplitude(segment.loudness_max) }
		] : [
				{ x: segment.start, y: decibelsToAmplitude(segment.loudness_start) }
		]
	);

	if (segments.length) {
		const lastSegment = segments[segments.length - 1];
		amplitudeCurve.push({
			x: lastSegment.start + lastSegment.duration,
			y: decibelsToAmplitude(lastSegment.loudness_end)
		});
	}

	return amplitudeCurve;
};

let amplitudeCurve = getAmplitudeCurve(audioAnalysis)

function sampleAmplitudeMovingAverage(amplitudeCurve, position, windowSize) {
	if (windowSize == 0) return calculateAmplitude(amplitudeCurve, position);

	const windowStart = position - windowSize / 2;
	const windowEnd = position + windowSize / 2;
	const windowStartIndex = findPointIndex(amplitudeCurve, windowStart);
	const windowEndIndex = findPointIndex(amplitudeCurve, windowEnd);

	let integral = 0;
	if (windowStartIndex == windowEndIndex) {
		const p1 = amplitudeCurve[windowStartIndex];

		if (windowStartIndex > amplitudeCurve.length - 2) return p1.y;
		const p2 = amplitudeCurve[windowStartIndex + 1];

		const yA = mapLinear(windowStart, p1.x, p2.x, p1.y, p2.y);
		const yB = mapLinear(windowEnd, p1.x, p2.x, p1.y, p2.y);

		return (yA + yB) / 2;
	} else {
		let p1 = amplitudeCurve[windowStartIndex];
		let p2 = amplitudeCurve[windowStartIndex + 1];

		let p = { x: windowStart, y: mapLinear(windowStart, p1.x, p2.x, p1.y, p2.y) };
		integral = integrateLinearFunction(p, p2);

		for (let i = windowStartIndex + 1; i < windowEndIndex; i++) {
			p1 = p2;
			p2 = amplitudeCurve[i + 1];

			integral += integrateLinearFunction(p1, p2);
		}

		p1 = p2;
		if (windowEndIndex > amplitudeCurve.length - 2) {
			integral += p1.y * (windowEnd - p1.x);
		} else {
			p2 = amplitudeCurve[windowEndIndex + 1];
			p = { x: windowEnd, y: mapLinear(windowEnd, p1.x, p2.x, p1.y, p2.y) };
			integral += integrateLinearFunction(p1, p);
		}
	}

	return integral / windowSize;
}

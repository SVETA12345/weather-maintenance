export function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(
            JSON.stringify({
                time: new Date().toISOString(),
                level: 'info',
                requestId: req.id,
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
            }),
        );
    });
    next();
}
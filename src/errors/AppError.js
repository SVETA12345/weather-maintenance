export class AppError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
        this.details = details;
        Error.captureStackTrace?.(this, this.constructor);
    }
}
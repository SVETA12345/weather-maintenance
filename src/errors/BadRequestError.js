import { AppError } from './AppError.js';

export class BadRequestError extends AppError {
    constructor(message = 'Некорректные параметры запроса', code = 'BAD_REQUEST', details) {
        super(message, { status: 400, code, details });
    }
}

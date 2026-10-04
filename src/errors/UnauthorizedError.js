import { AppError } from './AppError.js';

export class UnauthorizedError extends AppError {
    constructor(message = 'Требуется авторизация', code = 'UNAUTHORIZED') {
        super(message, { status: 401, code });
    }
}
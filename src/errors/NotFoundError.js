import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
    constructor(resource = 'Ресурс') {
        super(`${resource} не найден`, { status: 404, code: 'NOT_FOUND' });
    }
}